// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  authorizationUrl,
  createDiscoveryCache,
  type Discovery,
  discoveryUrl,
  exchangeCode,
  fetchDiscovery,
  newAttempt,
  refreshAtProvider,
  revokeAtProvider,
  type SsoClient,
  sameIssuer,
  stalwartIssuerFor,
  toSsoTokens,
} from "./oidc";

const ISSUER = "https://login.microsoftonline.com/tenant-1/v2.0";
const client: SsoClient = {
  issuer: ISSUER,
  clientId: "kontext-app",
  clientSecret: "geheim",
  scopes: "openid email offline_access api://kontext-app/kontext",
};
const discovery: Discovery = {
  issuer: ISSUER,
  authorizationEndpoint: "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/authorize",
  tokenEndpoint: "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
  revocationEndpoint: null,
};

const answering = (body: unknown, status = 200) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(body, { status }),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("issuers", () => {
  it("are the same with or without the trailing slash; discovery under .well-known", () => {
    expect(sameIssuer(`${ISSUER}/`, ISSUER)).toBe(true);
    expect(sameIssuer("https://accounts.google.com", "https://accounts.google.de")).toBe(false);
    expect(discoveryUrl(`${ISSUER}/`)).toBe(`${ISSUER}/.well-known/openid-configuration`);
  });
});

describe("fetchDiscovery", () => {
  it("reads the endpoints the sign-in needs", async () => {
    const fetchFn = answering({
      issuer: ISSUER,
      authorization_endpoint: discovery.authorizationEndpoint,
      token_endpoint: discovery.tokenEndpoint,
      revocation_endpoint: "https://login.example/revoke",
    });
    const result = await fetchDiscovery(ISSUER, fetchFn);
    expect(result).toEqual({
      ok: true,
      value: { ...discovery, revocationEndpoint: "https://login.example/revoke" },
    });
    expect(fetchFn.mock.calls[0]![0]).toBe(`${ISSUER}/.well-known/openid-configuration`);
  });

  it("refuses another issuer, a broken document and an error, with the reason", async () => {
    const other = await fetchDiscovery(
      ISSUER,
      answering({
        issuer: "https://sts.windows.net/tenant-1/",
        authorization_endpoint: discovery.authorizationEndpoint,
        token_endpoint: discovery.tokenEndpoint,
      }),
    );
    expect(other).toEqual({
      ok: false,
      error: "Der Anbieter nennt sich https://sts.windows.net/tenant-1/",
    });
    expect((await fetchDiscovery(ISSUER, answering({ issuer: ISSUER }))).ok).toBe(false);
    expect(await fetchDiscovery(ISSUER, answering({}, 404))).toEqual({
      ok: false,
      error: "HTTP 404",
    });
    const away = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    expect(await fetchDiscovery(ISSUER, away)).toEqual({ ok: false, error: "ENOTFOUND" });
  });
});

describe("createDiscoveryCache", () => {
  it("asks once an hour, and again after a failure", async () => {
    let time = 0;
    const fetchFn = answering({
      issuer: ISSUER,
      authorization_endpoint: discovery.authorizationEndpoint,
      token_endpoint: discovery.tokenEndpoint,
    });
    const cache = createDiscoveryCache(fetchFn, () => time);
    expect((await cache(ISSUER))?.tokenEndpoint).toBe(discovery.tokenEndpoint);
    time = 3_599_999;
    await cache(ISSUER);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time = 3_600_000;
    await cache(ISSUER);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(await createDiscoveryCache(answering({}, 500))(ISSUER)).toBeNull();
  });
});

describe("stalwartIssuerFor", () => {
  it("asks Stalwart's discover endpoint for the address", async () => {
    const fetchFn = answering({ issuer: ISSUER });
    expect(await stalwartIssuerFor("http://stalwart:8080", "anna@firma.de", fetchFn)).toBe(ISSUER);
    expect(fetchFn.mock.calls[0]![0]).toBe("http://stalwart:8080/api/discover/anna%40firma.de");
    expect(
      await stalwartIssuerFor("http://stalwart:8080", "x@y.de", answering({}, 429)),
    ).toBeNull();
  });
});

describe("the authorization request", () => {
  it("carries client, PKCE, state and the address as login hint", async () => {
    const attempt = await newAttempt();
    expect(attempt.verifier.length).toBeGreaterThanOrEqual(43);
    const url = new URL(
      authorizationUrl(discovery, client, {
        ...attempt,
        redirectUri: "https://kontext.firma.de/api/auth/sso/callback",
        email: "anna@firma.de",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(discovery.authorizationEndpoint);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "kontext-app",
      redirect_uri: "https://kontext.firma.de/api/auth/sso/callback",
      scope: client.scopes,
      state: attempt.state,
      code_challenge: attempt.challenge,
      code_challenge_method: "S256",
      login_hint: "anna@firma.de",
    });
  });
});

describe("the token endpoint", () => {
  it("swaps the code with the client's secret and keeps the tokens", async () => {
    const fetchFn = answering({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    const answer = await exchangeCode(
      discovery,
      client,
      { code: "c1", verifier: "v1", redirectUri: "https://kontext.firma.de/api/auth/sso/callback" },
      fetchFn,
    );
    expect(answer.status).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(discovery.tokenEndpoint);
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "authorization_code",
      code: "c1",
      redirect_uri: "https://kontext.firma.de/api/auth/sso/callback",
      code_verifier: "v1",
      client_id: "kontext-app",
      client_secret: "geheim",
    });
  });

  it("tells a refused grant from a provider that does not answer", async () => {
    expect((await refreshAtProvider(discovery, client, "rt", answering({}, 400))).status).toBe(
      "rejected",
    );
    expect((await refreshAtProvider(discovery, client, "rt", answering({}, 503))).status).toBe(
      "unavailable",
    );
    // Without a refresh token (none was given) the session ends with its access token.
    expect((await refreshAtProvider(discovery, client, "", answering({}))).status).toBe("rejected");
  });

  it("keeps the old refresh token when the provider sends none, a minute early", () => {
    const tokens = toSsoTokens({ access_token: "at", expires_in: 600 }, "old", 0);
    expect(tokens).toEqual({
      accessToken: "at",
      refreshToken: "old",
      accessExpiresAt: new Date(540_000),
    });
    expect(toSsoTokens({ access_token: "at" }, "", 0).accessExpiresAt).toEqual(new Date(3_540_000));
  });

  it("revokes only where the provider has a revocation endpoint", async () => {
    const fetchFn = answering({});
    expect(await revokeAtProvider(discovery, client, "rt", fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    const withEndpoint = { ...discovery, revocationEndpoint: "https://login.example/revoke" };
    expect(await revokeAtProvider(withEndpoint, client, "rt", fetchFn)).toBe(true);
    expect(fetchFn.mock.calls[0]![0]).toBe("https://login.example/revoke");
  });
});
