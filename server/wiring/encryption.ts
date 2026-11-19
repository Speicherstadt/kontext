/**
 * Encrypted mail: OpenPGP (one's own key locked in the browser, others' keys, WKD for the company),
 * S/MIME, and "Vertraulich senden" for recipients without a key, opened with a code.
 */

import { dirname, join } from "node:path";
import type { Hono } from "hono";
import { dohResolver } from "../company/security";
import type { Db } from "../db";
import type { Env } from "../env";
import { createPgpRoutes, createWkdRoutes } from "../pgp/routes";
import { createPgpStore } from "../pgp/store";
import type { Pusher } from "../push/pusher";
import { createSecurePublicRoutes, createSecureRoutes } from "../secure/routes";
import { createSecureStore } from "../secure/store";
import type { createSessionInfo } from "../session-info";
import type { AuthorityStore } from "../smime/authorities";
import { createCrlCheck } from "../smime/crl";
import { crlGet } from "../smime/net";
import { createSmimeRoutes, trustedRoots } from "../smime/routes";
import { createSmimeStore } from "../smime/store";

export type EncryptionDeps = {
  env: Env;
  db: Db;
  pusher: Pusher;
  session: ReturnType<typeof createSessionInfo>;
  /** S/MIME authorities the Firmenverwaltung added; the trust check reads them too. */
  smimeAuthorities: AuthorityStore;
};

export const mountEncryption = (app: Hono, deps: EncryptionDeps) => {
  const { env, db, session } = deps;
  const { accountsOf } = session;
  const pgp = createPgpStore(db);
  app.route("/api/pgp", createPgpRoutes({ store: pgp, accountsOf }));
  app.route("/.well-known/openpgpkey", createWkdRoutes(pgp));
  app.route(
    "/api/smime",
    createSmimeRoutes({
      store: createSmimeStore(db),
      accountsOf,
      roots: trustedRoots(env.SMIME_ROOTS),
      authorities: deps.smimeAuthorities,
      crl: createCrlCheck({ get: crlGet }),
      resolve: dohResolver(env.DOH_URL),
    }),
  );
  const secure = createSecureStore(db, join(dirname(env.DATABASE_PATH), "secure"));
  app.route(
    "/api/secure",
    createSecureRoutes({ store: secure, accountsOf, sendersOf: session.sendersOf }),
  );
  app.route(
    "/api/secure-public",
    createSecurePublicRoutes({ store: secure, notify: deps.pusher.notify }),
  );
  const pruneSecure = () => void secure.pruneExpired(new Date()).catch(() => undefined);
  pruneSecure();
  setInterval(pruneSecure, 3_600_000).unref();
};
