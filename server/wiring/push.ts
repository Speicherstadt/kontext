/** Web Push: chat messages to oneself and new mail, also with Kontext closed. */

import type { Hono } from "hono";
import type { Grants } from "../auth";
import { createSealer } from "../crypto";
import type { Db } from "../db";
import type { Env } from "../env";
import { createMailWatch } from "../push/mail-watch";
import { createPusher } from "../push/pusher";
import { createPushRoutes } from "../push/routes";
import { createPushStore, loadVapidKeys } from "../push/store";
import type { SessionInfo } from "../session-info";

export const mountPush = async (
  app: Hono,
  deps: {
    env: Env;
    db: Db;
    grants: Grants;
    infoOf: (request: Request) => Promise<SessionInfo | null>;
  },
) => {
  const { env, db, grants } = deps;
  const store = createPushStore(db);
  const vapid = await loadVapidKeys(db, await createSealer(env.BETTER_AUTH_SECRET, "web-push"));
  const pusher = createPusher({ store, keys: vapid, subject: new URL(env.BETTER_AUTH_URL).origin });
  const mailWatch = createMailWatch({ env, grants, store, pusher });
  const watchMail = () => void mailWatch.refresh().catch(() => undefined);
  watchMail();
  // Sessions end (signing out removes their subscriptions): look again now and then.
  setInterval(watchMail, 5 * 60_000).unref();
  app.route(
    "/api/push",
    createPushRoutes({
      store,
      publicKey: vapid.publicKey,
      infoOf: deps.infoOf,
      changed: watchMail,
      anyEndpoint: env.PUSH_ANY_ENDPOINT,
    }),
  );
  return pusher;
};
