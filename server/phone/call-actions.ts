/**
 * What people do with calls in Kontext: answer, dial, hang up, hold, record, open the door, block a
 * number and note something. Each checks who may do it, tells the box and saves the call.
 */

import { canSeeCall, dialTarget, outgoingCall, type PhoneCall, takeCall } from "../model/phone";
import { toE164 } from "../model/phone-numbers";
import { MAX_BLOCKED_NUMBERS, type ToBox } from "../model/phone-protocol";
import type { OneAtATime } from "./call-queue";
import { outLineOf } from "./lines";
import type { Problem } from "./service";
import type { PhoneStore } from "./store";

export type CallActionContext = {
  store: PhoneStore;
  save: (call: PhoneCall) => Promise<void>;
  /** Tells who sees the call, without saving it. */
  publish: (call: PhoneCall) => void;
  /** Sends to the call's box; false when it is offline. */
  send: (call: PhoneCall, message: ToBox) => boolean;
  /** The ids of the boxes that are online, the first one dials. */
  online: () => string[];
  withPresence: (call: PhoneCall) => PhoneCall;
  /** Whoever has the call or is in its room. */
  inCall: (call: PhoneCall, me: string) => boolean;
  /** Who belongs to a line or the desk phones. */
  allowed: (me: string) => Promise<boolean>;
  /** Tells the boxes the settings changed. */
  sendConfig: () => Promise<void>;
  oneAtATime: OneAtATime;
  newId: () => string;
  now: () => Date;
};

export const createCallActions = (ctx: CallActionContext) => {
  const { store, save, send, withPresence, inCall, newId, now } = ctx;

  /** A call as the app gets it back from a request: with who is in its room. */
  const shown = async (result: Promise<PhoneCall | Problem>): Promise<PhoneCall | Problem> => {
    const call = await result;
    return typeof call === "string" ? call : withPresence(call);
  };

  /** Music for the line outside and out of the room, or back in. */
  const setHeld = async (callId: string, me: string, held: boolean) => {
    const call = await store.call(callId);
    if (!call || !inCall(call, me) || !call.room) return "not-found" as const;
    if (call.state !== "talking" || call.held === held) return "busy" as const;
    const message: ToBox = held
      ? { type: "hold", call: call.boxCallId }
      : { type: "resume", call: call.boxCallId, room: call.room };
    if (!send(call, message)) return "offline" as const;
    const next = { ...call, held };
    await save(next);
    return next;
  };

  return {
    shown,

    /** Take a ringing call in Kontext: the box puts it into a new room, which the caller joins. */
    answer: (callId: string, me: string): Promise<PhoneCall | Problem> =>
      ctx.oneAtATime(callId, async () => {
        const call = await store.call(callId);
        if (!call || !canSeeCall(call, me)) return "not-found";
        // Hung up meanwhile: the call is gone, not taken by someone else.
        if (call.state === "ended") return "not-found";
        const taken = takeCall(call, me, newId());
        if (!taken) return "busy";
        if (!ctx.online().includes(taken.boxId)) return "offline";
        // Saved before the box hears of it: its "answered" may come back at once and must apply
        // to the taken call, not be overwritten by it.
        await save(taken);
        send(taken, { type: "answer", call: taken.boxCallId, room: taken.room! });
        return taken;
      }),

    /** Call a number from Kontext, through a box that is online. */
    dial: async (me: string, number: string): Promise<PhoneCall | Problem> => {
      if (!(await ctx.allowed(me))) return "not-allowed";
      const settings = await store.settings();
      const target = dialTarget(
        number,
        settings.deskPhones.map((desk) => desk.extension),
      );
      if (!target) return "bad-number";
      const [boxId] = ctx.online();
      if (!boxId) return "offline";
      const line = outLineOf(settings, me);
      const call = {
        ...outgoingCall({
          id: newId(),
          boxId,
          member: me,
          remote: target.remote,
          room: newId(),
          at: now().toISOString(),
        }),
        line: line?.label ?? null,
      };
      await save(call);
      send(call, {
        type: "dial",
        call: call.id,
        room: call.room!,
        number: target.dial,
        ...(line ? { line: line.id } : {}),
      });
      return call;
    },

    hangup: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !inCall(call, me)) return "not-found";
      if (call.state !== "ended") send(call, { type: "hangup", call: call.boxCallId });
      return call;
    },

    hold: (callId: string, me: string) => shown(setHeld(callId, me, true)),
    resume: (callId: string, me: string) => shown(setHeld(callId, me, false)),

    /** Start or stop recording a call one is in (if the Firmenverwaltung allows it). */
    record: async (callId: string, me: string, on: boolean): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !inCall(call, me) || !call.room) return "not-found";
      if (!(await store.settings()).recording.enabled) return "not-allowed";
      if (call.state !== "talking" || call.held || (call.recording === "running") === on) {
        return "busy";
      }
      const message: ToBox = on
        ? { type: "record", call: call.boxCallId, room: call.room }
        : { type: "record-stop", call: call.boxCallId };
      if (!send(call, message)) return "offline";
      const state = on ? "running" : "stopped";
      await store.setRecording(call.id, state);
      const next = { ...call, recording: state } as PhoneCall;
      ctx.publish(next);
      return withPresence(next);
    },

    /** Open the door for whoever rang: the box picks up, sends the code and hangs up. */
    openDoor: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call?.door || !canSeeCall(call, me)) return "not-found";
      if (call.state === "ended") return "busy";
      const { code } = (await store.settings()).door;
      if (!send(call, { type: "door-open", call: call.boxCallId, code })) return "offline";
      const opened = { ...call, member: me };
      await save(opened);
      return withPresence(opened);
    },

    /** Someone of the line blocks a number from the list: the box turns it away from now on. */
    block: async (me: string, number: string): Promise<"ok" | Problem> => {
      if (!(await ctx.allowed(me))) return "not-allowed";
      const e164 = toE164(number);
      if (!e164) return "bad-number";
      const settings = await store.settings();
      if (!settings.blocked.numbers.some((entry) => entry.number === e164)) {
        if (settings.blocked.numbers.length >= MAX_BLOCKED_NUMBERS) return "full";
        const entry = { number: e164, by: me, at: now().toISOString() };
        await store.saveSettings({
          ...settings,
          blocked: { ...settings.blocked, numbers: [...settings.blocked.numbers, entry] },
        });
        await ctx.sendConfig();
      }
      return "ok";
    },

    note: async (callId: string, me: string, note: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !canSeeCall(call, me)) return "not-found";
      const next = { ...call, note };
      await save(next);
      return withPresence(next);
    },
  };
};
