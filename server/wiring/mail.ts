/**
 * Around the mail: a person's other mailboxes (Gmail, GMX, …), invitations Kontext sends itself,
 * and the smaller helpers (snippets, Wiedervorlage, unsubscribing, image senders, categories).
 */

import type { Hono } from "hono";
import type { Grants } from "../auth";
import { createCategoryRoutes } from "../categories/routes";
import type { CategoryStore } from "../categories/store";
import { createRequest } from "../company/management";
import { createSealer } from "../crypto";
import type { Db } from "../db";
import type { Env } from "../env";
import { createFetcher } from "../external/fetcher";
import { createExternalRoutes } from "../external/routes";
import { createSmtp } from "../external/smtp";
import { createExternalStore } from "../external/store";
import { createUserJmap } from "../external/user-jmap";
import { createImageSenderRoutes } from "../images/routes";
import { createInvitationRoutes, createRsvpRoutes } from "../invitations/routes";
import { createRsvp } from "../invitations/rsvp";
import { createRsvpTokens } from "../invitations/token";
import { createAttempts } from "../mcp/attempts";
import type { Importer } from "../migration/importer";
import type { Pusher } from "../push/pusher";
import type { createSessionInfo } from "../session-info";
import { createSnippetRoutes } from "../snippets/routes";
import { createSnippetStore } from "../snippets/store";
import { createSnoozeRoutes } from "../snooze/routes";
import type { SnoozeStore } from "../snooze/store";
import { createSnoozeWaker } from "../snooze/waker";
import { createUnsubscribeRoutes } from "../unsubscribe/routes";

type Session = ReturnType<typeof createSessionInfo>;

/** Other mailboxes of a person: fetched into Kontext with the server's key, sent through them. */
export const mountExternalAccounts = async (
  app: Hono,
  deps: { env: Env; db: Db; grants: Grants; importer: Importer; session: Session },
) => {
  const { env } = deps;
  const store = createExternalStore(deps.db);
  const sealer = await createSealer(env.BETTER_AUTH_SECRET, "external-account");
  const allowPlain = env.MAIL_SYNC_ALLOW_PLAIN;
  const fetcher = createFetcher({ store, importer: deps.importer, sealer, allowPlain });
  (await fetcher.start()).unref();
  app.route(
    "/api/external-accounts",
    createExternalRoutes({
      store,
      fetcher,
      sealer,
      smtp: createSmtp(allowPlain),
      infoOf: deps.session.infoOf,
      jmapFor: createUserJmap(env, deps.grants),
      allowPlain,
    }),
  );
};

/** Snippets, Wiedervorlage (due mails come back every minute), unsubscribing, image senders. */
export const mountMailHelpers = (
  app: Hono,
  deps: {
    env: Env;
    db: Db;
    grants: Grants;
    snoozes: SnoozeStore;
    pusher: Pusher;
    session: Session;
  },
) => {
  const { env, db, grants, snoozes } = deps;
  const { accountsOf, infoOf } = deps.session;
  app.route("/api/snippets", createSnippetRoutes({ store: createSnippetStore(db), accountsOf }));
  const waker = createSnoozeWaker({ env, grants, store: snoozes, notify: deps.pusher.notify });
  setInterval(() => void waker.tick(), env.SNOOZE_TICK_MS).unref();
  app.route("/api/snoozes", createSnoozeRoutes({ store: snoozes, infoOf }));
  app.route("/api/unsubscribe", createUnsubscribeRoutes({ env, grants, infoOf }));
  app.route("/api/image-senders", createImageSenderRoutes({ db, accountsOf }));
};

/**
 * Invitations Kontext sends itself: signed answer links, and the page that enters the answer with
 * the server's key (without it, invitations go out without the buttons).
 */
export const mountInvitations = async (
  app: Hono,
  deps: { env: Env; grants: Grants; session: Session },
) => {
  const { env } = deps;
  const tokens = await createRsvpTokens(env.BETTER_AUTH_SECRET);
  app.route(
    "/api/invitations",
    createInvitationRoutes({
      tokens,
      publicUrl: env.BETTER_AUTH_URL,
      infoOf: deps.session.infoOf,
      sendersOf: deps.session.sendersOf,
      jmapFor: createUserJmap(env, deps.grants),
      enabled: Boolean(env.STALWART_ADMIN_KEY),
    }),
  );
  if (env.STALWART_ADMIN_KEY) {
    app.route(
      "/api/rsvp",
      createRsvpRoutes({
        tokens,
        rsvp: createRsvp(createRequest(env.STALWART_URL, env.STALWART_ADMIN_KEY)),
        mayTry: createAttempts(env.SIGN_IN_PER_MINUTE),
      }),
    );
  }
};

export const mountCategories = (app: Hono, store: CategoryStore, session: Session) =>
  app.route("/api/categories", createCategoryRoutes({ store, accountsOf: session.accountsOf }));
