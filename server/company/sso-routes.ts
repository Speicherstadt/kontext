/**
 * /api/company/sso: Anmeldung über Firmenkonto (SSO) and SCIM, for the Firmenverwaltung. Reads
 * and writes Stalwart's side (sso.ts) and Kontext's client at the provider (sso/store.ts). Only
 * with Stalwart Enterprise: without a license Stalwart ignores per-domain directories and refuses
 * SCIM (`is_enterprise_edition` in crates/common/src/auth/authentication.rs and
 * crates/scim/src/auth.rs of stalwartlabs/stalwart v1.1.0), so nothing is changed then.
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  type Fetch,
  fetchDiscovery,
  type SsoClient,
  sameIssuer,
  stalwartIssuerFor,
} from "../sso/oidc";
import { ssoRedirectUri } from "../sso/sign-in";
import type { SsoStore } from "../sso/store";
import { bad, bodyOf, type Env } from "./context";
import type { EditionCheck } from "./edition";
import type { DirectorySettings, StalwartSso, StalwartSsoView } from "./sso";

export type SsoDeps = {
  stalwart: StalwartSso;
  store: SsoStore;
  stalwartUrl: string;
  /** Kontext's address: the redirect URI and, through Caddy, Stalwart's SCIM endpoint. */
  publicUrl: string;
  fetch?: Fetch;
};

/** Where the provider reaches SCIM: Stalwart's /scim/v2 (scim-proto BASE_PATH), through Caddy. */
export const scimUrlOf = (publicUrl: string) => `${publicUrl.replace(/\/+$/, "")}/scim/v2`;

const text = (max: number) => z.string().trim().max(max);

export const settingsSchema = z.object({
  issuerUrl: z.string().trim().url().max(500),
  clientId: text(300).min(1),
  /** Empty keeps the saved one. */
  clientSecret: text(2000),
  scopes: text(1000).min(1),
  claimUsername: text(100),
  usernameDomain: text(253),
  claimName: text(100),
  claimGroups: text(100),
  audience: text(500),
  tokenCheck: z.enum(["jwt", "userInfo"]),
});

const domainsSchema = z.object({
  domains: z
    .array(z.object({ id: z.string().max(64), sso: z.boolean(), scim: z.boolean() }))
    .max(500),
});

export type SsoView = {
  enterprise: boolean;
  /** false when the server's key may not read directories (setup command not run again). */
  known: boolean;
  directory: DirectorySettings | null;
  client: { clientId: string; scopes: string; hasSecret: boolean } | null;
  domains: StalwartSsoView["domains"];
  redirectUri: string;
  scimUrl: string;
  scimKey: { createdAt: string | null } | null;
};

export type ConnectionTest = {
  provider: { ok: true } | { ok: false; error: string };
  /** Per domain signed in with the company account: whether Stalwart names the provider. */
  domains: { name: string; servedByProvider: boolean }[];
};

const clientOf = (body: z.infer<typeof settingsSchema>, saved: SsoClient | null): SsoClient => ({
  issuer: body.issuerUrl,
  clientId: body.clientId,
  clientSecret: body.clientSecret || saved?.clientSecret || "",
  scopes: body.scopes,
});

const settingsOf = (body: z.infer<typeof settingsSchema>): DirectorySettings => ({
  issuerUrl: body.issuerUrl,
  claimUsername: body.claimUsername,
  usernameDomain: body.usernameDomain,
  claimName: body.claimName,
  claimGroups: body.claimGroups,
  audience: body.audience || body.clientId,
  tokenCheck: body.tokenCheck,
});

/** Stalwart's answer to an address of each domain: the provider's issuer, or its own. */
export const testConnection = async (
  deps: Pick<SsoDeps, "stalwartUrl" | "fetch">,
  client: SsoClient,
  domains: string[],
): Promise<ConnectionTest> => {
  const discovery = await fetchDiscovery(client.issuer, deps.fetch);
  const served = await Promise.all(
    domains.map(async (name) => {
      const issuer = await stalwartIssuerFor(deps.stalwartUrl, `sso-test@${name}`, deps.fetch);
      return { name, servedByProvider: Boolean(issuer && sameIssuer(issuer, client.issuer)) };
    }),
  );
  return {
    provider: discovery.ok ? { ok: true } : { ok: false, error: discovery.error },
    domains: served,
  };
};

/** What the Firmenverwaltung shows; never the client secret or the SCIM token. */
export const readView = async (deps: SsoDeps, enterprise: boolean): Promise<SsoView> => {
  const base = {
    enterprise,
    redirectUri: ssoRedirectUri(deps.publicUrl),
    scimUrl: scimUrlOf(deps.publicUrl),
  };
  if (!enterprise)
    return { ...base, known: false, directory: null, client: null, domains: [], scimKey: null };
  const [stalwart, client, scimKey] = await Promise.all([
    deps.stalwart.read(),
    deps.store.client(),
    deps.stalwart.scimKey(),
  ]);
  return {
    ...base,
    known: Boolean(stalwart),
    directory: stalwart?.directory ?? null,
    client: client
      ? {
          clientId: client.clientId,
          scopes: client.scopes,
          hasSecret: Boolean(client.clientSecret),
        }
      : null,
    domains: stalwart?.domains ?? [],
    scimKey,
  };
};

export const ssoRoutes = (deps: SsoDeps, edition?: EditionCheck) => {
  const app = new Hono<Env>();
  const isEnterprise = async () => (edition ? (await edition()) === "enterprise" : false);
  const view = async () => readView(deps, await isEnterprise());

  const answer = async (result: { ok: true } | { ok: false; error: string }) =>
    result.ok ? Response.json(await view()) : bad(result.error);

  app.get("/", async (c) => c.json(await view()));

  // Every change needs the license: without it Stalwart would store but never use the settings.
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && !(await isEnterprise()))
      return c.json({ error: "Nur mit Stalwart Enterprise." }, 403);
    await next();
  });

  app.put("/", async (c) => {
    const body = await bodyOf(c, settingsSchema);
    if (!body) return bad("Angaben unvollständig.");
    const current = await deps.stalwart.read();
    if (!current)
      return bad("Der Schlüssel des Kontext-Servers darf Stalwarts Verzeichnisse nicht lesen.");
    const client = clientOf(body, await deps.store.client());
    if (!client.clientSecret) return bad("Das Client-Secret fehlt.");
    const saved = await deps.stalwart.saveDirectory(current.directoryId, settingsOf(body));
    if (!saved.ok) return bad(saved.error);
    await deps.store.save(client);
    return answer(saved);
  });

  app.delete("/", async (c) => {
    const current = await deps.stalwart.read();
    if (current) {
      const removed = await deps.stalwart.removeDirectory(current);
      if (!removed.ok) return bad(removed.error);
    }
    await deps.store.save(null);
    return c.json(await view());
  });

  app.put("/domains", async (c) => {
    const body = await bodyOf(c, domainsSchema);
    const current = await deps.stalwart.read();
    if (!body || !current) return bad("Angaben unvollständig.");
    const known = new Map(current.domains.map((domain) => [domain.id, domain]));
    const changes = body.domains.filter((domain) => {
      const existing = known.get(domain.id);
      // Another directory's domains (LDAP, SQL in Stalwart) are not Kontext's to change.
      return existing && !existing.otherDirectory;
    });
    if (changes.some((domain) => domain.sso) && !current.directoryId)
      return bad("Zuerst den Anbieter speichern.");
    return answer(await deps.stalwart.setDomains(current.directoryId, changes));
  });

  app.post("/test", async (c) => {
    const [client, current] = await Promise.all([deps.store.client(), deps.stalwart.read()]);
    if (!client) return bad("Zuerst den Anbieter speichern.");
    const domains = (current?.domains ?? []).filter((d) => d.sso).map((d) => d.name);
    return c.json(await testConnection(deps, client, domains));
  });

  app.post("/scim-token", async (c) => {
    const created = await deps.stalwart.newScimKey();
    return created.ok ? c.json(created.value) : bad(created.error);
  });

  app.delete("/scim-token", async () => answer(await deps.stalwart.removeScimKey()));

  return app;
};
