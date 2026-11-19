/**
 * The pass-through of JMAP to Stalwart: it adds the session's Stalwart token, so the browser never
 * holds one.
 */

import type { Auth, Grants } from "./auth";
import type { Env } from "./env";
import { hardenDownload, isDownload } from "./headers";
import { tokenOrUnavailable, unavailable } from "./stalwart-away";

/** Request headers that go on to Stalwart; cookies and the browser's own auth stay here. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "content-length",
  "last-event-id",
  "accept-language",
];
/** Response headers that come back; hop-by-hop headers are dropped. */
const DROPPED_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "set-cookie",
  "www-authenticate",
];

export const createJmapProxy =
  (env: Env, auth: Auth, grants: Grants) =>
  async (request: Request): Promise<Response> => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const token = await tokenOrUnavailable(grants, session.session.id);
    if (token === "unavailable") return unavailable();
    const signOut = async () => {
      await auth.api.revokeSession({
        headers: request.headers,
        body: { token: session.session.token },
      });
      return Response.json({ error: "Anmeldung abgelaufen" }, { status: 401 });
    };
    if (!token) return signOut();

    const url = new URL(request.url);
    const headers = new Headers({ authorization: `Bearer ${token}` });
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

    const upstream = await fetch(`${env.STALWART_URL}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: request.signal,
    });
    // A token Stalwart refuses before it runs out stays refused (Stalwart no longer knows the
    // grant). Passed on with every request of the app, each refusal counts as a failed sign-in
    // from the person's address (X-Forwarded-For) until Stalwart bans it; the session ends instead.
    if (upstream.status === 401) {
      await grants.forget(session.session.id);
      return signOut();
    }
    const responseHeaders = new Headers(upstream.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) responseHeaders.delete(name);
    if (isDownload(url.pathname)) hardenDownload(responseHeaders);
    responseHeaders.set("cache-control", responseHeaders.get("cache-control") ?? "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  };
