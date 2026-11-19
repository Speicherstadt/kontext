/** The phone line's stored settings and the secrets of pairing a box. */
import { z } from "zod";
import { hoursSchema, lineSchema } from "../model/phone-protocol";

/** Stored settings; what later versions added comes with its default when it is missing. */
export const settingsSchema = z.object({
  /** The box's login at the Fritzbox (an IP phone there). */
  line: lineSchema.nullable().default(null),
  /** Who hears an incoming call ring and sees the calls (personal account ids). */
  ring: z.array(z.string()).default([]),
  /** The password of the SIP trunk from the boxes to LiveKit SIP; made once. */
  trunkPassword: z.string().min(1),
  /** The board (an account id) a missed call leaves "Zurückrufen" on; null for none. */
  callbackBoard: z.string().nullable().default(null),
  /** Greetings recorded or uploaded in the Firmenverwaltung (files: server/phone/files.ts). */
  sounds: z.array(z.object({ id: z.string(), name: z.string(), seconds: z.number() })).default([]),
  /** Unanswered calls go to the mailbox; its messages arrive as mails in `deliverTo`. */
  mailbox: z
    .object({
      enabled: z.boolean(),
      ringSeconds: z.number().int().min(10).max(120),
      greeting: z.string().nullable(),
      deliverTo: z.object({ accountId: z.string(), email: z.string() }).nullable(),
    })
    .default({ enabled: false, ringSeconds: 25, greeting: null, deliverTo: null }),
  /** Outside these hours the phone does not ring; the caller hears the closing greeting. */
  hours: z
    .object({
      enabled: z.boolean(),
      open: hoursSchema.shape.open,
      closedDays: z.array(z.object({ day: z.string(), name: z.string() })),
      greeting: z.string().nullable(),
    })
    .default({ enabled: false, open: [], closedDays: [], greeting: null }),
  /** More numbers: further IP phones at the Fritzbox, each ringing for its own people. */
  extraLines: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        username: z.string(),
        password: z.string(),
        ring: z.array(z.string()),
      }),
    )
    .default([]),
  /** A voice menu before it rings: each key rings for its people, or goes to the mailbox. */
  menu: z
    .object({
      enabled: z.boolean(),
      greeting: z.string().nullable(),
      options: z.array(
        z.object({
          digit: z.string(),
          label: z.string(),
          members: z.array(z.string()),
          mailbox: z.boolean(),
        }),
      ),
    })
    .default({ enabled: false, greeting: null, options: [] }),
  /** Numbers the box turns away (E.164), and whether withheld numbers are turned away too. */
  blocked: z
    .object({
      numbers: z.array(z.object({ number: z.string(), by: z.string(), at: z.string() })),
      anonymous: z.boolean(),
    })
    .default({ numbers: [], anonymous: false }),
  /** Recording calls, and the notice the other side hears first. */
  recording: z
    .object({ enabled: z.boolean(), notice: z.string().nullable() })
    .default({ enabled: false, notice: null }),
  /** A fax line (the user name of one of the box's lines); faxes arrive as PDF mails. */
  fax: z
    .object({
      enabled: z.boolean(),
      line: z.string(),
      deliverTo: z.object({ accountId: z.string(), email: z.string() }).nullable(),
    })
    .default({ enabled: false, line: "", deliverTo: null }),
  /** The door intercom at the Fritzbox: how it calls (its number), its opening code, who hears it. */
  door: z
    .object({
      enabled: z.boolean(),
      number: z.string(),
      code: z.string(),
      members: z.array(z.string()),
    })
    .default({ enabled: false, number: "**11", code: "#", members: [] }),
  /** Desk phones (Snom) that sign in at the box and ring with Kontext. */
  deskPhones: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        mac: z.string(),
        extension: z.string(),
        password: z.string(),
        /** Whose phone it is: it rings for that person's lines; null: the first line's. */
        member: z.string().nullable(),
      }),
    )
    .default([]),
  /** All at once, or the people in `ring`'s order, each for stepSeconds, then all. */
  ringMode: z.enum(["all", "order"]).default("all"),
  ringStepSeconds: z.number().int().min(5).max(60).default(15),
  /** While it rings in Kontext, after a while also a mobile phone, E.164. */
  forward: z
    .object({ number: z.string(), afterSeconds: z.number().int().min(0).max(120) })
    .nullable()
    .default(null),
});
export type PhoneSettings = z.infer<typeof settingsSchema>;

export const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** A random secret, URL-safe. */
export const randomSecret = (bytes = 32): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** "K7QM-4XPA": easy to read aloud and type, no 0/O or 1/I. */
export const pairingCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const picks = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(picks, (pick) => alphabet[pick % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
};
