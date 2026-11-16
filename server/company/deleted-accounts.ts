/**
 * Gelöschte Konten (Stalwart Enterprise): with a license Stalwart keeps a destroyed account for
 * a while and it can be brought back. How it works in stalwartlabs/stalwart v1.1.0:
 *
 * - `x:Account/set` destroy removes the account object at once, revokes what it shared, and
 *   schedules a `DestroyAccount` task (schedule_account_destruction,
 *   crates/jmap/src/registry/mapping/principal.rs). With a license and
 *   `DataRetention.archiveDeletedAccountsFor` set, the task is due that much later; otherwise now
 *   (crates/common/src/enterprise/config.rs: deleted_accounts_retention). Until the task runs, the
 *   mail, calendars and files stay (crates/services/src/task_manager/tasks/destroy_account.rs).
 * - The pending deletions are those tasks: `x:Task/query` with `{"@type": "DestroyAccount"}`,
 *   then `x:Task/get`, which adds `due` (crates/jmap/src/registry/mapping/task.rs, task_query and
 *   task_get). A task holds accountId, accountName, accountDomainId, accountType, memberGroupIds
 *   and status (TaskDestroyAccount, crates/registry/src/schema/structs.rs).
 * - Recovering is destroying that task (`x:Task/set` destroy): Stalwart inserts the account again
 *   under its old id with only name and domain, and schedules RebuildShares (task.rs, the
 *   `Task::DestroyAccount` branch; "Account recovery is not supported in this deployment" without
 *   a license). Name, password, roles and memberships are not kept: Kontext gives a recovered
 *   person a new password and their shared mailboxes back from the task.
 *
 * Rights: sysTaskGet, sysTaskQuery, sysTaskDestroy, taskDestroyAccount, sysDataRetentionGet,
 * sysDataRetentionUpdate, actionReloadSettings (stalwart-setup.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import { type Domain, newPassword, type Result } from "./accounts";
import { bad, bodyOf, type Env, type Loaded } from "./context";
import type { EditionCheck } from "./edition";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

const DAY_MS = 86_400_000;
/** The longest retention the Firmenverwaltung offers: ten years. */
export const MAX_RETENTION_DAYS = 3650;

/** A `DestroyAccount` task as `x:Task/get` returns it (the properties used here). */
export type DestroyTask = {
  id: string;
  "@type": string;
  accountId?: string;
  accountName?: string;
  accountDomainId?: string;
  accountType?: "User" | "Group";
  memberGroupIds?: Record<string, true>;
  status?: { "@type": string; createdAt?: string; due?: string };
  due?: string;
};

export type DeletedAccount = {
  /** The task's id: what recovering destroys. */
  id: string;
  accountId: string;
  kind: "employee" | "mailbox";
  email: string;
  /** When it was deleted; null when Stalwart does not say. */
  deletedAt: string | null;
  /** When Stalwart removes it for good. */
  purgeAt: string | null;
};

export type DeletedAccountsView = {
  /** How long Stalwart keeps a deleted account; null: deleting is final. */
  retentionDays: number | null;
  accounts: DeletedAccount[];
};

/** Stalwart's duration (milliseconds, crates/registry/src/types/duration.rs) in whole days. */
export const retentionDaysOf = (ms: number | null | undefined): number | null =>
  ms && ms > 0 ? Math.max(1, Math.round(ms / DAY_MS)) : null;

/** Days back to Stalwart's milliseconds; 0 switches the retention off (null). */
export const retentionMsOf = (days: number): number | null => (days > 0 ? days * DAY_MS : null);

/** The pending deletions in the company's domains, the soonest gone first. Pure. */
export const toDeletedAccounts = (tasks: DestroyTask[], domains: Domain[]): DeletedAccount[] =>
  tasks
    .flatMap((task) => {
      const domain = domains.find((candidate) => candidate.id === task.accountDomainId);
      if (task["@type"] !== "DestroyAccount" || !domain || !task.accountId) return [];
      return [
        {
          id: task.id,
          accountId: task.accountId,
          kind: task.accountType === "Group" ? ("mailbox" as const) : ("employee" as const),
          email: `${task.accountName ?? ""}@${domain.name}`,
          deletedAt: task.status?.createdAt ?? null,
          purgeAt: task.due ?? task.status?.due ?? null,
        },
      ];
    })
    .sort((a, b) => (a.purgeAt ?? "").localeCompare(b.purgeAt ?? ""));

/**
 * What a recovered person gets back beside name and domain: a password to sign in with and the
 * shared mailboxes they were in that still exist. Pure.
 */
export const recoveryPatch = (task: DestroyTask, mailboxIds: string[], password: string) => ({
  credentials: { "0": { "@type": "Password", secret: password } },
  memberGroupIds: Object.fromEntries(
    Object.keys(task.memberGroupIds ?? {})
      .filter((id) => mailboxIds.includes(id))
      .map((id) => [id, true]),
  ),
});

const resultOf = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

export const createDeletedAccounts = (request: Request) => {
  const set = async (method: string, args: Record<string, unknown>) =>
    resultOf((await request([[method, args, "0"]]))[0]![1] as SetResult);

  /** The retention in milliseconds and the pending `DestroyAccount` tasks, in one request. */
  const read = async (): Promise<{ retentionMs: number | null; tasks: DestroyTask[] }> => {
    const [retention, , tasks] = await request([
      [
        "x:DataRetention/get",
        { ids: ["singleton"], properties: ["archiveDeletedAccountsFor"] },
        "r",
      ],
      ["x:Task/query", { filter: { "@type": "DestroyAccount" } }, "q"],
      ["x:Task/get", { "#ids": { resultOf: "q", name: "x:Task/query", path: "/ids" } }, "t"],
    ]);
    const settings = (retention![1].list as { archiveDeletedAccountsFor?: number | null }[])[0];
    return {
      retentionMs: settings?.archiveDeletedAccountsFor ?? null,
      tasks: (tasks![1].list as DestroyTask[]) ?? [],
    };
  };

  /** Brings the account back by cancelling its deletion (see above). */
  const recover = (taskId: string) => set("x:Task/set", { destroy: [taskId] });

  /** Stalwart reads DataRetention at start and on ReloadSettings (as for Encryption). */
  const setRetention = async (days: number): Promise<Result<null>> => {
    const changed = await set("x:DataRetention/set", {
      update: { singleton: { archiveDeletedAccountsFor: retentionMsOf(days) } },
    });
    if (!changed.ok) return changed;
    return set("x:Action/set", { create: { r: { "@type": "ReloadSettings" } } });
  };

  return { read, recover, setRetention };
};

export type DeletedAccounts = ReturnType<typeof createDeletedAccounts>;

const retentionSchema = z.object({ days: z.number().int().min(0).max(MAX_RETENTION_DAYS) });

/** Under /api/company/deleted-accounts; Stalwart without a license gets a clear no. */
export const deletedAccountRoutes = ({
  deleted,
  edition,
  updateAccounts,
  random,
  mailboxChanged,
}: {
  deleted: DeletedAccounts;
  edition?: EditionCheck;
  updateAccounts: (patches: Record<string, Record<string, unknown>>) => Promise<Result<null>>;
  random?: (size: number) => Uint8Array;
  /** The shared mailboxes a recovered person is back in (their folder in Dokumente follows). */
  mailboxChanged?: (mailboxId: string) => void;
}) => {
  const app = new Hono<Env>();
  const makePassword = () =>
    newPassword(random ?? ((size) => crypto.getRandomValues(new Uint8Array(size))));

  app.use("*", async (c, next) => {
    if ((await edition?.()) !== "enterprise") {
      return c.json({ error: "Gelöschte Konten gibt es nur mit Stalwart Enterprise." }, 403);
    }
    await next();
  });

  const view = async (loaded: Loaded): Promise<DeletedAccountsView> => {
    const { retentionMs, tasks } = await deleted.read();
    return {
      retentionDays: retentionDaysOf(retentionMs),
      accounts: toDeletedAccounts(tasks, loaded.company.domains),
    };
  };

  app.get("/", async (c) => c.json(await view(c.get("loaded"))));

  app.put("/retention", async (c) => {
    const body = await bodyOf(c, retentionSchema);
    if (!body) return bad(`Bitte 0 bis ${MAX_RETENTION_DAYS} Tage angeben.`);
    const result = await deleted.setRetention(body.days);
    return result.ok ? c.json(await view(c.get("loaded"))) : bad(result.error);
  });

  /** Recovers one; a person gets a new password (shown once), a shared mailbox none. */
  app.post("/:id/restore", async (c) => {
    const loaded = c.get("loaded");
    const { tasks } = await deleted.read();
    const task = tasks.find((candidate) => candidate.id === c.req.param("id"));
    const known = task && toDeletedAccounts([task], loaded.company.domains).length > 0;
    if (!task?.accountId || !known) return c.json({ error: "Nicht gefunden" }, 404);
    const recovered = await deleted.recover(task.id);
    if (!recovered.ok) return bad(recovered.error);
    if (task.accountType === "Group") return c.json({ password: null });
    const password = makePassword();
    const mailboxIds = loaded.company.mailboxes.map((mailbox) => mailbox.id);
    const patch = recoveryPatch(task, mailboxIds, password);
    const patched = await updateAccounts({ [task.accountId]: patch });
    if (!patched.ok) return bad(patched.error);
    for (const id of Object.keys(patch.memberGroupIds)) mailboxChanged?.(id);
    return c.json({ password });
  });

  return app;
};
