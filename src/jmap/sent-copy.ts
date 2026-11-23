/**
 * The copy of a mail sent through a shared mailbox in the sender's own Sent (`both`,
 * lib/sent-copy.ts): Email/copy (RFC 8621 §4.7; Stalwart: crates/jmap/src/email/copy.rs, members
 * of the source account may copy any of its mails). It is made right after the submission, as
 * the shared mailbox's Sent holds the mail from then on too, also while it is held for
 * "Rückgängig" or "Später senden"; taking the mail back removes the copy again.
 */
import { assertSetOk, type JmapClient } from "./client";

/**
 * Marks the copy with the mail it was made of, to find it again when that is taken back. A
 * keyword, as Stalwart answers `hasKeyword` from its cache at once (crates/jmap/src/email/query/
 * filter.rs), where a header search waits for the search index. The app shows only the keywords
 * of its categories, so the mark stays out of sight.
 */
export const copyMark = (fromAccountId: string, emailId: string) =>
  // Keywords are case-insensitive (RFC 8621 §4.1.1): one case for setting and finding it.
  `$kontext-copy-${fromAccountId}-${emailId}`.toLowerCase();

type Copy = { fromAccountId: string; emailId: string; accountId: string };

/** Copies the sent mail `emailId` into `sentId`, read, and returns the copy's id. */
export const copySent = async (
  client: JmapClient,
  { fromAccountId, emailId, accountId, sentId }: Copy & { sentId: string },
): Promise<string> => {
  const result = await client.call<Record<string, unknown>>("Email/copy", {
    fromAccountId,
    accountId,
    create: {
      copy: {
        id: emailId,
        mailboxIds: { [sentId]: true },
        keywords: { $seen: true, [copyMark(fromAccountId, emailId)]: true },
      },
    },
  });
  assertSetOk(result, "Kopie");
  return (result.created as Record<string, { id: string }>).copy!.id;
};

/** Removes the copies of `emailId` (taken back) from `accountId`. */
export const removeSentCopies = async (
  client: JmapClient,
  { fromAccountId, emailId, accountId }: Copy,
): Promise<void> => {
  const { ids } = await client.call<{ ids: string[] }>("Email/query", {
    accountId,
    filter: { hasKeyword: copyMark(fromAccountId, emailId) },
  });
  if (!ids.length) return;
  const result = await client.call<Record<string, unknown>>("Email/set", {
    accountId,
    destroy: ids,
  });
  assertSetOk(result, "Kopie");
};
