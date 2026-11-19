/** The chat (server/chat/): channels, members, messages and what hangs on them. */

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";

/**
 * Team chat (server/chat/): the channels, who belongs to the named and direct ones, the messages
 * and up to when each person has read a channel. People are personal account ids.
 */
export const chatChannels = sqliteTable(
  "chat_channels",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name"),
    /** The shared mailbox of a mailbox channel: one channel per mailbox. */
    accountId: text("account_id").unique(),
    /** The sorted members of a direct channel: the same people find the same conversation. */
    directKey: text("direct_key").unique(),
    /** End-to-end encrypted (docs/encryption.md, building block 5): the server holds only cipher text. */
    confidential: integer("confidential", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("chat_channels_kind").on(table.kind)],
);

export const chatMembers = sqliteTable(
  "chat_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.memberId] }),
    index("chat_members_member").on(table.memberId),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    text: text("text").notNull(),
    /** JSON: the personal account ids mentioned with @. */
    mentions: text("mentions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    /** A deleted message keeps its place ("Nachricht gelöscht") but loses its content. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    /** JSON CallRecord: a call that ended here (server/calls/), else null. */
    call: text("call"),
    /** An answer in the thread of this message (never an answer to an answer). */
    parentId: text("parent_id"),
    /** An answer that also stands in the channel ("Auch im Kanal zeigen"); false otherwise. */
    alsoInChannel: integer("also_in_channel", { mode: "boolean" }).notNull().default(false),
    /**
     * Text and card titles in lower case as German writes it ("Ö" → "ö"), for the search:
     * SQLite's own LIKE ignores case only for ASCII. Null until filled in at start.
     */
    folded: text("folded"),
  },
  (table) => [
    index("chat_messages_channel").on(table.channelId, table.createdAt),
    index("chat_messages_parent").on(table.parentId, table.createdAt),
  ],
);

/** Reactions to a message: each person each emoji once. */
export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.memberId, table.emoji] })],
);

/** One person's settings for a channel: muted ones count no unread and send no notification. */
export const chatPrefs = sqliteTable(
  "chat_prefs",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    muted: integer("muted", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.memberId] })],
);

export const chatReads = sqliteTable(
  "chat_reads",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.memberId] })],
);

/**
 * Photos and files of chat messages; the bytes lie in the data directory under `chat-files/`.
 * `messageId` is null between the upload and sending the message.
 */
export const chatFiles = sqliteTable(
  "chat_files",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    /** A small picture of a photo next to it (`<id>.thumb`), made by the app when uploading. */
    hasThumb: integer("has_thumb", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("chat_files_message").on(table.messageId)],
);

/** Mails, tasks and contacts shared in a message; by `ref` and `thread_id` a mail finds its talks. */
export const chatCards = sqliteTable(
  "chat_cards",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    accountId: text("account_id").notNull(),
    ref: text("ref").notNull(),
    threadId: text("thread_id"),
    party: text("party").notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull(),
    /** A mail shared as a copy: the chat file with its content, readable without the mailbox. */
    copyId: text("copy_id"),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.position] }),
    index("chat_cards_ref").on(table.ref),
    index("chat_cards_thread").on(table.threadId),
    index("chat_cards_party").on(table.party),
  ],
);
