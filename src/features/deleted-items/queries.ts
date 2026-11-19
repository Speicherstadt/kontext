/**
 * The deleted items as queries: the view (accounts, retention) once, each account's list, and
 * restoring or deleting, after which the list is the server's answer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStalwartEdition } from "@/company-core/edition";
import { type ArchivedItem, destroyItems, getArchive, getItems, restoreItems } from "./api";

export const ARCHIVE_KEY = ["company", "archive"];

/** Only with Stalwart Enterprise; never asked in Community (nor in the demo). */
export const useArchive = () => {
  const enterprise = useStalwartEdition() === "enterprise";
  return useQuery({
    queryKey: ARCHIVE_KEY,
    queryFn: getArchive,
    enabled: enterprise,
    retry: false,
  });
};

const itemsKey = (accountId: string) => [...ARCHIVE_KEY, "items", accountId];

export const useArchivedItems = (accountId: string) =>
  useQuery({ queryKey: itemsKey(accountId), queryFn: () => getItems(accountId), retry: false });

/** Restores (or with `destroy`, deletes for good) items of the account. */
export const useArchiveChange = (accountId: string, destroy: boolean) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      destroy ? destroyItems(accountId, ids) : restoreItems(accountId, ids),
    onSuccess: (items: ArchivedItem[]) => queryClient.setQueryData(itemsKey(accountId), items),
  });
};
