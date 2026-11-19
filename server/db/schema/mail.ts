/**
 * Around the mail: categories, Web Push, snippets, Wiedervorlage, image senders and the
 * person's other mailboxes.
 */

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { session, user } from "./auth";
import { timestamps } from "./columns";

/**
 * The mail categories of one Stalwart account (own or shared mailbox): names, colours and order
 * as JSON. The mails carry only the keyword (RFC 8621 keywords); Stalwart has no place for the rest.
 */
export const mailCategories = sqliteTable("mail_categories", {
  accountId: text("account_id").primaryKey(),
  categories: text("categories").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Web Push subscriptions of the browsers that switched notifications on (server/push/). Each
 * belongs to the sign-in session it was made in: signing out ends the pushes to that device.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** The person's personal account id. */
    memberId: text("member_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("push_subscriptions_member").on(table.memberId)],
);

/** Mailboxes someone does not want pushes for (e.g. info@ for who only helps out there). */
export const pushMailboxesOff = sqliteTable(
  "push_mailboxes_off",
  {
    memberId: text("member_id").notNull(),
    accountId: text("account_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.accountId] })],
);

/** Text snippets (server/snippets/): standard answers, per account – shared ones for the team. */
export const snippets = sqliteTable(
  "snippets",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [index("snippets_account").on(table.accountId)],
);

/**
 * Mails put away until a time ("Wiedervorlage", server/snooze/): they wait in the account's
 * snoozed folder and come back to the inbox then. `userId` is whose sign-in brings them back.
 */
export const snoozes = sqliteTable(
  "snoozes",
  {
    accountId: text("account_id").notNull(),
    emailId: text("email_id").notNull(),
    until: integer("until", { mode: "timestamp_ms" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The personal account id of who put it away, told when it is back. */
    by: text("by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.emailId] }),
    index("snoozes_until").on(table.until),
  ],
);

/**
 * Whose pictures from the internet one's mails show at once: an address, "@domain", or "@contacts"
 * for everyone in one's address books (server/images/).
 */
export const imageSenders = sqliteTable(
  "image_senders",
  {
    memberId: text("member_id").notNull(),
    address: text("address").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.address] })],
);

/**
 * Another mailbox a person keeps using from Kontext (their Gmail, GMX, web.de, …): new mails are
 * fetched over IMAP into their Stalwart account, mail from that address goes out through the
 * provider's SMTP server. Kontext leads; nothing is changed or deleted at the provider.
 */
export const externalAccount = sqliteTable(
  "external_account",
  {
    id: text("id").primaryKey(),
    /** The person's own Stalwart account the mails go into. */
    accountId: text("account_id").notNull(),
    /** The external address, sent from; the display name with it. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull(),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    /** The login at the provider, usually the address. */
    login: text("login").notNull(),
    /** The (app) password, sealed with the server secret. */
    secret: text("secret").notNull(),
    /** Into the inbox, or into a folder of its own (`folderId`, named after the address). */
    target: text("target", { enum: ["inbox", "folder"] }).notNull(),
    folderId: text("folder_id"),
    status: text("status", { enum: ["active", "running", "login-failed"] }).notNull(),
    /** JSON: the provider's inbox, its UIDVALIDITY and the last UID fetched. */
    state: text("state").notNull(),
    /** JSON: fetched, already there, failed. */
    counts: text("counts").notNull(),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [index("external_account_account").on(table.accountId)],
);
