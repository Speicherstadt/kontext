/**
 * Data hooks of the mail app. Query keys start with the JMAP account id, so a push for that
 * account refreshes exactly its data. Accounts, folders and the list cache helpers are in
 * mail-core/accounts.ts, which other features use too.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import {
  createMailbox,
  type EmailFilter,
  type EmailPage,
  getEmail,
  getQuota,
  queryEmails,
} from "@/jmap/mail";
import { heldMails } from "@/jmap/submissions";
import { DEFAULT_SORT, type MailSort, sortComparators } from "@/lib/mail-sort";
import { mailboxesKey } from "@/mail-core/accounts";
import { useCategories } from "../categories/queries";

export {
  adjustUnreadCounts,
  mailboxesKey,
  patchCachedEmails,
  patchListData,
  useAllMailboxes,
  useIdentities,
  useInboxes,
  useMailAccounts,
  useMailboxes,
} from "@/mail-core/accounts";

/**
 * A folder's mails in the chosen order (newest first by default); with `collapse`, one line per
 * conversation. Sorting by category needs the account's categories, in its order.
 */
export const useEmailList = (
  accountId: string,
  filter: EmailFilter,
  { collapse = false, sort = DEFAULT_SORT }: { collapse?: boolean; sort?: MailSort } = {},
) => {
  const client = useClient();
  const categories = useCategories(sort === "category" ? accountId : undefined).map(
    (category) => category.keyword,
  );
  const comparators = sortComparators(sort, { threads: collapse, categories });
  return useInfiniteQuery({
    queryKey: [accountId, "emails", filter, collapse, comparators],
    queryFn: ({ pageParam }) =>
      queryEmails(client, accountId, filter, pageParam, 50, {
        collapseThreads: collapse,
        sort: comparators,
      }),
    // No account: nothing to list (e.g. "wieder vorgelegt" outside the inbox).
    enabled: Boolean(accountId),
    initialPageParam: 0,
    getNextPageParam: (last: EmailPage) => {
      const next = last.position + last.emails.length;
      return next < last.total && last.emails.length > 0 ? next : undefined;
    },
  });
};

export const useEmail = (accountId: string, id: string | undefined) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "email", id],
    queryFn: () => getEmail(client, accountId, id!),
    enabled: Boolean(id),
  });
};

export const useQuota = (accountId: string) => {
  const client = useClient();
  return useQuery({ queryKey: [accountId, "quota"], queryFn: () => getQuota(client, accountId) });
};

export const useCreateMailbox = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      createMailbox(client, accountId, name, parentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: mailboxesKey(accountId) }),
  });
};

/** Mails the server still holds in this account: scheduled ones, and those within "Rückgängig". */
export const useHeldMails = (accountId: string) => {
  const client = useClient();
  return (
    useQuery({
      queryKey: [accountId, "held"],
      queryFn: () => heldMails(client, accountId),
      enabled: Boolean(accountId),
    }).data ?? []
  );
};
