// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type Roles, rolesValue, type StalwartAccount } from "./accounts";
import type { Archive, ArchivedItem } from "./archive";
import { archiveRoutes, checkItems, ownArchiveAccounts } from "./archive-routes";
import type { CompanyDeps } from "./context";
import type { Edition } from "./edition";

const roles: Roles = { userRoleIds: ["b"], companyRoleId: "f" };

const user = (id: string, name: string, admin = false, groups: string[] = []): StalwartAccount => ({
  id,
  "@type": "User",
  name,
  domainId: "d",
  description: name,
  emailAddress: `${name}@firma.de`,
  roles: rolesValue(admin, roles),
  permissions: { "@type": "Inherit" },
  memberGroupIds: Object.fromEntries(groups.map((g) => [g, true as const])),
});

const accounts: StalwartAccount[] = [
  user("1", "chef", true),
  user("2", "anna", false, ["g"]),
  user("3", "max"),
  { id: "g", "@type": "Group", name: "info", domainId: "d", roles: { "@type": "Default" } },
];

const item = (id: string, accountId: string, restorable = true): ArchivedItem => ({
  id,
  accountId,
  kind: restorable ? "Email" : "CalendarEvent",
  title: "Angebot",
  from: "kunde@example.com",
  date: null,
  size: 10,
  archivedAt: "2026-11-10T08:00:00Z",
  archivedUntil: "2026-12-10T08:00:00Z",
  restorable,
});

const ITEMS = [item("a2", "2"), item("ag", "g"), item("a3", "3"), item("e2", "2", false)];

const setup = (email: string | null, edition: Edition = "enterprise") => {
  const restored: string[][] = [];
  const destroyed: string[][] = [];
  const retentions: (number | null)[] = [];
  const archive: Archive = {
    get: async (ids) => ({ ok: true, value: ITEMS.filter((i) => ids.includes(i.id)) }),
    list: async (accountId) => ({
      ok: true,
      value: ITEMS.filter((i) => i.accountId === accountId),
    }),
    restore: async (ids) => {
      restored.push(ids);
      return { ok: true, value: null };
    },
    destroy: async (ids) => {
      destroyed.push(ids);
      return { ok: true, value: null };
    },
    retention: async () => ({ known: true, ms: retentions.at(-1) ?? null }),
    setRetention: async (ms) => {
      retentions.push(ms);
      return { ok: true, value: null };
    },
  };
  const deps = {
    management: {
      listAccounts: async () => accounts,
      listDomains: async () => [{ id: "d", name: "firma.de" }],
      loadRoles: async () => roles,
    },
    currentEmail: async () => email,
    edition: async () => edition,
    archive,
  } as unknown as CompanyDeps & { archive: Archive };
  const app = archiveRoutes(deps);
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { send, restored, destroyed, retentions };
};

describe("ownArchiveAccounts", () => {
  it("is the own account and the shared mailboxes one is a member of", () => {
    const company = {
      employees: [
        { id: "2", email: "anna@firma.de", fullName: "Anna", active: true },
        { id: "4", email: "ex@firma.de", fullName: "Ex", active: false },
      ],
      mailboxes: [
        { id: "g", email: "info@firma.de", description: "Info", memberIds: ["2"] },
        { id: "h", email: "rechnung@firma.de", description: "", memberIds: ["4"] },
      ],
    } as never;
    expect(ownArchiveAccounts(company, "Anna@Firma.de")).toEqual([
      { id: "2", email: "anna@firma.de", name: "Anna", kind: "own" },
      { id: "g", email: "info@firma.de", name: "Info", kind: "mailbox" },
    ]);
    expect(ownArchiveAccounts(company, "ex@firma.de")).toEqual([]);
  });
});

describe("checkItems", () => {
  it("lets through only the account's own items, and restores only what Stalwart can", () => {
    expect(checkItems(ITEMS, ["a2"], "2", true)).toBeNull();
    expect(checkItems(ITEMS, ["a3"], "2", true)).toBe("Nicht gefunden");
    expect(checkItems(ITEMS, ["zz"], "2", false)).toBe("Nicht gefunden");
    expect(checkItems(ITEMS, ["e2"], "2", true)).toContain("noch nicht");
    expect(checkItems(ITEMS, ["e2"], "2", false)).toBeNull();
  });
});

describe("archive routes", () => {
  it("show everyone their own account and shared mailboxes, and whether they are admin", async () => {
    const view = await (await setup("anna@firma.de").send("GET", "/")).json();
    expect(view.accounts.map((a: { id: string }) => a.id)).toEqual(["2", "g"]);
    expect(view.admin).toBe(false);
    expect(view.retention).toEqual({ known: true, ms: null });
    expect((await (await setup("chef@firma.de").send("GET", "/")).json()).admin).toBe(true);
  });

  it("refuse without sign-in and without Enterprise", async () => {
    expect((await setup(null).send("GET", "/")).status).toBe(401);
    expect((await setup("anna@firma.de", "community").send("GET", "/")).status).toBe(404);
    expect((await setup("anna@firma.de", "unknown").send("GET", "/accounts/2")).status).toBe(404);
  });

  it("list the items of the own account and the shared mailbox, not a colleague's", async () => {
    const anna = setup("anna@firma.de");
    const own = await (await anna.send("GET", "/accounts/2")).json();
    expect(own.items.map((i: ArchivedItem) => i.id)).toEqual(["a2", "e2"]);
    expect((await anna.send("GET", "/accounts/g")).status).toBe(200);
    expect((await anna.send("GET", "/accounts/3")).status).toBe(404);
  });

  it("let the admin work with every employee's and shared mailbox's items", async () => {
    const chef = setup("chef@firma.de");
    expect((await chef.send("GET", "/accounts/3")).status).toBe(200);
    expect((await chef.send("POST", "/accounts/3/restore", { ids: ["a3"] })).status).toBe(200);
    expect(chef.restored).toEqual([["a3"]]);
    expect((await chef.send("GET", "/accounts/unknown")).status).toBe(404);
  });

  it("restore and delete only items of the account in the path", async () => {
    const anna = setup("anna@firma.de");
    const restored = await anna.send("POST", "/accounts/2/restore", { ids: ["a2"] });
    expect(restored.status).toBe(200);
    expect((await restored.json()).items).toBeDefined();
    expect(anna.restored).toEqual([["a2"]]);
    // An item of another account, sent along with the own account's path.
    expect((await anna.send("POST", "/accounts/2/destroy", { ids: ["a3"] })).status).toBe(400);
    expect((await anna.send("POST", "/accounts/2/restore", { ids: ["e2"] })).status).toBe(400);
    expect((await anna.send("POST", "/accounts/2/destroy", { ids: ["e2"] })).status).toBe(200);
    expect(anna.destroyed).toEqual([["e2"]]);
    expect((await anna.send("POST", "/accounts/2/destroy", { ids: [] })).status).toBe(400);
  });

  it("let only the admin set how long Stalwart keeps deleted items", async () => {
    expect((await setup("anna@firma.de").send("PUT", "/retention", { days: 30 })).status).toBe(403);
    const chef = setup("chef@firma.de");
    const answer = await (await chef.send("PUT", "/retention", { days: 30 })).json();
    expect(answer.retention).toEqual({ known: true, ms: 30 * 24 * 60 * 60_000 });
    await chef.send("PUT", "/retention", { days: 0 });
    expect(chef.retentions).toEqual([30 * 24 * 60 * 60_000, null]);
    expect((await chef.send("PUT", "/retention", { days: -1 })).status).toBe(400);
  });
});
