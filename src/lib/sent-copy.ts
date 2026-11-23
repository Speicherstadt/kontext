/**
 * „Gesendete Mails ablegen“, set per shared mailbox by the Firmenverwaltung: where a mail sent as
 * its address is kept. Shared by the server (server/company/sent-copies.ts) and the app.
 */

export const SENT_COPIES = ["group", "both", "sender"] as const;

/**
 * `group`: only in the shared mailbox (its Drafts and Sent; as Bulwark does from 1.17.2);
 * `both`: there and a copy in the sender's own Sent; `sender`: only in the sender's own mailbox.
 */
export type SentCopy = (typeof SENT_COPIES)[number];

export const DEFAULT_SENT_COPY: SentCopy = "group";

/** The setting of the shared mailbox `accountId`; the default where none is saved. */
export const sentCopyOf = (copies: Record<string, SentCopy>, accountId: string): SentCopy =>
  copies[accountId] ?? DEFAULT_SENT_COPY;

/** The saved settings with one changed; the default is not stored. Pure. */
export const withSentCopy = (
  copies: Record<string, SentCopy>,
  accountId: string,
  copy: SentCopy,
): Record<string, SentCopy> => {
  const { [accountId]: _, ...others } = copies;
  return copy === DEFAULT_SENT_COPY ? others : { ...others, [accountId]: copy };
};
