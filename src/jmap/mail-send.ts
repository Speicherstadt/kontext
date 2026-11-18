/** Writing mails on top of the JMAP client (RFC 8621): send, save drafts, read drafts and originals. */

import { envelopeIdOf, type Hold, submissionEnvelope } from "@/lib/envelope";
import { bodyStructureOf } from "@/lib/mail-structure";
import { replyReferences } from "@/lib/references";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";
import { assertAccepted } from "./refused";
import type { BodyPart, EmailAddress, EmailSummary, Identity } from "./types";

export type OutgoingAttachment = { blobId: string; name: string; type: string; size: number };
/** An image in the text, which the HTML shows as `cid:` (lib/inline-images.ts). */
export type OutgoingImage = OutgoingAttachment & { cid: string };

export type OutgoingEmail = {
  accountId: string;
  identity: Identity;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  /** Where answers go; left out, the identity's default (Identity.replyTo, RFC 8621 §6). */
  replyTo?: EmailAddress[];
  subject: string;
  html: string;
  text: string;
  attachments: OutgoingAttachment[];
  /** The images in the text. */
  images?: OutgoingImage[];
  inReplyTo?: string[] | null;
  references?: string[] | null;
  /** A saved draft this mail replaces; it is removed after sending. */
  draftId?: string | null;
  /** Ask for a read receipt (Disposition-Notification-To, RFC 8098), to the sender. */
  requestReceipt?: boolean;
  /** Ask the receiving servers for a delivery report (DSN, RFC 3461), to the sender. */
  requestDelivery?: boolean;
  /** One's public key along with the mail (the Autocrypt header's value). */
  autocrypt?: string | null;
};

/** The Reply-To a mail goes with: the one written in the composer, else the identity's. */
export const replyToOf = (mail: Pick<OutgoingEmail, "replyTo" | "identity">): EmailAddress[] =>
  mail.replyTo ?? mail.identity.replyTo ?? [];

/** A long header value folded into lines (RFC 5322 §2.2.3), as the raw form needs it. */
const folded = (value: string) => ` ${value.replace(/(.{76})(?=.)/g, "$1\r\n ")}`;

const emailCreate = (mail: OutgoingEmail, mailboxIds: Record<string, boolean>, draft: boolean) => ({
  mailboxIds,
  keywords: { $seen: true, ...(draft ? { $draft: true } : {}) },
  from: [{ name: mail.identity.name, email: mail.identity.email }],
  to: mail.to,
  cc: mail.cc,
  bcc: mail.bcc,
  ...(replyToOf(mail).length ? { replyTo: replyToOf(mail) } : {}),
  subject: mail.subject,
  ...(mail.requestReceipt
    ? {
        "header:Disposition-Notification-To:asAddresses": [
          { name: mail.identity.name, email: mail.identity.email },
        ],
      }
    : {}),
  ...(mail.autocrypt ? { "header:Autocrypt:asRaw": folded(mail.autocrypt) } : {}),
  ...(mail.inReplyTo?.length ? { inReplyTo: mail.inReplyTo } : {}),
  ...(mail.references?.length || mail.inReplyTo?.length
    ? { references: replyReferences(mail.references, mail.inReplyTo) }
    : {}),
  bodyValues: { text: { value: mail.text }, html: { value: mail.html } },
  bodyStructure: bodyStructureOf(mail.attachments, mail.images),
});

export type { Hold } from "@/lib/envelope";

/**
 * Creates the mail in Drafts, submits it, and on success moves it to Sent (RFC 8621 §7.5); held
 * for "Rückgängig" or "Später senden", and with a delivery report asked for, through the envelope
 * (src/lib/envelope.ts). A mail asking for a report gets its Message-ID from here: its local part
 * is the envelope id the report brings back.
 */
export const sendEmail = async (
  client: JmapClient,
  mail: OutgoingEmail,
  mailboxes: { draftsId: string; sentId: string },
  hold?: Hold,
): Promise<{ emailId: string; submissionId: string }> => {
  const messageId = mail.requestDelivery
    ? `${crypto.randomUUID()}@${mail.identity.email.split("@")[1]}`
    : null;
  const envelope = submissionEnvelope({
    from: mail.identity.email,
    recipients: [...mail.to, ...mail.cc, ...mail.bcc].map((address) => address.email),
    hold,
    reportId: messageId ? envelopeIdOf(messageId) : null,
  });
  const responses = await client.request(
    [
      [
        "Email/set",
        {
          accountId: mail.accountId,
          create: {
            draft: {
              ...emailCreate(mail, { [mailboxes.draftsId]: true }, true),
              ...(messageId ? { messageId: [messageId] } : {}),
            },
          },
          ...(mail.draftId ? { destroy: [mail.draftId] } : {}),
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: mail.accountId,
          create: {
            send: {
              identityId: mail.identity.id,
              emailId: "#draft",
              ...(envelope ? { envelope } : {}),
            },
          },
          onSuccessUpdateEmail: {
            "#send": {
              [`mailboxIds/${mailboxes.draftsId}`]: null,
              [`mailboxIds/${mailboxes.sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "1",
      ],
    ],
    [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission],
  );
  assertSetOk(responses[0]![1], "Entwurf");
  assertSetOk(responses[1]![1], "Versand");
  const created = (result: unknown, key: string) =>
    (result as { created?: Record<string, { id: string; undoStatus?: string }> }).created?.[key];
  const emailId = created(responses[0]![1], "draft")?.id ?? "";
  const submission = created(responses[1]![1], "send");
  await assertAccepted(client, mail.accountId, submission, emailId, mailboxes.draftsId);
  return { emailId, submissionId: submission?.id ?? "" };
};

/** What "Als Anhang weiterleiten" needs of each mail, in the order asked for. */
export const getEmlOriginals = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
): Promise<(EmailSummary & { blobId: string })[]> => {
  const { list } = await client.call<{ list: (EmailSummary & { blobId: string })[] }>("Email/get", {
    accountId,
    ids,
    properties: ["id", "blobId", "subject", "size"],
  });
  return ids.flatMap((id) => list.find((email) => email.id === id) ?? []);
};

export const saveDraft = async (
  client: JmapClient,
  mail: OutgoingEmail,
  draftsId: string,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Email/set", {
    accountId: mail.accountId,
    create: { draft: emailCreate(mail, { [draftsId]: true }, true) },
    ...(mail.draftId ? { destroy: [mail.draftId] } : {}),
  });
  assertSetOk(result, "Entwurf");
  return result.created!.draft!.id;
};

/** The files and pictures of a saved draft, with the blobs they have there (lib/draft-blobs.ts). */
export const draftParts = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<BodyPart[]> => {
  const { list } = await client.call<{ list: { attachments?: BodyPart[] }[] }>("Email/get", {
    accountId,
    ids: [id],
    properties: ["attachments"],
    bodyProperties: ["partId", "blobId", "type", "name", "size", "cid", "disposition"],
  });
  return list[0]?.attachments ?? [];
};
