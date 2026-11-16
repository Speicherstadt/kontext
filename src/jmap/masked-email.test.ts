import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import {
  createMaskedEmail,
  creationOf,
  deleteMaskedEmail,
  expiryFrom,
  isValidPrefix,
  listMaskedEmails,
  type MaskedEmail,
  maskedState,
  setMaskedEmailEnabled,
  siteOf,
} from "./masked-email";

const NOW = new Date("2026-11-16T10:00:00.250Z");

const entry = (over: Partial<MaskedEmail> = {}): MaskedEmail => ({
  id: "a",
  email: "x7k2.1bz9q@weber-haustechnik.test",
  enable: true,
  description: null,
  forDomain: null,
  createdAt: "2026-11-01T08:00:00Z",
  expiresAt: null,
  ...over,
});

describe("expiryFrom", () => {
  it("counts from now, in Stalwart's form without fractions", () => {
    expect(expiryFrom("never", NOW)).toBeNull();
    expect(expiryFrom("day", NOW)).toBe("2026-11-17T10:00:00Z");
    expect(expiryFrom("week", NOW)).toBe("2026-11-23T10:00:00Z");
    expect(expiryFrom("year", NOW)).toBe("2027-11-16T10:00:00Z");
  });
});

describe("isValidPrefix", () => {
  it("follows Stalwart's rules, empty means random", () => {
    expect(isValidPrefix("")).toBe(true);
    expect(isValidPrefix("shop_2026")).toBe(true);
    expect(isValidPrefix("_shop")).toBe(false);
    expect(isValidPrefix("shop.de")).toBe(false);
    expect(isValidPrefix("a".repeat(64))).toBe(true);
    expect(isValidPrefix("a".repeat(65))).toBe(false);
  });
});

describe("siteOf", () => {
  it("keeps the host of a web address, other text as typed", () => {
    expect(siteOf("https://www.baumarkt.de/konto?x=1")).toBe("baumarkt.de");
    expect(siteOf(" shop.example.com ")).toBe("shop.example.com");
    expect(siteOf("")).toBe("");
    expect(siteOf("Mein Newsletter")).toBe("Mein Newsletter");
  });
});

describe("maskedState", () => {
  it("is off when switched off, expired once the time passed", () => {
    expect(maskedState(entry(), NOW)).toBe("active");
    expect(maskedState(entry({ enable: false }), NOW)).toBe("off");
    expect(maskedState(entry({ expiresAt: "2026-11-16T09:00:00Z" }), NOW)).toBe("expired");
    expect(maskedState(entry({ expiresAt: "2026-11-17T09:00:00Z" }), NOW)).toBe("active");
  });
});

describe("creationOf", () => {
  it("sends only what was filled in", () => {
    expect(creationOf({ description: " ", site: "", prefix: "", expiry: "never" }, NOW)).toEqual({
      enable: true,
    });
    expect(
      creationOf(
        { description: "Baumarkt", site: "https://baumarkt.de", prefix: "Shop", expiry: "day" },
        NOW,
      ),
    ).toEqual({
      enable: true,
      description: "Baumarkt",
      forDomain: "baumarkt.de",
      emailPrefix: "shop",
      expiresAt: "2026-11-17T10:00:00Z",
    });
  });
});

describe("the masked addresses at Stalwart", () => {
  it("are listed newest first, created, switched and deleted as registry objects", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const client = {
      call: async (method: string, args: Record<string, unknown>) => {
        calls.push([method, args]);
        if (method.endsWith("/get"))
          return {
            list: [
              entry({ id: "old", createdAt: "2026-10-01T08:00:00Z" }),
              { ...entry({ id: "new", createdAt: "2026-11-02T08:00:00Z" }), expiresAt: undefined },
            ],
          };
        if ((args as { create?: unknown }).create)
          return { created: { m: { id: "n", email: "shop.abc@weber-haustechnik.test" } } };
        return { updated: { a: null }, destroyed: ["a"] };
      },
    } as unknown as JmapClient;
    const list = await listMaskedEmails(client);
    expect(list.map((one) => one.id)).toEqual(["new", "old"]);
    expect(list[0]!.expiresAt).toBeNull();
    expect(
      await createMaskedEmail(
        client,
        { description: "Shop", site: "", prefix: "", expiry: "never" },
        NOW,
      ),
    ).toBe("shop.abc@weber-haustechnik.test");
    await setMaskedEmailEnabled(client, "a", false);
    await deleteMaskedEmail(client, "a");
    expect(calls.map(([method]) => method)).toEqual([
      "x:MaskedEmail/get",
      "x:MaskedEmail/set",
      "x:MaskedEmail/set",
      "x:MaskedEmail/set",
    ]);
    expect(calls[1]![1]).toEqual({ create: { m: { enable: true, description: "Shop" } } });
    expect(calls[2]![1]).toEqual({ update: { a: { enable: false } } });
    expect(calls[3]![1]).toEqual({ destroy: ["a"] });
  });

  it("passes on Stalwart's refusal, such as the quota", async () => {
    const client = {
      call: async () => ({
        notCreated: {
          m: {
            type: "overQuota",
            description: "You have exceeded your quota of 10 masked addresses.",
          },
        },
      }),
    } as unknown as JmapClient;
    await expect(
      createMaskedEmail(client, { description: "", site: "", prefix: "", expiry: "never" }),
    ).rejects.toThrow("quota of 10");
  });
});
