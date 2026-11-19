/**
 * What a box's call events do to the calls: a new call appears in the list (ringing, closed, fax,
 * blocked, dialled at a desk phone), a known one moves on. A ringing call reaches its people by
 * Web Push, a missed one leaves "Zurückrufen" on the chosen board.
 */

import {
  answeredCallbacks,
  applyCallEvent,
  blockedCall,
  callbackTask,
  closedCall,
  faxCall,
  incomingCall,
  isDoor,
  menuMailboxCall,
  type PhoneCall,
  phoneNotice,
  type RingPlan,
  ringingFor,
  unavailableAt,
  withoutUnavailable,
} from "../model/phone";
import type { CallEvent } from "../model/phone-protocol";
import type { OneAtATime } from "./call-queue";
import { choiceOf, deskCall, deskOf, lineOf, ringPlanFor, ringPlanForCall } from "./lines";
import type { CallbackTasks } from "./service";
import type { PhoneStore } from "./store";

export type BoxEventContext = {
  store: PhoneStore;
  save: (call: PhoneCall) => Promise<void>;
  oneAtATime: OneAtATime;
  /** At most one side left in the room: its lines are hung up. */
  settle: (room: string) => Promise<void>;
  /** Who is on the phone changed (a desk phone call). */
  publishPeople: () => Promise<void>;
  notify?: (members: string[], notice: ReturnType<typeof phoneNotice>) => Promise<void>;
  tasks?: CallbackTasks;
  newId: () => string;
  now: () => Date;
};

export const createBoxEvents = (ctx: BoxEventContext) => {
  const { store, save, newId, now } = ctx;

  /** A missed call leaves "Zurückrufen" on the chosen board. */
  const leaveCallback = async (call: PhoneCall) => {
    const { callbackBoard } = await store.settings();
    const task = callbackBoard && ctx.tasks && callbackTask(call, callbackBoard, now());
    if (!task || !ctx.tasks) return;
    const { id } = await ctx.tasks.create(task);
    await save({ ...call, callbackTaskId: id });
  };

  /** Someone talked to the number: earlier "Zurückrufen" for it are done. */
  const closeCallbacks = async (talked: PhoneCall) => {
    if (!ctx.tasks) return;
    for (const call of answeredCallbacks(await store.callbacksOf(talked.remote), talked)) {
      await ctx.tasks.complete(call.callbackTaskId!);
      await save({ ...call, callbackTaskId: null });
    }
  };

  /**
   * Web Push to whoever hears the call now, and later to the next ones when they ring one after
   * another – as long as it still rings.
   */
  const ringPhones = (call: PhoneCall, plan: RingPlan) => {
    const notify = (members: string[]) =>
      void ctx.notify?.(members, phoneNotice(call)).catch(() => undefined);
    notify(ringingFor(plan, 0));
    if (plan.mode !== "order") return;
    plan.order.forEach((_, step) => {
      if (step === 0) return;
      const seconds = step * plan.stepSeconds;
      setTimeout(async () => {
        const now = await store.call(call.id);
        if (now?.state === "ringing") notify(ringingFor(plan, seconds));
      }, seconds * 1000).unref?.();
    });
  };

  /** Outside the opening hours: in the list, but nobody hears it ring. */
  const closed = async (boxId: string, event: CallEvent) => {
    const settings = await store.settings();
    const line = lineOf(settings, event.line);
    const members = ringPlanFor(settings, line).order;
    await save({
      ...closedCall(event, { id: newId(), boxId, members }),
      line: line?.label ?? null,
    });
  };

  /** Chose the mailbox in the voice menu: it never rang, the message belongs to this call. */
  const menuMailbox = async (boxId: string, event: CallEvent) => {
    const settings = await store.settings();
    const line = lineOf(settings, event.line);
    const choice = choiceOf(settings, event.choice);
    await save({
      ...menuMailboxCall(event, {
        id: newId(),
        boxId,
        members: ringPlanForCall(settings, line, choice).order,
      }),
      line: line?.label ?? null,
      topic: choice?.label ?? null,
    });
  };

  /** A call rings here: in the list, and it rings for the line's (or the door's) people. */
  const ringing = async (boxId: string, event: CallEvent) => {
    const settings = await store.settings();
    const line = lineOf(settings, event.line);
    const choice = choiceOf(settings, event.choice);
    const door = isDoor(settings.door, event.remote);
    const plan = withoutUnavailable(
      door
        ? { mode: "all", stepSeconds: 15, order: settings.door.members }
        : ringPlanForCall(settings, line, choice),
      unavailableAt(await store.statuses(), now()),
    );
    const call = {
      ...incomingCall(event, { id: newId(), boxId, members: plan.order }),
      line: line?.label ?? null,
      topic: choice?.label ?? null,
      door,
    };
    await save(call);
    ringPhones(call, plan);
  };

  /** An event for a call not yet in the list. */
  const onNewEvent = async (boxId: string, event: CallEvent) => {
    const incoming = event.direction === "in";
    if (event.state === "closed" && incoming) return closed(boxId, event);
    if (event.state === "mailbox" && incoming) return menuMailbox(boxId, event);
    if (event.state === "fax" && incoming) {
      // On the fax line: in the list as a fax, nobody hears it ring.
      const { ring } = await store.settings();
      return save(faxCall(event, { id: newId(), boxId, members: ring }));
    }
    if (event.state === "blocked") {
      // Turned away by the block list: in the list, as it happened, without ringing.
      const { ring } = await store.settings();
      return save(blockedCall(event, { id: newId(), boxId, members: ring }));
    }
    if (event.state === "ringing" && event.direction === "out" && event.desk) {
      // Dialled at a desk phone: in the list of its person (or the first line's people).
      return save(deskCall(await store.settings(), boxId, event, newId(), now()));
    }
    // Calls appear when they ring here; dialled ones exist from the dial on.
    if (event.state === "ringing" && incoming) return ringing(boxId, event);
  };

  /** An event for a call already in the list: read again in the queue, it may have changed. */
  const onKnownEvent = async (callId: string, event: CallEvent) => {
    const known = await store.call(callId);
    if (!known) return;
    const forwardTo = event.forwarded ? ((await store.settings()).forward?.number ?? null) : null;
    const applied = applyCallEvent(known, event, forwardTo);
    // Answered at a desk phone: whose it is, and which.
    const desk =
      event.desk && applied !== known ? deskOf(await store.settings(), event.desk) : null;
    const next = desk
      ? { ...applied, desk: desk.label, member: desk.member ?? applied.member }
      : applied;
    if (next === known) return;
    await save(next);
    if (next.outcome === "missed") {
      void ctx.notify?.(next.members, phoneNotice(next)).catch(() => undefined);
    }
    if (next.state === "ended" && known.state !== "ended") {
      await leaveCallback(next).catch(() => undefined);
    }
    if (next.state === "talking" && known.state !== "talking") {
      await closeCallbacks(next).catch(() => undefined);
    }
    // A line of a room ended (the caller hung up): is anyone left to talk to?
    if (next.state === "ended" && next.room) await ctx.settle(next.room);
    if (next.desk) await ctx.publishPeople();
  };

  return async (boxId: string, event: CallEvent): Promise<void> => {
    const known = await store.callOfBox(boxId, event.call);
    if (!known) return onNewEvent(boxId, event);
    await ctx.oneAtATime(known.id, () => onKnownEvent(known.id, event));
  };
};
