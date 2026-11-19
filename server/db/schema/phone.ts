/** Telephony (server/phone/). */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";

/**
 * Telephony (server/phone/): the telephone boxes at the customer (Asterisk plus the box agent),
 * known by a hashed token after pairing, and the calls that went through them.
 */
export const phoneBoxes = sqliteTable("phone_boxes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** SHA-256 of the box's token; null until the box has paired. */
  tokenHash: text("token_hash").unique(),
  /** SHA-256 of the pairing code while it is valid. */
  pairingHash: text("pairing_hash").unique(),
  pairingExpiresAt: integer("pairing_expires_at", { mode: "timestamp_ms" }),
  version: text("version"),
  /** JSON: the box's last status (registered at the Fritzbox, detail). */
  status: text("status"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const phoneCalls = sqliteTable(
  "phone_calls",
  {
    id: text("id").primaryKey(),
    boxId: text("box_id")
      .notNull()
      .references(() => phoneBoxes.id, { onDelete: "cascade" }),
    boxCallId: text("box_call_id").notNull(),
    direction: text("direction").notNull(),
    remote: text("remote").notNull(),
    local: text("local").notNull(),
    state: text("state").notNull(),
    outcome: text("outcome"),
    member: text("member"),
    /** JSON: the personal account ids who see the call. */
    members: text("members").notNull(),
    room: text("room"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    note: text("note").notNull(),
    callbackTaskId: text("callback_task_id"),
    voicemailSeconds: integer("voicemail_seconds"),
    offeredTo: text("offered_to"),
    offeredBy: text("offered_by"),
    offeredJoin: integer("offered_join", { mode: "boolean" }).notNull().default(false),
    held: integer("held", { mode: "boolean" }).notNull().default(false),
    forwardedTo: text("forwarded_to"),
    line: text("line"),
    desk: text("desk"),
    topic: text("topic"),
    door: integer("door", { mode: "boolean" }).notNull().default(false),
    fax: text("fax"),
    recording: text("recording"),
    recordingSeconds: integer("recording_seconds"),
  },
  (table) => [
    index("phone_calls_started").on(table.startedAt),
    index("phone_calls_box_call").on(table.boxId, table.boxCallId),
  ],
);

/** Whether someone takes phone calls now: "dnd" (Bitte nicht stören) or "away" until a time. */
export const phoneStatus = sqliteTable("phone_status", {
  memberId: text("member_id").primaryKey(),
  mode: text("mode").notNull(),
  until: integer("until", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
