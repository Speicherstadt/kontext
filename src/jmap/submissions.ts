/**
 * Mails on their way (RFC 8621 §7): those the server still holds – the seconds for "Rückgängig",
 * or scheduled for later – and taking one back while it is held.
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";
import { SUMMARY_PROPERTIES } from "./mail";
import type { EmailSummary } from "./types";

const USING = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.submission];

export type HeldMail = {
  submissionId: string;
  emailId: string;
  sendAt: string;
  email: EmailSummary | undefined;
  /** Why it has not gone out yet: the receiving server's last answer, while it is retried. */
  delay: string | undefined;
};

/** RFC 8621 §7: per recipient, whether it got the mail, and the last SMTP reply. */
type DeliveryStatus = Record<string, { delivered?: string; smtpReply?: string }>;

/** Stalwart's reply for a recipient not tried yet (crates/email/src/submission/mod.rs). */
const QUEUED_REPLY = "250 2.1.5 Queued";

/**
 * The reply of a recipient still queued after a try failed for now (a 4xx such as greylisting):
 * Stalwart then puts the error in place of QUEUED_REPLY ("Code: 451, Enhanced code: 4.7.1,
 * Message: …", crates/smtp/src/queue/submission.rs). Only the message part; none while each
 * recipient is untried or done. Pure.
 */
export const delayReason = (status: DeliveryStatus | null | undefined): string | undefined => {
  const reply = Object.values(status ?? {})
    .filter(({ delivered }) => delivered === "queued")
    .map(({ smtpReply }) => smtpReply?.trim() ?? "")
    .find((text) => text !== "" && text !== QUEUED_REPLY);
  return reply?.match(/Message:\s*(.+)$/s)?.[1]?.trim() ?? reply;
};

/**
 * Where a held mail stands: still to go out at its time, out of its time and on its way, or
 * turned away for now by the receiving server and retried. Pure.
 */
export const heldState = (
  held: Pick<HeldMail, "sendAt" | "delay">,
  now: Date,
): "scheduled" | "sending" | "delayed" =>
  Date.parse(held.sendAt) > now.getTime() ? "scheduled" : held.delay ? "delayed" : "sending";

/** What the server still holds, the next first, with the mails themselves. */
export const heldMails = async (client: JmapClient, accountId: string): Promise<HeldMail[]> => {
  const [, get, got] = await client.request(
    [
      ["EmailSubmission/query", { accountId, filter: { undoStatus: "pending" } }, "q"],
      [
        "EmailSubmission/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "EmailSubmission/query", path: "/ids" },
          properties: ["emailId", "sendAt", "undoStatus", "deliveryStatus"],
        },
        "g",
      ],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "g", name: "EmailSubmission/get", path: "/list/*/emailId" },
          properties: SUMMARY_PROPERTIES,
        },
        "e",
      ],
    ],
    USING,
  );
  const emails = new Map(
    ((got![1].list as EmailSummary[]) ?? []).map((email) => [email.id, email]),
  );
  return (
    (get![1].list as {
      id: string;
      emailId: string;
      sendAt: string;
      undoStatus: string;
      deliveryStatus?: DeliveryStatus | null;
    }[]) ?? []
  )
    .filter((submission) => submission.undoStatus === "pending")
    .map(({ id, emailId, sendAt, deliveryStatus }) => ({
      submissionId: id,
      emailId,
      sendAt,
      email: emails.get(emailId),
      delay: delayReason(deliveryStatus),
    }))
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
};

/**
 * Stops a held mail and puts it back among the drafts, to change or send again. Throws when it
 * is already out ("cannotUnsend").
 */
export const unsend = async (
  client: JmapClient,
  accountId: string,
  held: Pick<HeldMail, "submissionId" | "emailId">,
  draftsId: string,
): Promise<void> => {
  // First stopped, then back – never a mail among the drafts that went out anyway.
  const [cancel] = await client.request(
    [
      [
        "EmailSubmission/set",
        { accountId, update: { [held.submissionId]: { undoStatus: "canceled" } } },
        "c",
      ],
    ],
    USING,
  );
  assertSetOk(cancel![1], "Versand");
  const [back] = await client.request(
    [
      [
        "Email/set",
        {
          accountId,
          update: {
            [held.emailId]: { mailboxIds: { [draftsId]: true }, "keywords/$draft": true },
          },
        },
        "e",
      ],
    ],
    USING,
  );
  assertSetOk(back![1], "Entwurf");
};
