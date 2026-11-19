/**
 * Encryption: OpenPGP and S/MIME keys, and "Vertraulich senden" (server/pgp/, server/smime/,
 * server/secure/).
 */
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * A person's own OpenPGP key (docs/encryption.md, building block 2). The secret part only as the
 * browser encrypted it: once with the person's passphrase, once with their recovery code; the
 * server cannot open either.
 */
export const pgpOwn = sqliteTable("pgp_own", {
  memberId: text("member_id").primaryKey(),
  email: text("email").notNull(),
  fingerprint: text("fingerprint").notNull(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  recoveryKey: text("recovery_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Other people's public keys a person knows, by address: where from, and an earlier one. */
export const pgpKeys = sqliteTable(
  "pgp_keys",
  {
    memberId: text("member_id").notNull(),
    email: text("email").notNull(),
    fingerprint: text("fingerprint").notNull(),
    publicKey: text("public_key").notNull(),
    /** autocrypt, attachment, import, keyserver, wkd */
    source: text("source").notNull(),
    /** The key before, when another came for the same address. */
    previousFingerprint: text("previous_fingerprint"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.email] })],
);

/**
 * A person's own S/MIME certificate (docs/encryption.md, building block 4): the .p12 file as it
 * came, locked with its password, which only the browser gets; and the certificate in it.
 */
export const smimeOwn = sqliteTable("smime_own", {
  memberId: text("member_id").primaryKey(),
  email: text("email").notNull(),
  fingerprint: text("fingerprint").notNull(),
  certificate: text("certificate").notNull(),
  /** The .p12 file, base64. */
  p12: text("p12").notNull(),
  notAfter: integer("not_after", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Other people's S/MIME certificates a person knows, by address: from signed mails or a file. */
export const smimeCerts = sqliteTable(
  "smime_certs",
  {
    memberId: text("member_id").notNull(),
    email: text("email").notNull(),
    fingerprint: text("fingerprint").notNull(),
    certificate: text("certificate").notNull(),
    issuer: text("issuer").notNull(),
    notAfter: integer("not_after", { mode: "timestamp_ms" }).notNull(),
    /** mail, import */
    source: text("source").notNull(),
    previousFingerprint: text("previous_fingerprint"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.email] })],
);

/**
 * Authorities the company trusts for S/MIME beyond Mozilla's list and `SMIME_ROOTS`: root or
 * intermediate certificates the Firmenverwaltung added (server/smime/authorities.ts).
 */
export const smimeAuthorities = sqliteTable("smime_authorities", {
  /** SHA-256 of the certificate, as node:crypto writes it ("AB:CD:…"). */
  fingerprint: text("fingerprint").primaryKey(),
  certificate: text("certificate").notNull(),
  subject: text("subject").notNull(),
  notAfter: integer("not_after", { mode: "timestamp_ms" }).notNull(),
  addedBy: text("added_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * "Vertraulich senden" (server/secure/): a message for a recipient without a key, read on a page
 * with a code. The content lies encrypted next to the database (`secure/<id>`); its key is only in
 * the link (after "#") and, for the sender, locked with their own OpenPGP key (`senderKey`).
 */
export const secureMessages = sqliteTable(
  "secure_messages",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    /** The message key as an OpenPGP message to the sender's own key. */
    senderKey: text("sender_key").notNull(),
    /** scrypt of the code, with its salt; wrong tries count, five lock it. */
    codeHash: text("code_hash").notNull(),
    codeSalt: text("code_salt").notNull(),
    failedTries: integer("failed_tries").notNull().default(0),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    openCount: integer("open_count").notNull().default(0),
  },
  (table) => [index("secure_messages_member").on(table.memberId)],
);

/** Answers from the recipient's page, encrypted with the message's key. */
export const secureReplies = sqliteTable("secure_replies", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => secureMessages.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
});
