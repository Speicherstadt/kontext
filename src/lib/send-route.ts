/**
 * Which account a mail goes out through, for the sender picked in the composer. Stalwart lists
 * the addresses of the shared mailboxes (group accounts) one belongs to as identities of the own
 * account too, but a submission only uses an identity and an email of the account it is made in
 * (crates/jmap/src/submission/set.rs: `send_message` reads both with the request's `account_id`,
 * and `onSuccessUpdateEmail` becomes an Email/set in that same account). So a mail written as
 * info@ from the own mailbox goes through info@'s account, with its identity, its Drafts and its
 * Sent – as if written in that shared mailbox. Pure, so it is tested.
 */
import type { Identity, Mailbox } from "@/model/jmap";
import { sameAddress } from "./addresses";
import { sharedSenderName } from "./compose";
import { findRole } from "./mailboxes";

export type SendRoute = {
  accountId: string;
  /** The identity of that account the submission uses. */
  identity: Identity | undefined;
  mailboxes: Mailbox[];
};

/** A shared mailbox one may send from: its identities (empty when not readable) and its folders. */
export type GroupAccount = { accountId: string; identities: Identity[]; mailboxes: Mailbox[] };

/** Whether a mail can be written there: a member's identities, a Drafts and a Sent folder. */
const canWriteIn = (group: GroupAccount) =>
  group.identities.length > 0 &&
  Boolean(findRole(group.mailboxes, "drafts") && findRole(group.mailboxes, "sent"));

/**
 * The route for `picked` from the own account: a group address goes through its group account,
 * if one may write there; anything else (and every sender outside the own account, where the
 * account is chosen already) through `base`.
 */
export const sendRoute = (
  picked: Identity | undefined,
  base: { accountId: string; mailboxes: Mailbox[]; isOwn: boolean },
  groups: GroupAccount[],
): SendRoute => {
  const fallback = { accountId: base.accountId, identity: picked, mailboxes: base.mailboxes };
  if (!picked || !base.isOwn) return fallback;
  for (const group of groups.filter(canWriteIn)) {
    const identity = group.identities.find((each) => sameAddress(each.email, picked.email));
    if (identity) return { accountId: group.accountId, identity, mailboxes: group.mailboxes };
  }
  return fallback;
};

/** The addresses that go out through a shared mailbox, with the name `person` has there. */
export const groupSenders = (groups: GroupAccount[], person: string) =>
  groups.filter(canWriteIn).flatMap((group) =>
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
