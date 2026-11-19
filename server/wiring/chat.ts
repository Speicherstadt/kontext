/**
 * The team chat: its files and messages with their upkeep (unsent photos, the search text, what
 * is older than the company keeps), and its routes.
 */

import { dirname, join } from "node:path";
import type { Hono } from "hono";
import { createChatFiles } from "../chat/files";
import { backfillFolded } from "../chat/message-parts";
import { createMessageStore } from "../chat/messages";
import { createChatPruner, createChatRetention } from "../chat/retention";
import { createChatRoutes } from "../chat/routes";
import type { ChatStore } from "../chat/store";
import type { Db } from "../db";
import type { Env } from "../env";
import type { Hub } from "../live/hub";
import { createPgpStore } from "../pgp/store";
import type { Pusher } from "../push/pusher";
import type { createSessionInfo } from "../session-info";

const HOUR = 3_600_000;

/** The chat's stores, kept tidy at start and every hour. */
export const createChat = (env: Env, db: Db) => {
  const files = createChatFiles(db, join(dirname(env.DATABASE_PATH), "chat-files"));
  // Photos uploaded for a message that was never sent go after a day.
  const pruneFiles = () =>
    void files.pruneUnsent(new Date(Date.now() - 24 * HOUR)).catch(() => undefined);
  pruneFiles();
  setInterval(pruneFiles, HOUR).unref();
  const messages = createMessageStore(db, files);
  // Messages from before the search text was kept get it once.
  void backfillFolded(db).catch((error: Error) => console.warn(`Chat-Suche: ${error.message}`));
  // What is older than the company keeps goes, at start and every hour.
  const retention = createChatRetention(db);
  const pruner = createChatPruner({ retention, messages });
  const prune = () =>
    void pruner.tick().catch((error: Error) => console.warn(`Chat: ${error.message}`));
  prune();
  setInterval(prune, HOUR).unref();
  return { files, messages, retention, pruner };
};

export type Chat = ReturnType<typeof createChat>;

export const mountChat = (
  app: Hono,
  deps: {
    db: Db;
    chat: Chat;
    store: ChatStore;
    hub: Hub;
    pusher: Pusher;
    session: ReturnType<typeof createSessionInfo>;
  },
) => {
  const { chat, session } = deps;
  app.route(
    "/api/chat",
    createChatRoutes({
      store: deps.store,
      messages: chat.messages,
      files: chat.files,
      hub: deps.hub,
      accountsOf: session.accountsOf,
      notify: deps.pusher.notify,
      nameOf: async (request) => (await session.infoOf(request))?.name ?? "",
      retentionDays: chat.retention.days,
      publicKeyOf: async (memberId) => {
        const own = await createPgpStore(deps.db).own(memberId);
        return own
          ? { publicKey: own.publicKey, email: own.email, fingerprint: own.fingerprint }
          : null;
      },
    }),
  );
};
