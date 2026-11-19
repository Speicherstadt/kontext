/**
 * Sign-in: the database, Better Auth with the Stalwart grants, the company account (SSO) and
 * Dokumente (Schreibzeug) as a client of Kontext's sign-in; and the routes under /api/auth.
 */

import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { createAccessRoutes } from "../access/routes";
import { createSessionStore } from "../access/store";
import { type Auth, createAuth, createGrants, type Grants } from "../auth";
import { createSealer } from "../crypto";
import { type Db, openDatabase, schema } from "../db";
import { createSchreibzeug, type Schreibzeug } from "../documents/schreibzeug";
import type { Env } from "../env";
import { registerClient, type SchreibzeugClient, schreibzeugClientOf } from "../oidc/provider";
import { createNameOf } from "../session-info";
import { createProviderGrants } from "../sso/grants";
import { createDiscoveryCache } from "../sso/oidc";
import { createSsoStore } from "../sso/store";

/** Schreibzeug's API for the server, with tokens signed by Kontext's keys for its address. */
const createSchreibzeugOf = (env: Env, auth: Auth, client: SchreibzeugClient): Schreibzeug => {
  const schreibzeug = createSchreibzeug({
    url: client.url,
    issuer: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/api/auth`,
    sign: async (payload) => (await auth.api.signJWT({ body: { payload } })).token,
  });
  // Only a note: Schreibzeug may start after Kontext.
  void schreibzeug.reachable().then((reachable) => {
    if (!reachable) console.warn(`Schreibzeug antwortet nicht: ${client.url}`);
  });
  return schreibzeug;
};

export const createSignIn = async (env: Env) => {
  const db = openDatabase(env.DATABASE_PATH);
  // Sign-in with the company account (Stalwart Enterprise): the provider's client and documents.
  const ssoStore = createSsoStore(db, await createSealer(env.BETTER_AUTH_SECRET, "sso"));
  const ssoDiscovery = createDiscoveryCache();
  const grants = createGrants(
    db,
    await createSealer(env.BETTER_AUTH_SECRET, "stalwart-grant"),
    env.STALWART_URL,
    undefined,
    undefined,
    createProviderGrants(ssoStore, ssoDiscovery),
  );
  const auth = createAuth(env, db, grants, createNameOf(env), undefined, {
    store: ssoStore,
    discovery: ssoDiscovery,
  });
  const schreibzeug = schreibzeugClientOf(env);
  if (schreibzeug) await registerClient(db, schreibzeug);
  const documents = schreibzeug ? createSchreibzeugOf(env, auth, schreibzeug) : null;
  return { db, ssoStore, grants, auth, documents };
};

export type SignIn = Awaited<ReturnType<typeof createSignIn>>;

/**
 * Ends all Kontext sessions of a user and their grants at Stalwart. With Dokumente its sessions
 * end too, as Schreibzeug never asks Kontext again once someone is signed in there.
 */
export const endSessionsOf =
  (db: Db, grants: Pick<Grants, "end">, documents: Schreibzeug | null) => async (email: string) => {
    const [found] = await db.select().from(schema.user).where(eq(schema.user.email, email));
    if (!found) return;
    const sessions = await db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(eq(schema.session.userId, found.id));
    for (const { id } of sessions) await grants.end(id);
    await db.delete(schema.session).where(eq(schema.session.userId, found.id));
    const person = { id: found.id, email: found.email, name: found.name };
    await documents
      ?.endSessions(person)
      .catch((error: Error) => console.warn(`Dokumente: Abmelden von ${email}: ${error.message}`));
  };

/** The routes of the sign-in: discovery for Dokumente, signing out, the own sessions, Better Auth. */
export const mountSignIn = (app: Hono, { db, grants, auth, documents }: SignIn) => {
  if (documents) {
    // Better Auth keeps discovery server-only; Schreibzeug reads it here (issuer + well-known path).
    const discovery = oauthProviderOpenIdConfigMetadata(auth);
    app.get("/api/auth/.well-known/openid-configuration", (c) => discovery(c.req.raw));
  }
  // Signing out ends the session's grant at Stalwart too, so it leaves the person's list there.
  // It signs out of Dokumente as well, also when its frame was not open since the last reload (the
  // frame's own "logout" reaches only an open one): Schreibzeug never asks Kontext again once
  // someone is signed in there, and the next person at this browser would be them.
  app.post("/api/auth/sign-out", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      await grants.end(session.session.id);
      const { id, email, name } = session.user;
      await documents
        ?.endSessions({ id, email, name })
        .catch((error: Error) =>
          console.warn(`Dokumente: Abmelden von ${email}: ${error.message}`),
        );
    }
    return auth.handler(c.req.raw);
  });
  app.route(
    "/api/access",
    createAccessRoutes({
      sessions: createSessionStore(db, grants),
      sessionOf: async (request) => {
        const found = await auth.api.getSession({ headers: request.headers });
        return found ? { id: found.session.id, userId: found.user.id } : null;
      },
    }),
  );
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
};
