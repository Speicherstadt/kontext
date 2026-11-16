/**
 * Kontext as the OAuth client of the company's identity provider (Microsoft Entra ID, Google,
 * Keycloak …), for sign-in with the company account.
 *
 * Stalwart does not broker that sign-in: an account in a domain served by an OIDC directory has no
 * password at Stalwart (`OpenIdDirectory::authenticate` refuses every credential,
 * crates/directory/src/backend/oidc/lookup.rs of stalwartlabs/stalwart v1.1.0), and Stalwart's
 * own login takes only passwords and passkeys (crates/http/src/auth/oauth/auth.rs, LoginRequest).
 * Instead Stalwart accepts the provider's access token as the bearer (`authenticate_bearer` →
 * `authenticate_external_token`, crates/common/src/auth/authentication.rs), checks it against the
 * provider's keys, audience and scopes, and tells clients which provider serves an address at
 * `/api/discover/<address>` (`handle_discover_request`, which answers the provider's discovery
 * document for a domain with an OIDC directory and Stalwart's own otherwise). So the Kontext
 * server runs the authorization code flow with the provider itself, keeps the provider's tokens
 * in the session like Stalwart's, and passes JMAP on with the provider's access token.
 */
import { z } from "zod";

export type Fetch = typeof fetch;

/** The parts of the provider's discovery document (OpenID Connect Discovery 1.0) Kontext uses. */
export type Discovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string | null;
};

const discoveryDocument = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  revocation_endpoint: z.string().url().optional(),
});

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().optional(),
});

/** The client Kontext is at the provider, as the admin registered it there. */
export type SsoClient = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Space-separated; what the provider needs for an access token Stalwart takes. */
  scopes: string;
};

export type SsoTokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date };

/** The answer of the provider's token endpoint, as for Stalwart's (stalwart.ts). */
export type TokenAnswer =
  | { status: "ok"; tokens: SsoTokens }
  | { status: "rejected" }
  | { status: "unavailable" };

/** "https://login.example/x/" and "https://login.example/x" are the same issuer. */
export const sameIssuer = (a: string, b: string): boolean =>
  a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

export const discoveryUrl = (issuer: string): string =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

/** The provider's discovery document, or why it could not be read (for the connection test). */
export const fetchDiscovery = async (
  issuer: string,
  fetchFn: Fetch = fetch,
): Promise<{ ok: true; value: Discovery } | { ok: false; error: string }> => {
  const response = await fetchFn(discoveryUrl(issuer), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  }).catch((error: Error) => error);
  if (response instanceof Error) return { ok: false, error: response.message };
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
  const parsed = discoveryDocument.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, error: "Kein OpenID-Connect-Discovery-Dokument" };
  // Stalwart refuses a mismatch too (`issuer_matches`, crates/directory/src/backend/oidc/config.rs).
  if (!sameIssuer(parsed.data.issuer, issuer))
    return { ok: false, error: `Der Anbieter nennt sich ${parsed.data.issuer}` };
  return {
    ok: true,
    value: {
      issuer: parsed.data.issuer,
      authorizationEndpoint: parsed.data.authorization_endpoint,
      tokenEndpoint: parsed.data.token_endpoint,
      revocationEndpoint: parsed.data.revocation_endpoint ?? null,
    },
  };
};

/** Discovery documents change rarely: kept an hour, so a refresh costs one request, not two. */
export const createDiscoveryCache = (fetchFn: Fetch = fetch, now = Date.now, ttl = 3_600_000) => {
  const cache = new Map<string, { value: Discovery; until: number }>();
  return async (issuer: string): Promise<Discovery | null> => {
    const hit = cache.get(issuer);
    if (hit && hit.until > now()) return hit.value;
    const result = await fetchDiscovery(issuer, fetchFn);
    if (!result.ok) return null;
    cache.set(issuer, { value: result.value, until: now() + ttl });
    return result.value;
  };
};

export type DiscoveryCache = ReturnType<typeof createDiscoveryCache>;

/**
 * Which issuer Stalwart has for an address: the provider's for a domain with an OIDC directory
 * (Enterprise), Stalwart's own otherwise; null when it does not answer.
 */
export const stalwartIssuerFor = async (
  stalwartUrl: string,
  email: string,
  fetchFn: Fetch = fetch,
): Promise<string | null> => {
  const response = await fetchFn(`${stalwartUrl}/api/discover/${encodeURIComponent(email)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as { issuer?: unknown } | null;
  return typeof body?.issuer === "string" ? body.issuer : null;
};

const base64url = (bytes: ArrayBuffer | Uint8Array): string =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

/** state and PKCE (RFC 7636) for one sign-in. */
export const newAttempt = async (
  random = (size: number) => crypto.getRandomValues(new Uint8Array(size)),
) => {
  const verifier = base64url(random(48));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { state: base64url(random(16)), verifier, challenge };
};

/** The authorization request (RFC 6749 4.1.1) the browser is sent to; the address as the hint. */
export const authorizationUrl = (
  discovery: Discovery,
  client: SsoClient,
  request: { redirectUri: string; state: string; challenge: string; email: string },
): string => {
  const url = new URL(discovery.authorizationEndpoint);
  const params = {
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: request.redirectUri,
    scope: client.scopes,
    state: request.state,
    code_challenge: request.challenge,
    code_challenge_method: "S256",
    login_hint: request.email,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
};

/** Tokens from the answer; without a refresh token the session lasts as long as the access token. */
export const toSsoTokens = (
  body: z.infer<typeof tokenResponse>,
  previousRefresh = "",
  now = Date.now(),
): SsoTokens => ({
  accessToken: body.access_token,
  refreshToken: body.refresh_token ?? previousRefresh,
  // A minute early, as for Stalwart's; an hour where the provider does not say.
  accessExpiresAt: new Date(now + ((body.expires_in ?? 3600) - 60) * 1000),
});

/** A form to the token endpoint, the client authenticated in the body (client_secret_post). */
const postToken = async (
  tokenEndpoint: string,
  client: SsoClient,
  form: Record<string, string>,
  fetchFn: Fetch,
  previousRefresh?: string,
): Promise<TokenAnswer> => {
  const response = await fetchFn(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      ...form,
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) return { status: "unavailable" };
  if (response.ok) {
    const body = tokenResponse.safeParse(await response.json().catch(() => null));
    return body.success
      ? { status: "ok", tokens: toSsoTokens(body.data, previousRefresh) }
      : { status: "unavailable" };
  }
  // RFC 6749 5.2: an invalid grant is a 400 (401 for the client); anything else says nothing.
  return response.status === 400 || response.status === 401
    ? { status: "rejected" }
    : { status: "unavailable" };
};

export const exchangeCode = (
  discovery: Discovery,
  client: SsoClient,
  request: { code: string; verifier: string; redirectUri: string },
  fetchFn: Fetch = fetch,
): Promise<TokenAnswer> =>
  postToken(
    discovery.tokenEndpoint,
    client,
    {
      grant_type: "authorization_code",
      code: request.code,
      redirect_uri: request.redirectUri,
      code_verifier: request.verifier,
    },
    fetchFn,
  );

export const refreshAtProvider = (
  discovery: Discovery,
  client: SsoClient,
  refreshToken: string,
  fetchFn: Fetch = fetch,
): Promise<TokenAnswer> =>
  refreshToken
    ? postToken(
        discovery.tokenEndpoint,
        client,
        { grant_type: "refresh_token", refresh_token: refreshToken },
        fetchFn,
        refreshToken,
      )
    : Promise.resolve({ status: "rejected" });

/** RFC 7009 where the provider offers it (Google, Keycloak; Entra ID has none). Best effort. */
export const revokeAtProvider = async (
  discovery: Discovery,
  client: SsoClient,
  refreshToken: string,
  fetchFn: Fetch = fetch,
): Promise<boolean> => {
  if (!discovery.revocationEndpoint || !refreshToken) return false;
  const response = await fetchFn(discovery.revocationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: client.clientId,
      client_secret: client.clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return Boolean(response?.ok);
};
