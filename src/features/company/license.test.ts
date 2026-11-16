import { afterEach, describe, expect, it, vi } from "vitest";
import { EXPIRY_WARNING_MS, getLicense, type License, licenseWarnings } from "./license";

afterEach(() => vi.unstubAllGlobals());

const NOW = Date.UTC(2026, 10, 16);
const license = (over: Partial<License> = {}): License => ({
  used: 12,
  limit: 25,
  validTo: "2027-12-31T00:00:00.000Z",
  domain: "weber-haustechnik.de",
  ...over,
});

describe("licenseWarnings", () => {
  it("is quiet with room and time left", () => {
    expect(licenseWarnings(license(), NOW)).toEqual({
      full: false,
      nearLimit: false,
      expiresSoon: false,
    });
  });

  it("warns from 90 % on, and says full where Stalwart refuses new accounts", () => {
    expect(licenseWarnings(license({ used: 22 }), NOW).nearLimit).toBe(false);
    expect(licenseWarnings(license({ used: 23 }), NOW)).toMatchObject({
      nearLimit: true,
      full: false,
    });
    expect(licenseWarnings(license({ used: 25 }), NOW)).toMatchObject({
      nearLimit: false,
      full: true,
    });
  });

  it("warns 30 days before the end", () => {
    const at = (ms: number) => license({ validTo: new Date(NOW + ms).toISOString() });
    expect(licenseWarnings(at(EXPIRY_WARNING_MS + 1), NOW).expiresSoon).toBe(false);
    expect(licenseWarnings(at(EXPIRY_WARNING_MS), NOW).expiresSoon).toBe(true);
  });

  it("warns about nothing it does not know", () => {
    expect(
      licenseWarnings(license({ used: 30, limit: null, validTo: null, domain: null }), NOW),
    ).toEqual({ full: false, nearLimit: false, expiresSoon: false });
  });
});

describe("getLicense", () => {
  it("reads the server's answer, null without one", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ license: license() }));
    expect(await getLicense()).toEqual(license());
    vi.stubGlobal("fetch", async () => Response.json({ license: null }));
    expect(await getLicense()).toBeNull();
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    expect(await getLicense()).toBeNull();
  });
});
