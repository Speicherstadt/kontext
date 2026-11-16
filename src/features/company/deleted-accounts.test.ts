import { describe, expect, it } from "vitest";
import { deleteOutcome, formatDay } from "./deleted-accounts";

describe("deleteOutcome", () => {
  it("is final in Community and without a retention, recoverable with one", () => {
    expect(deleteOutcome(undefined)).toEqual({ kind: "final" });
    expect(deleteOutcome({ retentionDays: null, accounts: [] })).toEqual({ kind: "final" });
    expect(deleteOutcome({ retentionDays: 30, accounts: [] })).toEqual({
      kind: "recoverable",
      days: 30,
    });
  });
});

describe("formatDay", () => {
  it("shows a day, a dash when Stalwart did not say", () => {
    expect(formatDay(null)).toBe("–");
    expect(formatDay("2026-12-01T10:00:00Z")).toMatch(/2026/);
  });
});
