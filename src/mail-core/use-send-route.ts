/**
 * The account the picked sender goes out through (lib/send-route.ts): from the own mailbox, a
 * shared mailbox's address goes through that mailbox, as if written there – unless the
 * Firmenverwaltung keeps its mails with the sender, or also wants a copy in the own Sent
 * (lib/sent-copy.ts). Its identities come from the same cache as useIdentities; a mailbox only
 * shared for reading answers "forbidden" and keeps the mail in the own account.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import type { Identity, Mailbox } from "@/jmap/types";
import { sameAddress } from "@/lib/addresses";
import { type GroupAccount, groupSenders, sendRoute } from "@/lib/send-route";
import { type SentCopy, sentCopyOf } from "@/lib/sent-copy";
import { identitiesQuery, useAllMailboxes, useMailAccounts } from "./accounts";
import { useSentCopies } from "./sent-copies";
import type { useSendAccount } from "./use-send-account";

type Sender = ReturnType<typeof useSendAccount>;

/**
 * The shared mailboxes one belongs to, with their identities and folders. Only those whose
 * address is among the own identities (Stalwart lists them for members only): asking a mailbox
 * merely shared for reading would refetch its "forbidden" on every mount, and with it
 * useSendAccount's choice of account would flip back and forth.
 */
const useGroupAccounts = (
  wanted: boolean,
  own: Identity[],
  mailboxes: Record<string, Mailbox[] | undefined>,
  copies: Record<string, SentCopy>,
): GroupAccount[] => {
  const client = useClient();
  const shared = useMailAccounts().filter(
    (account) =>
      wanted &&
      account.kind === "shared" &&
      own.some((identity) => sameAddress(identity.email, account.name)),
  );
  const identities = useQueries({
    queries: shared.map((account) => identitiesQuery(client, account.id)),
  });
  return shared.map((account, index) => ({
    accountId: account.id,
    identities: identities[index]?.data ?? [],
    mailboxes: mailboxes[account.id] ?? [],
    sentCopy: sentCopyOf(copies, account.id),
  }));
};

/**
 * `route`: where the picked sender goes out, and where a copy goes; `viaGroup`: the addresses
 * that go out through a shared mailbox, with the name the recipient sees.
 */
export const useSendRoute = (sender: Sender, picked: Identity | undefined) => {
  const ownId = sender.own?.id ?? sender.sendAccountId;
  const isOwn = sender.sendAccountId === ownId;
  const copies = useSentCopies();
  const mailboxes = useAllMailboxes();
  const groups = useGroupAccounts(isOwn, sender.identities, mailboxes, copies);
  const base = {
    accountId: sender.sendAccountId,
    mailboxes: sender.mailboxes,
    sentCopy: sentCopyOf(copies, sender.sendAccountId),
  };
  const own = { accountId: ownId, mailboxes: mailboxes[ownId] ?? [] };
  return {
    route: sendRoute(picked, base, own, groups),
    viaGroup: groupSenders(groups, sender.myName),
  };
};
