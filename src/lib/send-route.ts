/**
 * Which account a mail goes out through, for the sender picked in the composer. Stalwart lists
 * the addresses of the shared mailboxes (group accounts) one belongs to as identities of the own
 * account too, but a submission only uses an identity and an email of the account it is made in
 * (crates/jmap/src/submission/set.rs: `send_message` reads both with the request's `account_id`,
 * and `onSuccessUpdateEmail` becomes an Email/set in that same account). So a mail written as
 * info@ from the own mailbox goes through info@'s account, with its identity, its Drafts and its
 * Sent – as if written in that shared mailbox, unless the Firmenverwaltung keeps that mailbox's
 * mails with the sender (lib/sent-copy.ts). Pure, so it is tested.
 */
import type { Identity, Mailbox } from "@/model/jmap";
import { sameAddress } from "./addresses";
import { sharedSenderName } from "./compose";
import { findRole } from "./mailboxes";
import type { SentCopy } from "./sent-copy";

/** Where a copy of the sent mail goes: the sender's own Sent (`both`, lib/sent-copy.ts). */
export type CopyTo = { accountId: string; sentId: string };

export type SendRoute = {
  accountId: string;
  /** The identity of that account the submission uses. */
  identity: Identity | undefined;
  mailboxes: Mailbox[];
  copyTo: CopyTo | null;
};

/**
 * A shared mailbox one may send from: its identities (empty when not readable), its folders and
 * where its sent mails are kept.
 */
export type GroupAccount = {
  accountId: string;
  identities: Identity[];
  mailboxes: Mailbox[];
  sentCopy: SentCopy;
};

type Account = { accountId: string; mailboxes: Mailbox[] };

/** Whether a mail goes out through it: a member's identities, Drafts and Sent, and not `sender`. */
const sendsThrough = (group: GroupAccount) =>
  group.sentCopy !== "sender" &&
  group.identities.length > 0 &&
  Boolean(findRole(group.mailboxes, "drafts") && findRole(group.mailboxes, "sent"));

/** The own Sent, when the mailbox the mail goes out through keeps a copy there too. */
const copyFor = (sentCopy: SentCopy, own: Account): CopyTo | null => {
  const sent = findRole(own.mailboxes, "sent");
  return sentCopy === "both" && sent ? { accountId: own.accountId, sentId: sent.id } : null;
};

/**
 * The route for `picked`. From the own account (`base` is `own`), a group address goes through
 * its group account, if one may write there and the mailbox does not keep its mails only with
 * the sender; anything else through the own account. Written in a shared mailbox, the mail goes
 * through it (its `sentCopy` is `base.sentCopy`). Either way, with `both` a copy goes to the own
 * Sent.
 */
export const sendRoute = (
  picked: Identity | undefined,
  base: Account & { sentCopy: SentCopy },
  own: Account,
  groups: GroupAccount[],
): SendRoute => {
  const through = (account: Account, identity: Identity | undefined, sentCopy: SentCopy) => ({
    accountId: account.accountId,
    identity,
    mailboxes: account.mailboxes,
    copyTo: identity ? copyFor(sentCopy, own) : null,
  });
  if (!picked || base.accountId !== own.accountId) return through(base, picked, base.sentCopy);
  for (const group of groups.filter(sendsThrough)) {
    const identity = group.identities.find((each) => sameAddress(each.email, picked.email));
    if (identity) return through(group, identity, group.sentCopy);
  }
  return through(own, picked, "group");
};

/** The addresses that go out through a shared mailbox, with the name `person` has there. */
export const groupSenders = (groups: GroupAccount[], person: string) =>
  groups.filter(sendsThrough).flatMap((group) =>
    group.identities.map((identity) => ({
      email: identity.email,
      name: sharedSenderName(person, identity.name),
    })),
  );

/** Where a saved draft lies: drafts cannot move between accounts (Email/set is per account). */
export type SavedDraft = { accountId: string; id: string };

/**
 * A save in `accountId` replaces the draft there; a draft left in another account (the sender
 * changed to or from a shared mailbox) is removed once the new one is written.
 */
export const draftSwap = (saved: SavedDraft | null, accountId: string) => ({
  replaces: saved?.accountId === accountId ? saved.id : null,
  leftBehind: saved && saved.accountId !== accountId ? saved : null,
});
