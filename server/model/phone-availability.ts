/**
 * Who takes calls on the phone line, and in which order they ring: Bitte nicht stören, away, and the
 * ring plan of a line. Pure.
 */
import { z } from "zod";

/** Whether someone takes calls: Bitte nicht stören, or away (until a time, or open-ended). */
export type PhoneStatus = {
  memberId: string;
  mode: "available" | "dnd" | "away";
  until: string | null;
};

export const statusSchema = z.object({
  mode: z.enum(["available", "dnd", "away"]),
  until: z.iso.datetime().nullable().default(null),
});

/** Who does not take calls at `now`: an away that has run out counts as back. */
export const unavailableAt = (statuses: PhoneStatus[], now: Date): string[] =>
  statuses
    .filter(
      (status) =>
        status.mode === "dnd" ||
        (status.mode === "away" && (!status.until || Date.parse(status.until) > now.getTime())),
    )
    .map((status) => status.memberId);

/** The plan without who does not take calls: the others ring (in order, as before). */
export const withoutUnavailable = (plan: RingPlan, unavailable: string[]): RingPlan => ({
  ...plan,
  order: plan.order.filter((member) => !unavailable.includes(member)),
});

/** How the line's people hear a call: all at once, or one after another (then all). */
export type RingPlan = { mode: "all" | "order"; stepSeconds: number; order: string[] };

/** Who hears a ringing call `seconds` after it started. Pure. */
export const ringingFor = (plan: RingPlan, seconds: number): string[] => {
  if (plan.mode === "all") return plan.order;
  const step = Math.floor(seconds / plan.stepSeconds);
  return step >= plan.order.length ? plan.order : plan.order.slice(step, step + 1);
};
