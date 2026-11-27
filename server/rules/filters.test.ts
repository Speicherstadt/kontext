import { describe, expect, it } from "vitest";
import {
  type FilterAccess,
  type Invocation,
  legacyCalls,
  loadFilters,
  readFilters,
  saveCalls,
  saveFilters,
  type Vacation,
} from "./filters";
import { type Rule, rulesScript } from "./script";

const vacation = (isEnabled: boolean): Vacation => ({
  isEnabled,
  fromDate: null,
  toDate: null,
  subject: "Urlaub",
  textBody: "Bin weg.",
  htmlBody: null,
});

const rule: Rule = {
  id: "r1",
  name: "",
  enabled: true,
  match: "all",
  conditions: [{ field: "from", operator: "contains", value: "kraus" }],
  moveTo: { id: "m", path: "Steuerberater" },
  markRead: false,
  flag: false,
  forwardTo: null,
  categories: [],
  createTask: false,
  stop: false,
};

const script = (isActive: boolean) => ({
  id: "s1",
  name: "kontext-regeln",
  isActive,
  blobId: "b",
});

describe("readFilters", () => {
  it("takes the reply's state from VacationResponse without rules", () => {
    expect(readFilters(vacation(true), undefined, null)).toEqual({
      rules: [],
      vacation: vacation(true),
    });
  });

  it("takes it from the rules script while that runs", () => {
    const content = rulesScript({ vacation: true, rules: [rule] });
    expect(readFilters(vacation(false), script(true), content).vacation.isEnabled).toBe(true);
    // An inactive script (e.g. after offboarding) does not switch the reply on.
    expect(readFilters(vacation(false), script(false), content).vacation.isEnabled).toBe(false);
    expect(readFilters(vacation(false), script(true), content).rules).toEqual([rule]);
  });
});

const methods = (calls: ReturnType<typeof saveCalls>) => calls.map(([name, args]) => [name, args]);

describe("saveCalls", () => {
  it("only sets VacationResponse when there are no rules and never were", () => {
    expect(
      methods(saveCalls("a", { rules: [], vacation: vacation(true) }, undefined, null)),
    ).toEqual([
      ["VacationResponse/set", { accountId: "a", update: { singleton: vacation(true) } }],
    ]);
  });

  it("keeps VacationResponse on and activates the rules script, which includes the reply", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [rule], vacation: vacation(true) },
      undefined,
      "blob",
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(true) } });
    expect(rules).toEqual([
      "SieveScript/set",
      {
        accountId: "a",
        create: { rules: { name: "kontext-regeln", blobId: "blob" } },
        onSuccessActivateScript: "#rules",
      },
      "rules",
    ]);
  });

  it("hands back to VacationResponse when the last rule goes and the reply is on", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [], vacation: vacation(true) },
      script(true),
      "blob",
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(true) } });
    expect(rules![1]).toEqual({ accountId: "a", update: { s1: { blobId: "blob" } } });
  });

  it("leaves an offboarding script running: nothing activated, the reply stays off", () => {
    const [reply, rules] = saveCalls(
      "a",
      { rules: [rule], vacation: vacation(true) },
      script(false),
      "blob",
      true,
    );
    expect(reply![1]).toEqual({ accountId: "a", update: { singleton: vacation(false) } });
    expect(rules![1]).toEqual({ accountId: "a", update: { s1: { blobId: "blob" } } });
  });

  it("deactivates the rules script when nothing is left to run", () => {
    const [, rules] = saveCalls(
      "a",
      { rules: [{ ...rule, enabled: false }], vacation: vacation(false) },
      script(true),
      "blob",
    );
    expect(rules![1]).toEqual({
      accountId: "a",
      update: { s1: { blobId: "blob" } },
      onSuccessDeactivateScript: true,
    });
  });
});

describe("legacyCalls", () => {
  const legacy = (isActive: boolean) => ({ id: "v1", name: "vacation", isActive, blobId: "b" });

  it("deactivates the reply script from before Stalwart 1.2 first, then destroys it", () => {
    expect(legacyCalls("a", legacy(true))).toEqual([
      ["SieveScript/set", { accountId: "a", onSuccessDeactivateScript: true }, "legacy"],
      ["SieveScript/set", { accountId: "a", destroy: ["v1"] }, "legacy"],
    ]);
  });

  it("only destroys it when it no longer runs, and does nothing without it", () => {
    expect(legacyCalls("a", legacy(false))).toEqual([
      ["SieveScript/set", { accountId: "a", destroy: ["v1"] }, "legacy"],
    ]);
    expect(legacyCalls("a", undefined)).toEqual([]);
  });
});

describe("a reply from before Stalwart 1.2", () => {
  const LEGACY =
    'require ["vacation", "relational", "date"];\r\n\r\n' +
    'vacation :mime :subject "Urlaub" "Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Transfer-Encoding: 7bit\r\n\r\nBin bis Montag weg.\r\n";\r\n';
  const empty = { ...vacation(false), subject: null, textBody: null };
  const fake = (scripts: { id: string; name: string; isActive: boolean; blobId: string }[]) => {
    const sent: Invocation[][] = [];
    const contents: Record<string, string> = {
      legacy: LEGACY,
      rules: rulesScript({ vacation: true, rules: [rule] }),
    };
    const access: FilterAccess = {
      request: async (calls) => {
        sent.push(calls);
        return calls.map(([name, , id]): Invocation => {
          if (name === "VacationResponse/get") return [name, { list: [empty] }, id];
          if (name === "SieveScript/get") return [name, { list: scripts }, id];
          return [name, {}, id];
        });
      },
      upload: async () => "uploaded",
      download: async (_, blobId) => contents[blobId]!,
    };
    return { access, sent };
  };

  it("is loaded with its text and as on while it still answers", async () => {
    const { access } = fake([{ id: "v1", name: "vacation", isActive: true, blobId: "legacy" }]);
    const { vacation: loaded } = await loadFilters(access, "a");
    expect(loaded).toMatchObject({
      isEnabled: true,
      subject: "Urlaub",
      textBody: "Bin bis Montag weg.",
    });
  });

  it("keeps its text when saving the rules removes the old script", async () => {
    const { access, sent } = fake([
      { id: "v1", name: "vacation", isActive: false, blobId: "legacy" },
      { id: "s1", name: "kontext-regeln", isActive: true, blobId: "rules" },
    ]);
    const loaded = await loadFilters(access, "a");
    await saveFilters(access, "a", { rules: loaded.rules, vacation: loaded.vacation });
    const calls = sent.at(-1)!;
    const reply = calls.find(([name]) => name === "VacationResponse/set")!;
    expect((reply[1].update as { singleton: Vacation }).singleton).toMatchObject({
      isEnabled: true,
      subject: "Urlaub",
      textBody: "Bin bis Montag weg.",
    });
    expect(calls[0]).toEqual(["SieveScript/set", { accountId: "a", destroy: ["v1"] }, "legacy"]);
  });
});
