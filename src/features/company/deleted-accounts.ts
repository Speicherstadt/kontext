/**
 * Gelöschte Konten: with Stalwart Enterprise and a retention, a deleted account can be restored
 * for that long (server/company/deleted-accounts.ts). Asked only when the edition is Enterprise.
 */
import { useQuery } from "@tanstack/react-query";
import { LOCALE } from "@/lib/locale";
import { type DeletedAccountsView, getDeletedAccounts } from "./api";
import { useStalwartEdition } from "./edition";

export const DELETED_ACCOUNTS_KEY = ["company", "deleted-accounts"];

/** The view with Enterprise; undefined in Community, while loading, or when Stalwart refuses. */
export const useDeletedAccounts = (): DeletedAccountsView | undefined => {
  const enterprise = useStalwartEdition() === "enterprise";
  return useQuery({
    queryKey: DELETED_ACCOUNTS_KEY,
    queryFn: getDeletedAccounts,
    enabled: enterprise,
    retry: false,
  }).data;
};

/** What deleting does: gone at once, or kept for a number of days. Pure. */
export type DeleteOutcome = { kind: "final" } | { kind: "recoverable"; days: number };

export const deleteOutcome = (view: DeletedAccountsView | undefined): DeleteOutcome =>
  view?.retentionDays ? { kind: "recoverable", days: view.retentionDays } : { kind: "final" };

/** A day in the list ("16. Nov. 2026"); a dash when Stalwart did not say. */
export const formatDay = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })
    : "–";
