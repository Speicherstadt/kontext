import { afterEach, describe, expect, it, vi } from "vitest";
import { type ArchiveAccount, getItems, pickAccount, restoreItems, retentionDays } from "./api";

afterEach(() => vi.unstubAllGlobals());

const accounts: ArchiveAccount[] = [
  { id: "2", email: "anna@firma.de", name: "Anna", kind: "own" },
  { id: "g", email: "info@firma.de", name: "Info", kind: "mailbox" },
];

describe("retentionDays", () => {
  it("shows whole days, at least one for any time set, 0 for none", () => {
    expect(retentionDays(null)).toBe(0);
    expect(retentionDays(0)).toBe(0);
    expect(retentionDays(30 * 24 * 60 * 60_000)).toBe(30);
    expect(retentionDays(60 * 60_000)).toBe(1);
  });
});

describe("pickAccount", () => {
  it("takes the asked-for account if the caller may see it, else the own", () => {
    expect(pickAccount(accounts, "g")).toBe("g");
    expect(pickAccount(accounts, "3")).toBe("2");
    expect(pickAccount(accounts)).toBe("2");
    expect(pickAccount([])).toBeUndefined();
  });
});

describe("the calls", () => {
  it("ask the account's items and send the ids to restore", async () => {
    const fetch = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await getItems("g")).toEqual([]);
    await restoreItems("g", ["a1"]);
    expect(fetch).toHaveBeenLastCalledWith("/api/company/archive/accounts/g/restore", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["a1"] }),
    });
  });

  it("throw the server's reason", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Nicht gefunden" }, { status: 404 }));
    await expect(getItems("3")).rejects.toThrow("Nicht gefunden");
  });
});
