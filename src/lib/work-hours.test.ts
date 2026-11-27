import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_HOURS, offHours, workWeek } from "./work-hours";

describe("workWeek", () => {
  it("is Monday to Friday of the week around the day", () => {
    expect(workWeek("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  it("from a Sunday is the week before it (weeks start on Monday)", () => {
    expect(workWeek("2026-11-08")[0]).toBe("2026-11-02");
    expect(workWeek("2026-11-08").at(-1)).toBe("2026-11-06");
  });
});

describe("offHours", () => {
  it("is the time before and after the working hours", () => {
    expect(DEFAULT_WORK_HOURS).toEqual({ startHour: 7, endHour: 18 });
    expect(offHours({ startHour: 7, endHour: 17 })).toEqual([
      { top: 0, bottom: 420 },
      { top: 1020, bottom: 1440 },
    ]);
  });

  it("leaves out an empty part", () => {
    expect(offHours({ startHour: 0, endHour: 24 })).toEqual([]);
    expect(offHours({ startHour: 0, endHour: 20 })).toEqual([{ top: 1200, bottom: 1440 }]);
  });
});
