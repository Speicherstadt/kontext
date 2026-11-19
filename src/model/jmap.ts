/** The parts of the JMAP data model (RFC 8621, JSContact, JSCalendar) that the app reads, and pure helpers on them. */

export type EmailAddress = { name: string | null; email: string };

export type Mailbox = {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  /** RFC 8621 §2: what the user may do here; less in a mailbox shared only for reading. */
  myRights?: {
    mayReadItems?: boolean;
    mayAddItems?: boolean;
    mayRemoveItems?: boolean;
    maySetSeen?: boolean;
    maySetKeywords?: boolean;
    mayCreateChild?: boolean;
    mayRename?: boolean;
    mayDelete?: boolean;
    maySubmit?: boolean;
    /** draft-ietf-jmap-metadata: may write shared metadata (Kontext's assignment). */
    maySetMetadata?: boolean;
  };
};

export type EmailSummary = {
  id: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  subject: string | null;
  receivedAt: string;
  preview: string;
  hasAttachment: boolean;
  size: number;
  /** The raw Content-Type, where loaded: an encrypted mail in the list. */
  "header:Content-Type"?: string | null;
  /** The raw Authentication-Results, topmost first, where loaded (jmap/mail.ts). */
  "header:Authentication-Results:asText:all"?: string[] | null;
  /** In search results, which also find a word there (lib/attachment-hit.ts). */
  cc?: EmailAddress[] | null;
  bcc?: EmailAddress[] | null;
  /** In search results: the marked subject and text (SearchSnippet, lib/attachment-hit.ts). */
  snippet?: { subject: string | null; preview: string | null };
  /** Shared metadata by namespace (draft-ietf-jmap-metadata); Kontext's: lib/assignment.ts. */
  metadata?: Record<string, Record<string, unknown>>;
};

export type BodyPart = {
  partId: string | null;
  blobId: string | null;
  type: string;
  name: string | null;
  size: number;
  cid: string | null;
  disposition: string | null;
};

/** A part with its children (RFC 8621 §4.1.4): the MIME tree, for the S/MIME layering. */
export type BodyStructure = BodyPart & { subParts: BodyStructure[] | null };

/** One header field as the `headers` property lists them, in order, raw (RFC 8621 §4.1.3). */
export type EmailHeader = { name: string; value: string };

export type EmailDetail = EmailSummary & {
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  sentAt: string | null;
  messageId: string[] | null;
  references: string[] | null;
  inReplyTo: string[] | null;
  htmlBody: BodyPart[];
  textBody: BodyPart[];
  attachments: BodyPart[];
  bodyStructure: BodyStructure | null;
  bodyValues: Record<string, { value: string; isTruncated?: boolean }>;
  /** Headers the mail server adds on arrival, topmost first (src/lib/sender-check.ts). */
  authenticationResults: string[] | null;
  spamScore: string[] | null;
  /** Every header field in order, raw: for Stalwart's X-Spam-AI (src/lib/spam-ai.ts). */
  headers?: EmailHeader[] | null;
  /** The whole message as sent, to read an encrypted or signed one. */
  blobId: string;
  /** The raw Content-Type: multipart/encrypted or multipart/signed for PGP/MIME. */
  contentType: string | null;
  /** The sender's key, if sent along (Autocrypt). */
  autocrypt: string | null;
  /** The Received lines, topmost first: whether it came encrypted. */
  received: string[] | null;
  /** Who asks for a read receipt (Disposition-Notification-To), if anyone. */
  receiptTo: EmailAddress[] | null;
  /** The newsletter's ways to unsubscribe (List-Unsubscribe), and whether one click does it. */
  unsubscribe: string[] | null;
  unsubscribePost: string | null;
};

export type Identity = {
  id: string;
  name: string;
  email: string;
  replyTo: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  textSignature: string;
  htmlSignature: string;
};

export type Account = { id: string; name: string; isPersonal: boolean; isReadOnly: boolean };

/** A person or group of the company (JMAP Sharing, RFC 9670); in Stalwart its id is also its account id. */
export type Principal = {
  id: string;
  type: "individual" | "group" | "resource" | "location" | "other";
  name: string;
  description?: string | null;
  email?: string | null;
};

/** "Anna Weber" – Stalwart keeps the display name in `description`, the login in `name`. */
export const principalName = (principal: Principal): string =>
  principal.description || principal.email || principal.name;

/** The part to display: the HTML body if there is one, else the text body as HTML. */
export const displayBody = (email: EmailDetail): { kind: "html" | "text"; value: string } => {
  const pick = (parts: BodyPart[]) =>
    parts
      .map((part) => (part.partId ? email.bodyValues[part.partId]?.value : undefined))
      .filter(Boolean)
      .join("\n");
  const hasHtml = email.htmlBody.some((part) => part.type === "text/html");
  if (hasHtml) return { kind: "html", value: pick(email.htmlBody) };
  return { kind: "text", value: pick(email.textBody) };
};
