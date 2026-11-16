/**
 * Gelöschte Elemente wiederherstellen (Stalwart Enterprise): the calls to the Kontext server
 * (server/company/archive-routes.ts), which asks Stalwart with its own key and decides whose items
 * the caller may see. Pure helpers for what the view shows.
 */
import type { ArchivedItem, ArchivedKind } from "../../../server/company/archive";
import type { ArchiveAccount, ArchiveView } from "../../../server/company/archive-routes";

export type { ArchiveAccount, ArchivedItem, ArchivedKind, ArchiveView };

const BASE = "/api/company/archive";

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const accountPath = (accountId: string) => `/accounts/${encodeURIComponent(accountId)}`;

export const getArchive = () => send<ArchiveView>("GET", "");

export const getItems = async (accountId: string) =>
  (await send<{ items: ArchivedItem[] }>("GET", accountPath(accountId))).items;

/** Stalwart puts the mails back into the inbox a moment later; the list without them. */
export const restoreItems = async (accountId: string, ids: string[]) =>
  (await send<{ items: ArchivedItem[] }>("POST", `${accountPath(accountId)}/restore`, { ids }))
    .items;

export const destroyItems = async (accountId: string, ids: string[]) =>
  (await send<{ items: ArchivedItem[] }>("POST", `${accountPath(accountId)}/destroy`, { ids }))
    .items;

/** Days Stalwart keeps deleted items; 0 keeps nothing. */
export const setRetentionDays = (days: number) =>
  send<{ retention: ArchiveView["retention"] }>("PUT", "/retention", { days });

const DAY_MS = 24 * 60 * 60_000;

/** Whole days, at least one for any time set; 0 for none. Pure. */
export const retentionDays = (ms: number | null): number =>
  ms ? Math.max(1, Math.round(ms / DAY_MS)) : 0;

/** The account to show first: the one asked for (e.g. from a shared trash), else the own. Pure. */
export const pickAccount = (accounts: ArchiveAccount[], wanted?: string): string | undefined =>
  (accounts.find((account) => account.id === wanted) ?? accounts[0])?.id;
