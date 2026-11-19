/**
 * The Firmenverwaltung's own data: settings, signature details, subscribed calendars, moves
 * from other mailboxes and the shared mailboxes' folders in Dokumente.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";

/** Settings of the Firmenverwaltung that Stalwart has no place for, e.g. the company signature. */
export const companySetting = sqliteTable("company_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * A partner's mail domain: its addresses count as inside the company for the hint „Extern“
 * (server/company/external-hint.ts). One row per domain; the switch is a company_setting.
 */
export const partnerDomain = sqliteTable("partner_domain", {
  domain: text("domain").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** What a person entered for the company signature: [Telefon], [Mobil] … (server/company/signature.ts). */
export const signatureDetail = sqliteTable("signature_detail", {
  memberId: text("member_id").primaryKey(),
  phone: text("phone").notNull().default(""),
  mobile: text("mobile").notNull().default(""),
  position: text("position").notNull().default(""),
  department: text("department").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** A calendar a person subscribed to by its address (server/subscriptions/). */
export const calendarSubscription = sqliteTable("calendar_subscription", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  /** The person's account and the calendar the events go into. */
  accountId: text("account_id").notNull(),
  calendarId: text("calendar_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  /** What was written per UID last time (JSON), to see what changed. */
  written: text("written").notNull().default("{}"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** A move from an uploaded file into one account (Outlook PST, vCard, iCalendar), with progress. */
export const migrationJob = sqliteTable("migration_job", {
  id: text("id").primaryKey(),
  /** The Stalwart account the data goes into. */
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  /** The uploaded file: Outlook data file, contacts (vCard) or calendar (iCalendar). */
  source: text("source", { enum: ["pst", "vcf", "ics"] }).notNull(),
  fileName: text("file_name").notNull(),
  size: integer("size").notNull(),
  received: integer("received").notNull(),
  status: text("status", {
    enum: ["uploading", "queued", "running", "done", "failed"],
  }).notNull(),
  /** JSON: counts per kind (mails, contacts, events): total, imported, skipped, failed. */
  progress: text("progress").notNull(),
  error: text("error"),
  ...timestamps,
});

/** A running move from another mailbox over IMAP (Gmail, GMX, …), synced until it is finished. */
export const mailSync = sqliteTable("mail_sync", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  provider: text("provider").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  /** The old address, the IMAP login. */
  login: text("login").notNull(),
  /** The (app) password, sealed with the server secret. */
  secret: text("secret").notNull(),
  status: text("status", { enum: ["active", "running", "login-failed", "finished"] }).notNull(),
  /** JSON: per old folder its UIDVALIDITY and the last UID taken over. */
  state: text("state").notNull(),
  /** JSON: imported, added (already there, one more folder), failed. */
  counts: text("counts").notNull(),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  ...timestamps,
});

/**
 * The folder of a shared mailbox in Dokumente (server/documents/mailboxes.ts), by its id: members
 * may rename it, so its name does not find it again.
 */
export const mailboxFolders = sqliteTable("mailbox_folders", {
  mailboxId: text("mailbox_id").primaryKey(),
  folderId: text("folder_id").notNull(),
});
