// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAuth, type Grants } from "../auth";
import type { Db } from "../db";
import { readEnv } from "../env";
import { createDiscoveryCache, type SsoClient } from "./oidc";
import { ssoRedirectUri } from "./sign-in";

vi.mock("../db", async () => ({
  schema: { ...(await import("../db/schema")), ...(await import("../db/oauth-schema")) },
}));

const ISSUER = "https://login.microsoftonline.com/t1/v2.0";
const STALWART_ISSUER = "https://kontext.test";
const client: SsoClient = {
  issuer: ISSUER,
  clientId: "kontext-app",
  clientSecret: "geheim",
  scopes: "openid email offline_access",
};

const env = readEnv({
  BETTER_AUTH_SECRET: "x".repeat(48),
  BETTER_AUTH_URL: "https://kontext.test",
  STALWART_URL: "http://stalwart:8080",
});

/** Stalwart sends firma.de to the provider, everything else to itself; the token endpoint says `token`. */
const setup = (token: Response = Response.json({ error: "invalid_grant" }, { status: 400 })) => {
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes("/api/discover/"))
      return Response.json({
        issuer: target.includes("firma.de") ? ISSUER : STALWART_ISSUER,
      });
    if (target.endsWith("/.well-known/openid-configuration"))
      return Response.json({
        issuer: ISSUER,
        authorization_endpoint: "https://login.example/authorize",
        token_endpoint: "https://login.example/token",
      });
    return token.clone();
  }) as unknown as typeof fetch;
  const auth = createAuth(env, {} as Db, {} as Grants, async () => "", undefined, {
    store: { client: async () => client },
    discovery: createDiscoveryCache(fetchFn),
    fetch: fetchFn,
  });
  return { auth, fetchFn };
};

const check = (auth: ReturnType<typeof setup>["auth"], email: string) =>
  auth.handler(
    new Request("https://kontext.test/api/auth/sign-in/sso/check", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://kontext.test" },
      body: JSON.stringify({ email }),
    }),
  );

const get = (auth: ReturnType<typeof setup>["auth"], path: string, cookie?: string) =>
  auth.handler(
    new Request(`https://kontext.test/api/auth${path}`, {
      headers: cookie ? { cookie } : {},
    }),
  );

describe("sign-in with the company account", () => {
  it("is offered for addresses Stalwart sends to the configured provider", async () => {
    const { auth } = setup();
    expect(await (await check(auth, "anna@firma.de")).json()).toEqual({ sso: true });
    expect(await (await check(auth, "anna@privat.de")).json()).toEqual({ sso: false });
  });

  it("sends the browser to the provider with a signed, httpOnly cookie for the way back", async () => {
    const { auth } = setup();
    const response = await get(auth, "/sign-in/sso?email=anna%40firma.de");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe("https://login.example/authorize");
    expect(location.searchParams.get("redirect_uri")).toBe(ssoRedirectUri(env.BETTER_AUTH_URL));
    expect(location.searchParams.get("login_hint")).toBe("anna@firma.de");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/kontext_sso=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/sso/);
    expect(cookie).not.toContain("geheim");
  });

  it("does not start for an address the provider does not serve", async () => {
    const { auth } = setup();
    const response = await get(auth, "/sign-in/sso?email=anna%40privat.de");
    expect(response.headers.get("location")).toBe("/login?sso=unavailable");
  });

  it("comes back to the login page without its cookie, with a wrong state or a refused code", async () => {
    const { auth } = setup();
    expect((await get(auth, "/sso/callback?code=c&state=s")).headers.get("location")).toBe(
      "/login?sso=failed",
    );
    expect((await get(auth, "/sso/callback?error=access_denied")).headers.get("location")).toBe(
      "/login?sso=cancelled",
    );
    const started = await get(auth, "/sign-in/sso?email=anna%40firma.de");
    const cookie = (started.headers.get("set-cookie") ?? "").split(";")[0]!;
    const state = new URL(started.headers.get("location") ?? "").searchParams.get("state");
    expect(
      (await get(auth, "/sso/callback?code=c&state=other", cookie)).headers.get("location"),
    ).toBe("/login?sso=failed");
    // The right state, but the provider refuses the code (invalid_grant).
    expect(
      (await get(auth, `/sso/callback?code=c&state=${state}`, cookie)).headers.get("location"),
    ).toBe("/login?sso=failed");
  });
});
