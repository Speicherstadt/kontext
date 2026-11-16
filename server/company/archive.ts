/**
 * Gelöschte Elemente wiederherstellen: Stalwart Enterprise keeps what was deleted for good (a mail
 * leaving the trash) for `archiveDeletedItemsFor` of the singleton `x:DataRetention`
 * (crates/registry/src/schema/structs.rs of stalwartlabs/stalwart v1.1.0; read into
 * `deleted_items_retention`, crates/common/src/enterprise/config.rs). Without that setting it
 * keeps nothing. Each kept item is an `x:ArchivedItem` (Email, FileNode, CalendarEvent,
 * ContactCard, SieveScript); in 1.1.0 only mails are archived (crates/services/src/index_queue/
 * index.rs) and only mails can be restored, into the inbox (Task RestoreArchivedItem,
 * crates/services/src/task_manager/tasks/restore_item.rs: the other kinds end "Not implemented").
 * Restoring is an update to `status: "requestRestore"`, which takes the item out of the list and
 * schedules the task; destroying removes it for good (crates/jmap/src/registry/mapping/
 * archived_item.rs). The objects are Enterprise-only (assert_enterprise_object,
 * crates/jmap/src/registry/mod.rs) and outside the users' OAuth scopes, so the server asks with its
 * own key (rights sysArchivedItem*, sysDataRetention*, impersonate: stalwart-setup.ts); the routes
 * (archive-routes.ts) decide whose items a caller may see.
 */
import type { Result } from "./accounts";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

export const ARCHIVED_KINDS = [
  "Email",
  "FileNode",
  "CalendarEvent",
  "ContactCard",
  "SieveScript",
] as const;
export type ArchivedKind = (typeof ARCHIVED_KINDS)[number];

/** What Stalwart 1.1.0 can put back (restore_item.rs); the rest can only be deleted. */
export const RESTORABLE: readonly ArchivedKind[] = ["Email"];

/** One kept item as the app shows it; dates as Stalwart's UTC text. */
export type ArchivedItem = {
  id: string;
  accountId: string;
  kind: ArchivedKind;
  /** Subject, event title, contact or file name; "" when there is none. */
  title: string;
  /** The sender of a mail ("Name <address>"), else null. */
  from: string | null;
  /** When the mail came in, the event starts or the item was made. */
  date: string | null;
  size: number | null;
  archivedAt: string;
  archivedUntil: string;
  restorable: boolean;
};

/** An `x:ArchivedItem` as Stalwart returns it: the union of its five variants (structs.rs). */
export type RawArchivedItem = {
  id: string;
  "@type": string;
  accountId: string;
  archivedAt: string;
  archivedUntil: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  size?: number;
  title?: string;
  startTime?: string | null;
  name?: string | null;
  createdAt?: string;
};

const kindOf = (type: string): ArchivedKind =>
  (ARCHIVED_KINDS as readonly string[]).includes(type) ? (type as ArchivedKind) : "Email";

/** Pure. */
export const toArchivedItem = (raw: RawArchivedItem): ArchivedItem => {
  const kind = kindOf(raw["@type"]);
  return {
    id: raw.id,
    accountId: raw.accountId,
    kind,
    title: (raw.subject ?? raw.title ?? raw.name ?? "").trim(),
    from: kind === "Email" ? raw.from?.trim() || null : null,
    date: raw.receivedAt ?? raw.startTime ?? raw.createdAt ?? null,
    size: raw.size ?? null,
    archivedAt: raw.archivedAt,
    archivedUntil: raw.archivedUntil,
    restorable: RESTORABLE.includes(kind),
  };
};

/** Newest deletion first. Pure. */
export const byArchivedAt = (a: ArchivedItem, b: ArchivedItem): number =>
  b.archivedAt.localeCompare(a.archivedAt);

/** How many items one list shows: Stalwart's default maximum for a get (get_max_objects). */
export const LIST_LIMIT = 500;

export const DAY_MS = 24 * 60 * 60_000;

/** How long Stalwart keeps deleted items; known: false when the key may not read it. */
export type Retention = { known: boolean; ms: number | null };

const resultOf = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

/** A thrown request (a method error such as "forbidden") as a value. */
const attempt = async <T>(run: () => Promise<Result<T>>): Promise<Result<T>> => {
  try {
    return await run();
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};

export const createArchive = (request: Request) => {
  const call = async <T>(method: string, args: Record<string, unknown>) =>
    (await request([[method, args, "0"]]))[0]![1] as T;

  /** The items with these ids, whoever's they are; the routes check the owner. */
  const get = (ids: string[]): Promise<Result<ArchivedItem[]>> =>
    attempt(async () => {
      if (!ids.length) return { ok: true, value: [] };
      const { list } = await call<{ list: RawArchivedItem[] }>("x:ArchivedItem/get", { ids });
      return { ok: true, value: list.map(toArchivedItem) };
    });

  /**
   * One account's items, the latest first. The filter on accountId works for a key with
   * `impersonate` (archived_item_query, archived_item.rs); ids grow, so "id" descending is newest.
   */
  const list = (accountId: string): Promise<Result<ArchivedItem[]>> =>
    attempt(async () => {
      const { ids } = await call<{ ids: string[] }>("x:ArchivedItem/query", {
        filter: { accountId },
        sort: [{ property: "id", isAscending: false }],
        limit: LIST_LIMIT,
      });
      const items = await get(ids);
      if (!items.ok) return items;
      const own = items.value.filter((item) => item.accountId === accountId);
      return { ok: true, value: own.sort(byArchivedAt) };
    });

  const set = (args: Record<string, unknown>): Promise<Result<null>> =>
    attempt(async () => resultOf(await call<SetResult>("x:ArchivedItem/set", args)));

  /** Stalwart puts the mails back into the inbox with a task, a moment later. */
  const restore = (ids: string[]) =>
    set({ update: Object.fromEntries(ids.map((id) => [id, { status: "requestRestore" }])) });

  const destroy = (ids: string[]) => set({ destroy: ids });

  const retention = async (): Promise<Retention> => {
    const read = await attempt(async () => {
      const { list } = await call<{ list: { archiveDeletedItemsFor?: number | null }[] }>(
        "x:DataRetention/get",
        { ids: ["singleton"], properties: ["archiveDeletedItemsFor"] },
      );
      return { ok: true, value: list[0]?.archiveDeletedItemsFor ?? null };
    });
    return read.ok ? { known: true, ms: read.value } : { known: false, ms: null };
  };

  /** null keeps nothing. Stalwart reads it at start and on ReloadSettings (config.rs). */
  const setRetention = (ms: number | null): Promise<Result<null>> =>
    attempt(async () => {
      const changed = resultOf(
        await call<SetResult>("x:DataRetention/set", {
          update: { singleton: { archiveDeletedItemsFor: ms } },
        }),
      );
      if (!changed.ok) return changed;
      return resultOf(
        await call<SetResult>("x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }),
      );
    });

  return { get, list, restore, destroy, retention, setRetention };
};

export type Archive = ReturnType<typeof createArchive>;
