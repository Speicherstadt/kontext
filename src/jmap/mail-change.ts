/** Changing mails and folders on top of the JMAP client (RFC 8621): keywords, moves, copies, deletes. */

import { type Assignment, assignmentPatch } from "@/lib/assignment";
import { assertSetOk, type JmapClient } from "./client";
import type { EmailSummary } from "./types";

const updateEmails = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
  patch: Record<string, unknown>,
): Promise<void> => {
  const result = await client.call("Email/set", {
    accountId,
    update: Object.fromEntries(ids.map((id) => [id, patch])),
  });
  assertSetOk(result, "Email/set");
};

export const setKeyword = (
  client: JmapClient,
  accountId: string,
  ids: string[],
  keyword: string,
  on: boolean,
) => updateEmails(client, accountId, ids, { [`keywords/${keyword}`]: on ? true : null });

/** Who takes care of a mail and whether it is done (src/lib/assignment.ts). */
export const setAssignment = (
  client: JmapClient,
  accountId: string,
  id: string,
  assignment: Assignment,
) => updateEmails(client, accountId, [id], assignmentPatch(assignment));

/** Moves mails to another folder; `keywords` are set (true) or removed (null) in the same call. */
export const moveEmails = (
  client: JmapClient,
  accountId: string,
  ids: string[],
  fromMailboxId: string,
  toMailboxId: string,
  keywords: Record<string, true | null> = {},
) =>
  updateEmails(client, accountId, ids, {
    [`mailboxIds/${fromMailboxId}`]: null,
    [`mailboxIds/${toMailboxId}`]: true,
    ...Object.fromEntries(Object.entries(keywords).map(([key, on]) => [`keywords/${key}`, on])),
  });

/**
 * Which folders the mails lie in now; a mail deleted since is missing from the answer (a standard
 * /get, RFC 8620 §5.1: unknown ids go into `notFound`).
 */
export const getMailboxIds = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
): Promise<Pick<EmailSummary, "id" | "mailboxIds">[]> => {
  const { list } = await client.call<{ list: Pick<EmailSummary, "id" | "mailboxIds">[] }>(
    "Email/get",
    { accountId, ids, properties: ["mailboxIds"] },
  );
  return list;
};

/**
 * Into Spam with $junk, or out of it with $notjunk (RFC 8621 §2, IANA keywords). Stalwart trains
 * its spam filter on both, the folder move and the keyword (crates/jmap/src/email/set.rs).
 */
export const JUNK_KEYWORDS = {
  spam: { $junk: true, $notjunk: null },
  notSpam: { $junk: null, $notjunk: true },
} as const;

/**
 * Moves mails into another account (e.g. from info@ into the own mailbox): Email/copy with
 * onSuccessDestroyOriginal (RFC 8620 §5.4, RFC 8621 §4.7). The copy keeps only the keywords and
 * the date it is given, so read and flagged are passed along.
 */
export const copyEmails = async (
  client: JmapClient,
  fromAccountId: string,
  toAccountId: string,
  emails: Pick<EmailSummary, "id" | "keywords" | "receivedAt">[],
  toMailboxId: string,
): Promise<void> => {
  const responses = await client.request([
    [
      "Email/copy",
      {
        fromAccountId,
        accountId: toAccountId,
        onSuccessDestroyOriginal: true,
        create: Object.fromEntries(
          emails.map((email, index) => [
            `c${index}`,
            {
              id: email.id,
              mailboxIds: { [toMailboxId]: true },
              keywords: email.keywords,
              receivedAt: email.receivedAt,
            },
          ]),
        ),
      },
      "0",
    ],
  ]);
  // The copy's response, then the implicit Email/set that removes the originals.
  for (const [name, result] of responses) assertSetOk(result, name);
};

export const destroyEmails = async (
  client: JmapClient,
  accountId: string,
  ids: string[],
): Promise<void> => {
  assertSetOk(await client.call("Email/set", { accountId, destroy: ids }), "Email/set");
};

export const createMailbox = async (
  client: JmapClient,
  accountId: string,
  name: string,
  parentId: string | null,
  role?: string,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Mailbox/set", {
    accountId,
    create: { m: { name, parentId, ...(role ? { role } : {}) } },
  });
  assertSetOk(result, "Mailbox/set");
  return result.created!.m!.id;
};
