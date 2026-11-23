/**
 * The account the picked sender goes out through (lib/send-route.ts): from the own mailbox, a
 * shared mailbox's address goes through that mailbox, as if written there. Its identities come
 * from the same cache as useIdentities; a mailbox only shared for reading answers "forbidden"
 * and keeps the mail in the own account.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import type { Identity } from "@/jmap/types";
import { type GroupAccount, groupSenders, sendRoute } from "@/lib/send-route";
import { identitiesQuery, useAllMailboxes, useMailAccounts } from "./accounts";
import type { useSendAccount } from "./use-send-account";

type Sender = ReturnType<typeof useSendAccount>;

/** The shared mailboxes one belongs to, with their identities and folders. */
const useGroupAccounts = (wanted: boolean): GroupAccount[] => {
  const client = useClient();
  const shared = useMailAccounts().filter((account) => wanted && account.kind === "shared");
  const mailboxes = useAllMailboxes();
  const identities = useQueries({
    queries: shared.map((account) => identitiesQuery(client, account.id)),
  });
  return shared.map((account, index) => ({
    accountId: account.id,
    identities: identities[index]?.data ?? [],
    mailboxes: mailboxes[account.id] ?? [],
  }));
};

/**
 * `route`: where the picked sender goes out; `viaGroup`: the addresses that go out through a
 * shared mailbox, with the name the recipient sees.
 */
export const useSendRoute = (sender: Sender, picked: Identity | undefined) => {
  const isOwn = sender.sendAccountId === sender.own?.id;
  const groups = useGroupAccounts(isOwn);
  const base = { accountId: sender.sendAccountId, mailboxes: sender.mailboxes, isOwn };
  return {
    route: sendRoute(picked, base, groups),
    viaGroup: groupSenders(groups, sender.myName),
  };
};
