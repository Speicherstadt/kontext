/**
 * Calls and telephony over LiveKit: video calls in the chat, Meet links and the phone boxes. Without
 * LiveKit the app is told so and shows no call buttons and no telephony.
 */

import { dirname, join } from "node:path";
import type { Hono } from "hono";
import type { Grants } from "../auth";
import { currentRoomEvents, type LiveKitConfig } from "../calls/livekit";
import { createMeetRoutes } from "../calls/meet-routes";
import { createCallRoutes, createCallState } from "../calls/routes";
import type { MessageStore } from "../chat/messages";
import { viewerOf } from "../chat/routes";
import type { ChatStore } from "../chat/store";
import { createSealer } from "../crypto";
import type { Db } from "../db";
import type { Env } from "../env";
import { createServerJmap } from "../jmap-server";
import type { Hub } from "../live/hub";
import { createPhone } from "../phone/setup";
import type { Pusher } from "../push/pusher";
import type { createSessionInfo } from "../session-info";
import type { SnoozeStore } from "../snooze/store";
import type { TaskStore } from "../tasks/store";

export type CallDeps = {
  env: Env;
  db: Db;
  grants: Grants;
  hub: Hub;
  pusher: Pusher;
  session: ReturnType<typeof createSessionInfo>;
  chatStore: ChatStore;
  messages: MessageStore;
  tasks: TaskStore;
  snoozes: SnoozeStore;
  /** A board got tasks the server made: tell who sees it. */
  tasksChanged: (accountId: string) => void;
};

/** LiveKit, when all three settings are there; calls are off otherwise. */
const liveKitOf = (env: Env): LiveKitConfig | null =>
  env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
    ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }
    : null;

/** The phone boxes: calls in the app, missed ones as "Zurückrufen", voicemail into the mailbox. */
const mountPhone = async (app: Hono, deps: CallDeps, people: PeopleOf, livekit: LiveKitConfig) => {
  const { env, tasks, tasksChanged, snoozes } = deps;
  const phone = createPhone({
    db: deps.db,
    sealer: await createSealer(env.BETTER_AUTH_SECRET, "phone"),
    hub: deps.hub,
    livekit,
    publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
    trunkHost: env.PHONE_SIP_HOST ?? new URL(env.BETTER_AUTH_URL).hostname,
    trunkPort: env.PHONE_SIP_PORT,
    ...people,
    notify: deps.pusher.notify,
    dir: join(dirname(env.DATABASE_PATH), "phone"),
    importMessage: createServerJmap({
      env,
      grants: deps.grants,
      sessions: async () => (await snoozes.sessionsFor("")).map(({ sessionId }) => sessionId),
    }).importMessage,
    tasks: {
      create: async (task) => {
        const made = await tasks.create(task, task.accountId);
        tasksChanged(task.accountId);
        return made;
      },
      complete: async (id) => {
        const done = await tasks.update(id, { status: "done" }, "phone");
        if (done) tasksChanged(done.accountId);
      },
    },
  });
  app.route("/api/phone", phone.routes);
  // Behind the Firmenverwaltung's check, which runs first for every /api/company path.
  if (env.STALWART_ADMIN_KEY) app.route("/api/company/phone", phone.adminRoutes);
  return phone;
};

type PeopleOf = {
  viewerOf: (request: Request) => Promise<ReturnType<typeof viewerOf> | null>;
  nameOf: (request: Request) => Promise<string>;
};

export const mountCalls = async (app: Hono, deps: CallDeps) => {
  const livekit = liveKitOf(deps.env);
  if (!livekit) {
    // The app asks; without LiveKit it shows no call buttons and no telephony.
    app.get("/api/calls", (c) => c.json({ enabled: false, calls: [] }));
    app.get("/api/phone", (c) =>
      c.json({ enabled: false, allowed: false, online: false, calls: [] }),
    );
    return;
  }
  const { env, hub, session } = deps;
  const callState = createCallState();
  const people: PeopleOf = {
    viewerOf: async (request) => {
      const accounts = await session.accountsOf(request);
      return accounts && viewerOf(accounts);
    },
    nameOf: async (request) => (await session.infoOf(request))?.name ?? "",
  };
  const phone = await mountPhone(app, deps, people, livekit);
  const calls = createCallRoutes(
    {
      livekit,
      publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
      hub,
      channelOf: deps.chatStore.get,
      ...people,
      notify: deps.pusher.notify,
      onRoomEvent: phone.onRoomEvent,
      postCall: (channelId, authorId, call) =>
        deps.messages.post({
          channelId,
          authorId,
          text: "",
          mentions: [],
          cards: [],
          fileIds: [],
          call,
        }),
    },
    callState,
  );
  app.route("/api/calls", calls.app);
  app.route(
    "/api/meet",
    createMeetRoutes(
      {
        livekit,
        publicUrl: env.LIVEKIT_PUBLIC_URL ?? null,
        origin: new URL(env.BETTER_AUTH_URL).origin,
        ...people,
      },
      callState,
    ),
  );
  // Calls that ran through a restart of this server: LiveKit still knows who is in them.
  void currentRoomEvents(livekit)
    .then(async (events) => {
      for (const event of events) await calls.receive(event);
    })
    .catch(() => undefined);
};
