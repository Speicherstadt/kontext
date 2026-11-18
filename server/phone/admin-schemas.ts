/** What the Firmenverwaltung may send to the phone settings (admin-routes.ts). */
import { z } from "zod";
import { calendarDay, hoursSchema, lineSchema, MAX_BLOCKED_NUMBERS } from "./protocol";

export const lineInput = lineSchema.extend({
  /** Left empty, the stored password stays. */
  password: z.string().max(200).default(""),
});
export const ringSchema = z.object({
  members: z.array(z.string().min(1).max(64)).max(200),
  mode: z.enum(["all", "order"]).default("all"),
  stepSeconds: z.number().int().min(5).max(60).default(15),
  forward: z
    .object({
      number: z.string().trim().min(3).max(40),
      afterSeconds: z.number().int().min(0).max(120),
    })
    .nullable()
    .default(null),
});
export const callbacksSchema = z.object({ board: z.string().min(1).max(64).nullable() });
export const mailboxSchema = z.object({
  enabled: z.boolean(),
  ringSeconds: z.number().int().min(10).max(120),
  greeting: z.string().max(64).nullable(),
  /** The account whose inbox gets the messages: a shared mailbox or a person. */
  deliverTo: z.string().min(1).max(64).nullable(),
});
export const hoursInput = z.object({
  enabled: z.boolean(),
  open: hoursSchema.shape.open,
  closedDays: z
    .array(
      z.object({
        day: calendarDay,
        name: z.string().trim().max(60),
      }),
    )
    .max(100),
  greeting: z.string().max(64).nullable(),
});
export const linesSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9]{1,12}$/)
          .optional(),
        label: z.string().trim().min(1).max(60),
        username: z.string().trim().min(1).max(100),
        /** Left empty, the stored password stays. */
        password: z.string().max(200).default(""),
        ring: z.array(z.string().min(1).max(64)).max(200),
      }),
    )
    .max(9),
});
export const desksSchema = z.object({
  desks: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9]{1,12}$/)
          .optional(),
        label: z.string().trim().min(1).max(60),
        mac: z
          .string()
          .transform((mac) => mac.toLowerCase().replace(/[^0-9a-f]/g, ""))
          .pipe(z.string().length(12)),
        extension: z.string().regex(/^[1-9]\d{1,3}$/),
        member: z.string().min(1).max(64).nullable(),
      }),
    )
    .max(30),
});
export const menuInput = z.object({
  enabled: z.boolean(),
  greeting: z.string().max(64).nullable(),
  options: z
    .array(
      z.object({
        digit: z.string().regex(/^[0-9]$/),
        label: z.string().trim().min(1).max(60),
        members: z.array(z.string().min(1).max(64)).max(200),
        mailbox: z.boolean(),
      }),
    )
    .max(10),
});
export const blockedInput = z.object({
  numbers: z.array(z.string().trim().min(3).max(40)).max(MAX_BLOCKED_NUMBERS),
  anonymous: z.boolean(),
});
export const doorInput = z.object({
  enabled: z.boolean(),
  number: z
    .string()
    .trim()
    .regex(/^[0-9*#+ ]{2,20}$/),
  code: z
    .string()
    .trim()
    .regex(/^[0-9*#]{1,8}$/),
  members: z.array(z.string().min(1).max(64)).max(200),
});
export const faxInput = z.object({
  enabled: z.boolean(),
  line: z.string().max(100),
  deliverTo: z.string().min(1).max(64).nullable(),
});
export const recordingInput = z.object({
  enabled: z.boolean(),
  notice: z.string().max(64).nullable(),
});
export const boxSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** Short ids for the box's endpoint names ("fritzbox-<id>"). */
