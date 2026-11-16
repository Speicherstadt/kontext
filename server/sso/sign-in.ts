/**
 * Sign-in with the company account (Stalwart Enterprise): the login page asks
 * POST /api/auth/sign-in/sso/check whether the address goes to the company's identity provider,
 * then sends the browser to GET /api/auth/sign-in/sso?email=…, which redirects to the provider.
 * The provider sends it back to GET /api/auth/sso/callback; the server swaps the code for the
 * provider's tokens, Stalwart checks the access token (its OIDC directory) and names the account,
 * and the session is opened as for a password (open-session.ts). The browser holds only Better
 * Auth's httpOnly cookie, and for the round trip a signed, httpOnly cookie with state and PKCE
 * verifier; the tokens stay on the server.
 *
 * Which addresses go to the provider decides Stalwart: `/api/discover/<address>` names the
 * provider for a domain whose `directoryId` is the OIDC directory (oidc.ts). Kontext only adds
 * the client it is at that provider (store.ts).
 */
import { createAuthEndpoint } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";
import { type NameOf, openSession, type SaveGrant } from "../open-session";
import {
  authorizationUrl,
  type DiscoveryCache,
  exchangeCode,
  type Fetch,
  newAttempt,
  type SsoClient,
  sameIssuer,
  stalwartIssuerFor,
} from "./oidc";
import type { SsoStore } from "./store";

export type SsoSignInDeps = {
  stalwartUrl: string;
  publicUrl: string;
  grants: SaveGrant;
  nameOf: NameOf;
  store: Pick<SsoStore, "client">;
  discovery: DiscoveryCache;
  fetch?: Fetch;
};

/** Where the provider sends the browser back; registered there as the redirect URI. */
export const ssoRedirectUri = (publicUrl: string): string =>
  `${publicUrl.replace(/\/+$/, "")}/api/auth/sso/callback`;

const COOKIE = "kontext_sso";
/** Long enough to sign in at the provider, with its second factor. */
const ATTEMPT_SECONDS = 600;

const attemptSchema = z.object({ state: z.string(), verifier: z.string(), email: z.string() });

/** What the login page shows after coming back (src/routes/login.tsx, `sso`). */
type Outcome = "failed" | "unavailable" | "cancelled";
const toLogin = (outcome: Outcome) => `/login?sso=${outcome}`;

const emailSchema = z.string().trim().toLowerCase().email().max(320);

/** The client for the address when Stalwart sends it to the configured provider, else null. */
export const providerFor = async (
  deps: Pick<SsoSignInDeps, "stalwartUrl" | "store" | "fetch">,
  email: string,
): Promise<SsoClient | null> => {
  const client = await deps.store.client();
  if (!client) return null;
  const issuer = await stalwartIssuerFor(deps.stalwartUrl, email, deps.fetch);
  return issuer && sameIssuer(issuer, client.issuer) ? client : null;
};

export const ssoSignIn = (deps: SsoSignInDeps) => {
  const redirectUri = ssoRedirectUri(deps.publicUrl);
  const cookieOptions = {
    httpOnly: true,
    // The provider's redirect back is a top-level navigation from its site: Lax sends the cookie.
    sameSite: "lax" as const,
    secure: deps.publicUrl.startsWith("https://"),
    path: "/api/auth/sso",
  };
  return {
    id: "sso-sign-in",
    endpoints: {
      /** Whether the address signs in with the company account (no password field then). */
      ssoCheck: createAuthEndpoint(
        "/sign-in/sso/check",
        { method: "POST", body: z.object({ email: emailSchema }) },
        async (ctx) => ctx.json({ sso: Boolean(await providerFor(deps, ctx.body.email)) }),
      ),
      ssoStart: createAuthEndpoint(
        "/sign-in/sso",
        { method: "GET", query: z.object({ email: emailSchema }) },
        async (ctx) => {
          const client = await providerFor(deps, ctx.query.email);
          if (!client) throw ctx.redirect(toLogin("unavailable"));
          const discovery = await deps.discovery(client.issuer);
          if (!discovery) throw ctx.redirect(toLogin("unavailable"));
          const attempt = await newAttempt();
          const value = JSON.stringify({
            state: attempt.state,
            verifier: attempt.verifier,
            email: ctx.query.email,
          });
          await ctx.setSignedCookie(COOKIE, value, ctx.context.secret, {
            ...cookieOptions,
            maxAge: ATTEMPT_SECONDS,
          });
          throw ctx.redirect(
            authorizationUrl(discovery, client, {
              ...attempt,
              redirectUri,
              email: ctx.query.email,
            }),
          );
        },
      ),
      ssoCallback: createAuthEndpoint(
        "/sso/callback",
        {
          method: "GET",
          query: z.object({
            code: z.string().max(4096).optional(),
            state: z.string().max(512).optional(),
            error: z.string().max(200).optional(),
          }),
        },
        async (ctx) => {
          const stored = await ctx.getSignedCookie(COOKIE, ctx.context.secret);
          ctx.setCookie(COOKIE, "", { ...cookieOptions, maxAge: 0 });
          // RFC 6749 4.1.2.1: the person declined or closed the provider's page.
          if (ctx.query.error === "access_denied") throw ctx.redirect(toLogin("cancelled"));
          const attempt = attemptSchema.safeParse(stored ? JSON.parse(stored) : null);
          if (!attempt.success || !ctx.query.code || ctx.query.state !== attempt.data.state)
            throw ctx.redirect(toLogin("failed"));
          const client = await deps.store.client();
          const discovery = client && (await deps.discovery(client.issuer));
          if (!client || !discovery) throw ctx.redirect(toLogin("unavailable"));
          const tokens = await exchangeCode(
            discovery,
            client,
            { code: ctx.query.code, verifier: attempt.data.verifier, redirectUri },
            deps.fetch,
          );
          if (tokens.status !== "ok")
            throw ctx.redirect(toLogin(tokens.status === "rejected" ? "failed" : "unavailable"));
          // Stalwart checks the token here (whoAmI): audience, scopes, the account's domain.
          const opened = await openSession(ctx, deps, tokens.tokens, client.issuer).catch(
            (error: Error) => error,
          );
          if (opened instanceof Error) {
            console.warn(`Anmeldung über Firmenkonto: Stalwart lehnt ab (${opened.message})`);
            throw ctx.redirect(toLogin("failed"));
          }
          throw ctx.redirect("/");
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};
