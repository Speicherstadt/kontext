// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createLicenseCheck, decodeLicenseKey, licenseKeyOf, toLicense } from "./license";
import type { Invocation, StalwartRequest } from "./management";

/** A key laid out as license.rs reads it; the signature is not checked here. */
const keyOf = (validFrom: number, validTo: number, accounts: number, domain: string) => {
  const name = Buffer.from(domain, "utf8");
  const bytes = Buffer.alloc(24 + name.length + 64);
  bytes.writeBigUInt64LE(BigInt(validFrom), 0);
  bytes.writeBigUInt64LE(BigInt(validTo), 8);
  bytes.writeUInt32LE(accounts, 16);
  bytes.writeUInt32LE(name.length, 20);
  name.copy(bytes, 24);
  return bytes.toString("base64");
};

const END = Date.UTC(2027, 11, 31) / 1000;
const KEY = keyOf(END - 365 * 86400, END, 25, "weber-haustechnik.de");

describe("decodeLicenseKey", () => {
  it("reads limit, time and domain from the key", () => {
    expect(decodeLicenseKey(KEY)).toEqual({
      validFrom: END - 365 * 86400,
      validTo: END,
      accounts: 25,
      domain: "weber-haustechnik.de",
    });
  });

  it("gives nothing for a masked, cut or senseless key", () => {
    expect(decodeLicenseKey("****")).toBeNull();
    expect(decodeLicenseKey("")).toBeNull();
    expect(decodeLicenseKey(KEY.slice(0, 20))).toBeNull();
    expect(decodeLicenseKey(keyOf(END, END - 1, 25, "firma.de"))).toBeNull();
    expect(decodeLicenseKey(keyOf(1, END, 0, "firma.de"))).toBeNull();
    expect(decodeLicenseKey(keyOf(1, END, 5, ""))).toBeNull();
  });
});

describe("licenseKeyOf", () => {
  it("takes the key from x:Enterprise/get only when it comes in clear", () => {
    const answer = (secret: string) => ({
      list: [{ id: "singleton", licenseKey: { "@type": "Value", secret } }],
    });
    expect(licenseKeyOf(answer(KEY))?.accounts).toBe(25);
    expect(licenseKeyOf(answer("****"))).toBeNull();
    expect(licenseKeyOf({ list: [{ licenseKey: { "@type": "None" } }] })).toBeNull();
    expect(licenseKeyOf(null)).toBeNull();
  });
});

describe("toLicense", () => {
  it("joins the count with the key, null where unknown", () => {
    expect(toLicense(12, decodeLicenseKey(KEY))).toEqual({
      used: 12,
      limit: 25,
      validTo: "2027-12-31T00:00:00.000Z",
      domain: "weber-haustechnik.de",
    });
    expect(toLicense(12, null)).toEqual({ used: 12, limit: null, validTo: null, domain: null });
  });
});

describe("createLicenseCheck", () => {
  const answering = (byMethod: Record<string, Record<string, unknown> | Error>) =>
    vi.fn(async (calls: Invocation[]) => {
      const method = calls[0]![0];
      const answer = byMethod[method];
      if (!answer || answer instanceof Error) throw answer ?? new Error("unknown method");
      return [[method, answer, "0"]] as Invocation[];
    });

  it("counts every account as Stalwart does and reads the key", async () => {
    const request = answering({
      "x:Account/query": { ids: ["a"], total: 12 },
      "x:Enterprise/get": { list: [{ licenseKey: { "@type": "Value", secret: KEY } }] },
    });
    expect(await createLicenseCheck(request as unknown as StalwartRequest)()).toEqual({
      used: 12,
      limit: 25,
      validTo: "2027-12-31T00:00:00.000Z",
      domain: "weber-haustechnik.de",
    });
    expect(request).toHaveBeenCalledWith([
      ["x:Account/query", { calculateTotal: true, limit: 1 }, "0"],
    ]);
  });

  it("keeps the count when the key may not read the license", async () => {
    const request = answering({
      "x:Account/query": { ids: [], total: 3 },
      "x:Enterprise/get": new Error("forbidden"),
    });
    expect(await createLicenseCheck(request as unknown as StalwartRequest)()).toEqual({
      used: 3,
      limit: null,
      validTo: null,
      domain: null,
    });
  });
});
