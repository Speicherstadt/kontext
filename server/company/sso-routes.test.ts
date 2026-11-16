// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SsoClient } from "../sso/oidc";
import type { StalwartSso, StalwartSsoView } from "./sso";
import { scimUrlOf, ssoRoutes } from "./sso-routes";

const ISSUER = "https://login.microsoftonline.com/t1/v2.0";

const setup = (edition: "community" | "enterprise", saved: SsoClient | null = null) => {
  let client = saved;
  let view: StalwartSsoView = {
    directoryId: saved ? "b" : null,
    directory: null,
    domains: [
      { id: "d1", name: "firma.de", sso: false, otherDirectory: false, scim: false },
      { id: "d2", name: "ldap.de", sso: false, otherDirectory: true, scim: false },
    ],
  };
  const stalwart = {
    read: vi.fn(async () => view),
    saveDirectory: vi.fn(async () => {
      view = { ...view, directoryId: "b" };
      return { ok: true as const, value: null };
    }),
    setDomains: vi.fn(async () => ({ ok: true as const, value: null })),
    removeDirectory: vi.fn(async () => ({ ok: true as const, value: null })),
    scimKey: vi.fn(async () => null),
    newScimKey: vi.fn(async () => ({
      ok: true as const,
      value: { secret: "API_scim", canDelete: true },
    })),
    removeScimKey: vi.fn(async () => ({ ok: true as const, value: null })),
  } satisfies StalwartSso;
  const store = {
    client: vi.fn(async () => client),
    save: vi.fn(async (next: SsoClient | null) => {
      client = next;
    }),
  };
  const fetchFn = vi.fn(async (url: string | URL | Request) =>
    String(url).includes("/api/discover/")
      ? Response.json({ issuer: ISSUER })
      : Response.json({
          issuer: ISSUER,
          authorization_endpoint: "https://login.example/authorize",
          token_endpoint: "https://login.example/token",
        }),
  ) as unknown as typeof fetch;
  const app = ssoRoutes(
    {
      stalwart,
      store,
      stalwartUrl: "http://stalwart:8080",
      publicUrl: "https://kontext.firma.de/",
      fetch: fetchFn,
    },
    async () => edition,
  );
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { send, stalwart, store };
};

const form = {
  issuerUrl: ISSUER,
  clientId: "kontext-app",
  clientSecret: "geheim",
  scopes: "openid email offline_access",
  claimUsername: "preferred_username",
  usernameDomain: "",
  claimName: "name",
  claimGroups: "",
  audience: "",
  tokenCheck: "jwt",
};

describe("/api/company/sso", () => {
  it("in Community says so and changes nothing", async () => {
    const { send, stalwart } = setup("community");
    const view = await (await send("GET", "/")).json();
    expect(view).toMatchObject({
      enterprise: false,
      redirectUri: "https://kontext.firma.de/api/auth/sso/callback",
      scimUrl: "https://kontext.firma.de/scim/v2",
    });
    expect(stalwart.read).not.toHaveBeenCalled();
    expect((await send("PUT", "/", form)).status).toBe(403);
    expect((await send("POST", "/scim-token")).status).toBe(403);
  });

  it("saves the directory in Stalwart and the client in Kontext, the client id as audience", async () => {
    const { send, stalwart, store } = setup("enterprise");
    const response = await send("PUT", "/", form);
    expect(response.status).toBe(200);
    expect(stalwart.saveDirectory).toHaveBeenCalledWith(null, {
      issuerUrl: ISSUER,
      claimUsername: "preferred_username",
      usernameDomain: "",
      claimName: "name",
      claimGroups: "",
      audience: "kontext-app",
      tokenCheck: "jwt",
    });
    expect(store.save).toHaveBeenCalledWith({
      issuer: ISSUER,
      clientId: "kontext-app",
      clientSecret: "geheim",
      scopes: "openid email offline_access",
    });
    const view = await response.json();
    expect(view.client).toEqual({
      clientId: "kontext-app",
      scopes: "openid email offline_access",
      hasSecret: true,
    });
    expect(JSON.stringify(view)).not.toContain("geheim");
  });

  it("keeps the saved secret when the form leaves it empty, and wants one at first", async () => {
    const saved = { issuer: ISSUER, clientId: "old", clientSecret: "alt", scopes: "openid" };
    const { send, store } = setup("enterprise", saved);
    await send("PUT", "/", { ...form, clientSecret: "" });
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ clientSecret: "alt" }));
    const fresh = setup("enterprise");
    expect((await fresh.send("PUT", "/", { ...form, clientSecret: "" })).status).toBe(400);
  });

  it("changes only domains not signed in by another directory", async () => {
    const { send, stalwart } = setup("enterprise");
    expect(
      (await send("PUT", "/domains", { domains: [{ id: "d1", sso: true, scim: false }] })).status,
    ).toBe(400);
    await send("PUT", "/", form);
    await send("PUT", "/domains", {
      domains: [
        { id: "d1", sso: true, scim: true },
        { id: "d2", sso: true, scim: true },
      ],
    });
    expect(stalwart.setDomains).toHaveBeenCalledWith("b", [{ id: "d1", sso: true, scim: true }]);
  });

  it("tests the provider and asks Stalwart who serves each SSO domain", async () => {
    const saved = { issuer: ISSUER, clientId: "c", clientSecret: "s", scopes: "openid" };
    const { send, stalwart } = setup("enterprise", saved);
    stalwart.read.mockResolvedValueOnce({
      directoryId: "b",
      directory: null,
      domains: [{ id: "d1", name: "firma.de", sso: true, otherDirectory: false, scim: false }],
    });
    expect(await (await send("POST", "/test")).json()).toEqual({
      provider: { ok: true },
      domains: [{ name: "firma.de", servedByProvider: true }],
    });
  });

  it("hands the SCIM token out once, and removes everything with the provider", async () => {
    const saved = { issuer: ISSUER, clientId: "c", clientSecret: "s", scopes: "openid" };
    const { send, stalwart, store } = setup("enterprise", saved);
    expect(await (await send("POST", "/scim-token")).json()).toEqual({
      secret: "API_scim",
      canDelete: true,
    });
    expect((await send("DELETE", "/")).status).toBe(200);
    expect(stalwart.removeDirectory).toHaveBeenCalled();
    expect(store.save).toHaveBeenLastCalledWith(null);
  });
});

describe("scimUrlOf", () => {
  it("is Stalwart's /scim/v2 at Kontext's address", () => {
    expect(scimUrlOf("https://kontext.firma.de")).toBe("https://kontext.firma.de/scim/v2");
  });
});
