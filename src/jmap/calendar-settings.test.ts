import { describe, expect, it } from "vitest";
import { getCalendarSettings, updateWorkingHours } from "./calendar-settings";
import type { JmapClient } from "./client";

const fakeClient = (
  handler: (method: string, args: Record<string, unknown>) => unknown,
): { client: JmapClient; calls: [string, Record<string, unknown>][] } => {
  const calls: [string, Record<string, unknown>][] = [];
  const client = {
    call: async (method: string, args: Record<string, unknown>) => {
      calls.push([method, args]);
      return handler(method, args);
    },
  } as unknown as JmapClient;
  return { client, calls };
};

describe("getCalendarSettings", () => {
  it("liest workingHours über x:CalendarSettings/get", async () => {
    const workingHours = {
      enable: true,
      timeZone: "Europe/Berlin",
      slots: { "0": { days: { monday: true }, start: "08:00", end: "16:00" } },
    };
    const { client, calls } = fakeClient(() => ({ list: [{ workingHours }] }));
    expect(await getCalendarSettings(client)).toEqual({ status: "ok", workingHours });
    expect(calls).toEqual([["x:CalendarSettings/get", { ids: ["singleton"] }]]);
  });

  it("meldet forbidden bei fehlenden Rechten", async () => {
    const { client } = fakeClient(() => {
      throw Object.assign(new Error("Not allowed"), { type: "forbidden" });
    });
    expect(await getCalendarSettings(client)).toEqual({ status: "forbidden" });
  });
});

describe("updateWorkingHours", () => {
  it("schreibt workingHours über x:CalendarSettings/set auf singleton", async () => {
    const workingHours = {
      enable: true,
      timeZone: "Europe/Berlin",
      slots: { "0": { days: { monday: true, tuesday: true }, start: "08:00", end: "12:00" } },
    };
    const { client, calls } = fakeClient(() => ({ updated: { singleton: null } }));
    await updateWorkingHours(client, workingHours);
    expect(calls).toEqual([
      ["x:CalendarSettings/set", { update: { singleton: { workingHours } } }],
    ]);
  });

  it("wirft bei notUpdated", async () => {
    const { client } = fakeClient(() => ({
      notUpdated: { singleton: { type: "invalidProperties", description: "Invalid interval" } },
    }));
    await expect(
      updateWorkingHours(client, { enable: true, timeZone: null, slots: {} }),
    ).rejects.toThrow("Invalid interval");
  });
});
