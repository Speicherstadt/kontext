/**
 * Telephony at run time: the boxes that are connected, what their events do to the calls, and the
 * commands Kontext gives them (answer in a room, dial, hang up). Every change of a call goes out
 * on the live connection to whoever sees it; a ringing or missed call also reaches the line's
 * people with Kontext closed (Web Push).
 */

import type { Publisher } from "../chat/chat";
import {
  canSeeCall,
  isPerson,
  type PhoneCall,
  type PhoneEvent,
  type PhoneStatus,
  type phoneNotice,
  roomIsOver,
  unavailableAt,
} from "../model/phone";
import type { FromBox, ToBox } from "../model/phone-protocol";
import { companyDay, type NewTaskData } from "../model/tasks";
import { desiredConfig } from "./box-config";
import { createBoxEvents } from "./box-events";
import { createCallActions } from "./call-actions";
import { createCallQueue } from "./call-queue";
import { everyone } from "./lines";
import type { PhoneStore } from "./store";
import { createTransfers, type TransferTarget } from "./transfer";

/** What telephony needs from the tasks: make "Zurückrufen" and tick it off. */
export type CallbackTasks = {
  create: (task: NewTaskData) => Promise<{ id: string }>;
  complete: (id: string) => Promise<void>;
};

export type PhoneDeps = {
  store: PhoneStore;
  hub: Publisher<PhoneEvent>;
  /** Where the boxes reach LiveKit SIP: the server's public name and SIP port. */
  trunkHost: string;
  trunkPort: number;
  notify?: (members: string[], notice: ReturnType<typeof phoneNotice>) => Promise<void>;
  /** Re-creates LiveKit SIP's trunk when the password changes. */
  ensureSip?: (password: string) => Promise<unknown>;
  /** Missed calls become tasks on the chosen board (Firmenverwaltung). */
  tasks?: CallbackTasks;
  newId?: () => string;
  now?: () => Date;
};

export type Problem = "not-allowed" | "offline" | "not-found" | "busy" | "bad-number" | "full";

export { desiredConfig, ringPlanOf } from "./box-config";

export const createPhoneService = (deps: PhoneDeps) => {
  const { store, hub } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());
  const connected = new Map<string, (message: ToBox) => void>();
  /** Who of Kontext is in which phone room, from LiveKit's webhooks. */
  const presence = new Map<string, Set<string>>();
  const presentIn = (room: string | null) => (room ? [...(presence.get(room) ?? [])] : []);
  const withPresence = (call: PhoneCall): PhoneCall => ({ ...call, present: presentIn(call.room) });
  const oneAtATime = createCallQueue();

  const publish = (call: PhoneCall) => {
    const shown = withPresence(call);
    hub.publish({ type: "phone", call: shown }, (viewer) => canSeeCall(shown, viewer.me));
  };

  const save = async (call: PhoneCall) => {
    await store.saveCall(call);
    publish(call);
  };

  /**
   * When the next "Abwesend bis" runs out, the boxes get a new config (the desk phone rings
   * again) and everyone sees the person back. Looked at anew with every config, so a restart or a
   * long away is covered; long waits are cut into steps, as timers do not reach that far.
   */
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const watchStatuses = async () => {
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    const ends = (await store.statuses())
      .map((status) => (status.until ? Date.parse(status.until) - now().getTime() : 0))
      .filter((left) => left > 0);
    if (!ends.length) return;
    statusTimer = setTimeout(
      () => {
        void publishPeople();
        void sendConfig();
      },
      Math.min(...ends, 6 * 3_600_000),
    );
    statusTimer.unref?.();
  };

  const sendConfig = async (boxId?: string) => {
    const message: ToBox = {
      type: "config",
      version: now().getTime(),
      config: desiredConfig(
        await store.settings(),
        deps.trunkHost,
        deps.trunkPort,
        companyDay(now()),
        unavailableAt(await store.statuses(), now()),
      ),
    };
    for (const [id, send] of connected) if (!boxId || id === boxId) send(message);
    await watchStatuses();
  };

  const send = (call: PhoneCall, message: ToBox): boolean => {
    const to = connected.get(call.boxId);
    to?.(message);
    return Boolean(to);
  };

  /** Who is on the phone: in a phone room, or talking at a desk phone. */
  const busyPeople = async () => {
    const atDesks = (await store.recentCalls(50))
      .filter((call) => call.state === "talking" && call.desk && call.member)
      .map((call) => call.member!);
    return [...new Set([...[...presence.values()].flatMap((set) => [...set]), ...atDesks])];
  };

  /** For everyone (the chat shows it): who is on the phone, who does not take calls. */
  const publishPeople = async () => {
    const [busy, statuses] = await Promise.all([busyPeople(), store.statuses()]);
    hub.publish(
      { type: "phone-people", busy, unavailable: unavailableAt(statuses, now()) },
      () => true,
    );
  };

  /** At most one side left in a room: its lines are hung up. */
  const settle = async (room: string) => {
    const live = (await store.callsOfRoom(room)).filter((call) => call.state !== "ended");
    if (!live.length || !roomIsOver(presentIn(room), live)) return;
    for (const call of live) send(call, { type: "hangup", call: call.boxCallId });
  };

  const onEvent = createBoxEvents({
    store,
    save,
    oneAtATime,
    settle,
    publishPeople,
    notify: deps.notify,
    tasks: deps.tasks,
    newId,
    now,
  });
  const transfers = createTransfers({ store, save, send, newId, now });
  const allowed = async (me: string) => everyone(await store.settings()).includes(me);
  const online = () => [...connected.keys()];
  const { shown, ...actions } = createCallActions({
    store,
    save,
    publish,
    send,
    online,
    withPresence,
    /** Whoever has the call or is in its room may hold, resume and hang it up. */
    inCall: (call, me) => call.member === me || presentIn(call.room).includes(me),
    allowed,
    sendConfig: () => sendConfig(),
    oneAtATime,
    newId,
    now,
  });

  return {
    /** A box came online; the function it returns handles what the box says. */
    connect: (boxId: string, sendToBox: (message: ToBox) => void) => {
      connected.set(boxId, sendToBox);
      void sendConfig(boxId);
      return {
        receive: async (message: FromBox) => {
          if (message.type === "hello") await store.seen(boxId, { version: message.version });
          if (message.type === "status") {
            await store.seen(boxId, {
              status: { registered: message.registered, detail: message.detail },
            });
          }
          if (message.type === "event") {
            await onEvent(boxId, message);
            sendToBox({ type: "ack", seq: message.seq });
          }
          if (message.type === "applied") await store.seen(boxId, {});
        },
        close: () => {
          if (connected.get(boxId) === sendToBox) connected.delete(boxId);
        },
      };
    },

    online,
    allowed,

    /** The settings changed: tell the boxes and LiveKit SIP. */
    reconfigure: async () => {
      const settings = await store.settings();
      await deps.ensureSip?.(settings.trunkPassword);
      await sendConfig();
    },

    callsOf: async (me: string, limit = 100): Promise<PhoneCall[]> =>
      (await store.recentCalls(limit * 3))
        .filter((call) => canSeeCall(call, me))
        .slice(0, limit)
        .map(withPresence),

    ...actions,

    /** Someone of Kontext joined a phone room (LiveKit's webhook). */
    joinedRoom: async (room: string, identity: string) => {
      if (!isPerson(identity)) return;
      presence.set(room, new Set([...presentIn(room), identity]));
      for (const call of await store.callsOfRoom(room)) publish(call);
      await publishPeople();
    },

    /**
     * Someone left a phone room (hung up, handed over, closed the tab): with at most one side
     * left, the room's lines end.
     */
    leftRoom: async (room: string, identity: string) => {
      if (!isPerson(identity)) return;
      const left = presentIn(room).filter((other) => other !== identity);
      if (left.length) presence.set(room, new Set(left));
      else presence.delete(room);
      for (const call of await store.callsOfRoom(room)) publish(call);
      await publishPeople();
      await settle(room);
    },

    /** Who is on the phone and who does not take calls, as the app shows it. */
    people: async () => ({
      busy: await busyPeople(),
      unavailable: unavailableAt(await store.statuses(), now()),
    }),

    statusOf: async (me: string): Promise<PhoneStatus> =>
      (await store.statuses()).find((status) => status.memberId === me) ?? {
        memberId: me,
        mode: "available",
        until: null,
      },

    /**
     * Bitte nicht stören, Abwesend (until a time) or back: it no longer rings for them, their desk
     * phone stays quiet, and everyone sees it.
     */
    setStatus: async (status: PhoneStatus) => {
      await store.setStatus(status, now());
      await publishPeople();
      // Also sets the timer for when the away runs out (watchStatuses).
      await sendConfig();
    },

    transfer: (callId: string, me: string, target: TransferTarget) =>
      shown(transfers.transfer(callId, me, target)),
    takeTransfer: (callId: string, me: string) =>
      oneAtATime(callId, () => shown(transfers.take(callId, me))),
    cancelTransfer: (callId: string, me: string) => shown(transfers.cancel(callId, me)),

    /** The call changed outside the service (a message arrived): tell who sees it. */
    refresh: async (callId: string) => {
      const call = await store.call(callId);
      if (call) publish(call);
    },
  };
};

export type PhoneService = ReturnType<typeof createPhoneService>;
