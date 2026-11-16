import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env, Loaded } from "./context";
import {
  createDeletedAccounts,
  type DestroyTask,
  deletedAccountRoutes,
  recoveryPatch,
  retentionDaysOf,
  retentionMsOf,
  toDeletedAccounts,
} from "./deleted-accounts";
import type { Edition } from "./edition";
import type { Invocation } from "./management";

const DAY = 86_400_000;
const domains = [{ id: "d", name: "firma.de" }];

const task = (id: string, overrides: Partial<DestroyTask> = {}): DestroyTask => ({
  id,
  "@type": "DestroyAccount",
  accountId: `a${id}`,
  accountName: `person${id}`,
  accountDomainId: "d",
  accountType: "User",
  memberGroupIds: { g: true, gone: true },
  status: { "@type": "Pending", createdAt: "2026-11-01T10:00:00Z", due: "2026-12-01T10:00:00Z" },
  due: "2026-12-01T10:00:00Z",
  ...overrides,
});

describe("retention", () => {
  it("turns Stalwart's milliseconds into days and back", () => {
    expect(retentionDaysOf(null)).toBeNull();
    expect(retentionDaysOf(0)).toBeNull();
    expect(retentionDaysOf(30 * DAY)).toBe(30);
    expect(retentionDaysOf(DAY / 4)).toBe(1);
    expect(retentionMsOf(30)).toBe(30 * DAY);
    expect(retentionMsOf(0)).toBeNull();
  });
});

describe("toDeletedAccounts", () => {
  it("keeps the company's pending deletions, the soonest gone first", () => {
    const list = toDeletedAccounts(
      [
        task("1"),
        task("2", { due: "2026-11-20T10:00:00Z", accountType: "Group", accountName: "info" }),
        task("3", { accountDomainId: "other" }),
        task("4", { "@type": "AccountMaintenance" }),
      ],
      domains,
    );
    expect(list).toEqual([
      {
        id: "2",
        accountId: "a2",
        kind: "mailbox",
        email: "info@firma.de",
        deletedAt: "2026-11-01T10:00:00Z",
        purgeAt: "2026-11-20T10:00:00Z",
      },
      {
        id: "1",
        accountId: "a1",
        kind: "employee",
        email: "person1@firma.de",
        deletedAt: "2026-11-01T10:00:00Z",
        purgeAt: "2026-12-01T10:00:00Z",
      },
    ]);
  });

  it("reads the due date from the status when the task has none", () => {
    const [account] = toDeletedAccounts([task("1", { due: undefined })], domains);
    expect(account?.purgeAt).toBe("2026-12-01T10:00:00Z");
  });
});

describe("recoveryPatch", () => {
  it("gives a password and the shared mailboxes that still exist", () => {
    expect(recoveryPatch(task("1"), ["g"], "abcd")).toEqual({
      credentials: { "0": { "@type": "Password", secret: "abcd" } },
      memberGroupIds: { g: true },
    });
  });
});

/** A Stalwart that answers the calls of deleted-accounts.ts and keeps them. */
const fakeStalwart = ({ refuse }: { refuse?: string } = {}) => {
  const calls: Invocation[] = [];
  let retention: number | null = 30 * DAY;
  const tasks = [task("1"), task("2", { accountType: "Group", accountName: "info" })];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> => {
    calls.push(...methodCalls);
    return methodCalls.map(([name, args, id]): Invocation => {
      if (name === "x:DataRetention/get")
        return [name, { list: [{ id: "singleton", archiveDeletedAccountsFor: retention }] }, id];
      if (name === "x:Task/query") return [name, { ids: tasks.map((t) => t.id) }, id];
      if (name === "x:Task/get") return [name, { list: tasks }, id];
      if (name === "x:DataRetention/set") {
        const update = (args.update as { singleton: { archiveDeletedAccountsFor: number | null } })
          .singleton;
        retention = update.archiveDeletedAccountsFor;
        return [name, { updated: { singleton: null } }, id];
      }
      if (name === "x:Task/set" && refuse)
        return [name, { notDestroyed: { 1: { type: "forbidden", description: refuse } } }, id];
      return [name, {}, id];
    });
  };
  return { request, calls, names: () => calls.map(([name]) => name) };
};

const loaded = {
  company: { domains, mailboxes: [{ id: "g" }], employees: [] },
} as unknown as Loaded;

const setup = (edition: Edition, options: { refuse?: string } = {}) => {
  const stalwart = fakeStalwart(options);
  const updates: Record<string, Record<string, unknown>>[] = [];
  const changed: string[] = [];
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("loaded", loaded);
    await next();
  });
  app.route(
    "/",
    deletedAccountRoutes({
      deleted: createDeletedAccounts(stalwart.request),
      edition: async () => edition,
      updateAccounts: async (patches) => {
        updates.push(patches);
        return { ok: true, value: null };
      },
      random: (size) => new Uint8Array(size),
      mailboxChanged: (id) => changed.push(id),
    }),
  );
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...stalwart, updates, changed, send };
};

describe("deletedAccountRoutes", () => {
  it("refuses without an Enterprise license and asks Stalwart nothing", async () => {
    const { send, calls } = setup("community");
    const response = await send("GET", "/");
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain("Enterprise");
    expect((await send("POST", "/1/restore")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("lists the deletions with the retention, tasks by back-reference", async () => {
    const { send, calls } = setup("enterprise");
    const view = (await (await send("GET", "/")).json()) as {
      retentionDays: number;
      accounts: { id: string }[];
    };
    expect(view.retentionDays).toBe(30);
    expect(view.accounts.map((account) => account.id)).toEqual(["1", "2"]);
    expect(calls[1]).toEqual(["x:Task/query", { filter: { "@type": "DestroyAccount" } }, "q"]);
    expect(calls[2]?.[1]).toEqual({
      "#ids": { resultOf: "q", name: "x:Task/query", path: "/ids" },
    });
  });

  it("recovers a person with a new password and their mailboxes", async () => {
    const { send, calls, updates, changed } = setup("enterprise");
    const response = await send("POST", "/1/restore");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ password: "aaaa-aaaa-aaaa-aaaa" });
    expect(calls).toContainEqual(["x:Task/set", { destroy: ["1"] }, "0"]);
    expect(updates).toEqual([
      {
        a1: {
          credentials: { "0": { "@type": "Password", secret: "aaaa-aaaa-aaaa-aaaa" } },
          memberGroupIds: { g: true },
        },
      },
    ]);
    expect(changed).toEqual(["g"]);
  });

  it("recovers a shared mailbox without a password", async () => {
    const { send, updates } = setup("enterprise");
    expect(await (await send("POST", "/2/restore")).json()).toEqual({ password: null });
    expect(updates).toEqual([]);
  });

  it("passes Stalwart's refusal on and knows only pending deletions", async () => {
    const { send, updates } = setup("enterprise", { refuse: "Account recovery failed" });
    const refused = await send("POST", "/1/restore");
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Account recovery failed" });
    expect(updates).toEqual([]);
    expect((await send("POST", "/9/restore")).status).toBe(404);
  });

  it("sets the retention and reloads Stalwart's settings", async () => {
    const { send, calls, names } = setup("enterprise");
    const view = (await (await send("PUT", "/retention", { days: 14 })).json()) as {
      retentionDays: number;
    };
    expect(view.retentionDays).toBe(14);
    expect(calls).toContainEqual([
      "x:DataRetention/set",
      { update: { singleton: { archiveDeletedAccountsFor: 14 * DAY } } },
      "0",
    ]);
    expect(names()).toContain("x:Action/set");
    await send("PUT", "/retention", { days: 0 });
    expect(calls).toContainEqual([
      "x:DataRetention/set",
      { update: { singleton: { archiveDeletedAccountsFor: null } } },
      "0",
    ]);
    expect((await send("PUT", "/retention", { days: -1 })).status).toBe(400);
  });
});
