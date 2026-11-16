// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createGrants } from "../auth";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import { createProviderGrants } from "./grants";
import type { Discovery, SsoClient } from "./oidc";

vi.mock("../db", async () => ({
  schema: { ...(await import("../db/schema")), ...(await import("../db/oauth-schema")) },
}));

const ISSUER = "https://login.microsoftonline.com/t1/v2.0";
const client: SsoClient = { issuer: ISSUER, clientId: "c", clientSecret: "s", scopes: "openid" };
const discovery: Discovery = {
  issuer: ISSUER,
  authorizationEndpoint: "https://login.example/authorize",
  tokenEndpoint: "https://login.example/token",
  revocationEndpoint: "https://login.example/revoke",
};

const sealer = { seal: async (v: string) => v, open: async (v: string) => v } as Sealer;

/** One grant whose access token has run out, from the provider when `issuer` is set. */
const fakeDb = (issuer: string | null) => {
  const saved: Record<string, unknown>[] = [];
  const row = {
    sessionId: "s1",
    accessToken: "old",
    refreshToken: "refresh-1",
    accessExpiresAt: new Date(Date.now() - 1000),
    issuer,
    updatedAt: new Date(),
  };
  const db = {
    select: () => ({ from: () => ({ where: async () => [row] }) }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        saved.push(value);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  } as unknown as Db;
  return { db, saved };
};

describe("grants of sessions signed in with the company account", () => {
  it("are renewed at the provider and keep their issuer; Stalwart's at Stalwart", async () => {
    const atStalwart = vi.fn(async () => ({ status: "rejected" as const }));
    const provider = {
      refresh: vi.fn(async () => ({
        status: "ok" as const,
        tokens: { accessToken: "new", refreshToken: "refresh-2", accessExpiresAt: new Date() },
      })),
      revoke: vi.fn(async () => true),
    };
    const sso = fakeDb(ISSUER);
    const grants = createGrants(sso.db, sealer, "http://stalwart", atStalwart, undefined, provider);
    expect(await grants.accessToken("s1")).toBe("new");
    expect(provider.refresh).toHaveBeenCalledWith(ISSUER, "refresh-1");
    expect(atStalwart).not.toHaveBeenCalled();
    expect(sso.saved[0]).toMatchObject({ issuer: ISSUER, accessToken: "new" });
    await grants.end("s1");
    expect(provider.revoke).toHaveBeenCalledWith(ISSUER, "refresh-1");

    const own = fakeDb(null);
    await createGrants(
      own.db,
      sealer,
      "http://stalwart",
      atStalwart,
      undefined,
      provider,
    ).accessToken("s1");
    expect(atStalwart).toHaveBeenCalledWith("http://stalwart", "refresh-1");
  });

  it("end with the provider taken away", async () => {
    const sso = fakeDb(ISSUER);
    expect(await createGrants(sso.db, sealer, "http://stalwart").accessToken("s1")).toBeNull();
  });
});

describe("createProviderGrants", () => {
  it("refuses an issuer that is no longer the configured one, else asks the provider", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    ) as unknown as typeof fetch;
    const grants = createProviderGrants(
      { client: async () => client },
      async () => discovery,
      fetchFn,
    );
    expect((await grants.refresh("https://accounts.google.com", "rt")).status).toBe("rejected");
    expect((await grants.refresh(`${ISSUER}/`, "rt")).status).toBe("ok");
    expect(await grants.revoke(ISSUER, "rt")).toBe(true);
    const away = createProviderGrants({ client: async () => client }, async () => null, fetchFn);
    expect((await away.refresh(ISSUER, "rt")).status).toBe("unavailable");
  });
});
