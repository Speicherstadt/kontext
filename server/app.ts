/**
 * The Kontext server: sign-in (Better Auth) under /api/auth and a pass-through of JMAP to
 * Stalwart that adds the session's Stalwart token. The browser never holds a password or token.
 * The parts are wired in `wiring/`; the order of the routes matters where their paths overlap
 * (the Firmenverwaltung before its telephony, the app's files last).
 */

import { dirname, join } from "node:path";
import { Hono } from "hono";
import { version as packageVersion } from "../package.json";
import { createCategoryStore } from "./categories/store";
import { viewerOf } from "./chat/routes";
import { createChatStore } from "./chat/store";
import { fromOwnPage } from "./csrf";
import { createSessionBlobs } from "./documents/blobs";
import type { MailboxFolders } from "./documents/mailboxes";
import { createDocumentsRoutes } from "./documents/routes";
import type { Env } from "./env";
import { appPolicy, withAppHeaders } from "./headers";
import { createJmapProxy } from "./jmap-proxy";
import { createHub } from "./live/hub";
import { createLiveRoutes } from "./live/routes";
import { createPhotoRoutes } from "./photos/routes";
import { createPhotoStore } from "./photos/store";
import { createPlaceRoutes } from "./places/routes";
import { createSessionInfo } from "./session-info";
import { createAuthorityStore } from "./smime/authorities";
import { createSnoozeStore } from "./snooze/store";
import { createTaskStore } from "./tasks/store";
import { mountAgents } from "./wiring/agents";
import { mountCalls } from "./wiring/calls";
import { createChat, mountChat } from "./wiring/chat";
import { mountCompany } from "./wiring/company";
import { mountEncryption } from "./wiring/encryption";
import {
  mountCategories,
  mountExternalAccounts,
  mountInvitations,
  mountMailHelpers,
} from "./wiring/mail";
import { mountPush } from "./wiring/push";
import { createSignIn, mountSignIn, type SignIn } from "./wiring/sign-in";
import { mountStatic } from "./wiring/static";
import { mountDav, mountTasks } from "./wiring/tasks";

/** The app's policy on its pages and the check of the origin, also without Caddy in front. */
const guard = (app: Hono, env: Env) => {
  // The app's policy on its pages (headers.ts).
  const policy = appPolicy({ schreibzeug: env.SCHREIBZEUG_URL, livekit: env.LIVEKIT_PUBLIC_URL });
  app.use(async (c, next) => {
    await next();
    withAppHeaders(c.res.headers, policy);
  });
  // Changes with the session cookie only from Kontext's own pages (csrf.ts).
  const appOrigin = new URL(env.BETTER_AUTH_URL).origin;
  app.use(async (c, next) => {
    if (!fromOwnPage(c.req.raw, appOrigin)) {
      return c.json({ error: "Anfrage von einer fremden Seite abgelehnt" }, 403);
    }
    await next();
  });
};

/** Dokumente (Schreibzeug) in Kontext, asked as the signed-in person with their Stalwart token. */
const mountDocuments = (
  app: Hono,
  env: Env,
  { auth, grants, documents }: SignIn,
  mailboxes: MailboxFolders | null,
) =>
  app.route(
    "/api/documents",
    createDocumentsRoutes({
      url: env.SCHREIBZEUG_URL?.replace(/\/+$/, "") ?? null,
      schreibzeug: documents,
      mailboxes,
      askerOf: async (request) => {
        const session = await auth.api.getSession({ headers: request.headers });
        const stalwartToken = session && (await grants.accessToken(session.session.id));
        if (!session || !stalwartToken) return null;
        const { id, email, name } = session.user;
        return { person: { id, email, name }, stalwartToken };
      },
      blobs: createSessionBlobs(env.STALWART_URL),
    }),
  );

/** Place suggestions for an appointment's "Ort" (Photon, through the server) and contact photos. */
const mountPlacesAndPhotos = (
  app: Hono,
  env: Env,
  session: ReturnType<typeof createSessionInfo>,
) => {
  app.route(
    "/api/places",
    createPlaceRoutes({
      url: env.PLACES_URL,
      userAgent: `Kontext/${packageVersion} (+https://github.com/Speicherstadt/kontext)`,
      accountsOf: session.accountsOf,
    }),
  );
  app.route(
    "/api/photos",
    createPhotoRoutes({
      store: createPhotoStore(join(dirname(env.DATABASE_PATH), "photos")),
      accountsOf: session.accountsOf,
    }),
  );
};

export const createApp = async (env: Env) => {
  const signIn = await createSignIn(env);
  const { db, auth, grants } = signIn;
  const categories = createCategoryStore(db);
  const app = new Hono();
  guard(app, env);
  const chat = createChat(env, db);
  app.get("/healthz", (c) => c.text("ok"));
  // Which Kontext runs here (package.json, raised by the release); the settings set it beside the
  // app the device has loaded, which the service worker may still hold from before an update.
  // Open like /healthz: the app's public files carry the version too, and their hashed names tell
  // one release from the next, so hiding it here would hide nothing.
  app.get("/api/version", (c) => c.json({ version: packageVersion }));
  mountSignIn(app, signIn);
  const smimeAuthorities = createAuthorityStore(db);
  const company = env.STALWART_ADMIN_KEY
    ? await mountCompany(app, {
        env,
        adminKey: env.STALWART_ADMIN_KEY,
        signIn,
        categories,
        smimeAuthorities,
        chatRetention: chat.retention,
        chatPruner: chat.pruner,
      })
    : null;
  const session = createSessionInfo(env, auth, grants);
  company?.mountPersonal(session.accountsOf);
  if (company) {
    await mountExternalAccounts(app, { env, db, grants, importer: company.importer, session });
  }
  const hub = createHub();
  app.route(
    "/api/live",
    createLiveRoutes({
      hub,
      viewerOf: async (request) => {
        const accounts = await session.accountsOf(request);
        return accounts && viewerOf(accounts);
      },
    }),
  );
  const pusher = await mountPush(app, { env, db, grants, infoOf: session.infoOf });
  const chatStore = createChatStore(db, chat.messages);
  const tasks = createTaskStore(db);
  const snoozes = createSnoozeStore(db);
  /** A board got tasks the server made (telephony, CalDAV, rules): tell who sees it. */
  const tasksChanged = (accountId: string) =>
    hub.publish({ type: "tasks", accountId }, (viewer) => viewer.accountIds.includes(accountId));
  await mountCalls(app, {
    env,
    db,
    grants,
    hub,
    pusher,
    session,
    chatStore,
    messages: chat.messages,
    tasks,
    snoozes,
    tasksChanged,
  });
  mountChat(app, { db, chat, store: chatStore, hub, pusher, session });
  const taskNotices = mountTasks(app, { env, tasks, hub, pusher, session });
  mountDocuments(app, env, signIn, company?.mailboxFolders ?? null);
  const mcp = await mountAgents(app, { env, signIn, taskNotices });
  mountMailHelpers(app, { env, db, grants, snoozes, pusher, session });
  mountPlacesAndPhotos(app, env, session);
  mountEncryption(app, { env, db, pusher, session, smimeAuthorities });
  await mountInvitations(app, { env, grants, session });
  mountDav(app, { env, db, grants, tasks, snoozes, changed: tasksChanged, signIn: mcp });
  mountCategories(app, categories, session);
  const proxy = createJmapProxy(env, auth, grants);
  app.all("/jmap", (c) => proxy(c.req.raw));
  app.all("/jmap/*", (c) => proxy(c.req.raw));
  if (env.STATIC_DIR) mountStatic(app, env.STATIC_DIR);
  return { app, auth, db };
};
