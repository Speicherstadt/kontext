import { describe, expect, it } from "vitest";
import {
  dateOrder,
  dayAfterKey,
  formatDate,
  formatTime,
  joinDateTime,
  monthDays,
  parseDate,
  parseTime,
  shiftMonths,
  splitDateTime,
  stepIndex,
  timeSteps,
  withinRange,
} from "./date-field";

const de = { locale: "de-DE", today: "2026-11-23" };
const en = { locale: "en-GB", today: "2026-11-23" };

describe("formatDate", () => {
  it("writes the day as the language does", () => {
    expect(formatDate("2026-12-08", "de-DE")).toBe("08.12.2026");
    expect(formatDate("2026-12-08", "en-GB")).toBe("08/12/2026");
    expect(formatDate("", "de-DE")).toBe("");
  });
});

describe("dateOrder", () => {
  it("knows day before month in Europe and month first in the US", () => {
    expect(dateOrder("de-DE")).toEqual(["day", "month", "year"]);
    expect(dateOrder("en-GB")).toEqual(["day", "month", "year"]);
    expect(dateOrder("en-US")).toEqual(["month", "day", "year"]);
  });
});

describe("parseDate", () => {
  it("reads the language's own form and the ISO form", () => {
    expect(parseDate("18.12.2030", { ...de, complete: true })).toBe("2030-12-18");
    expect(parseDate("18/12/2030", { ...en, complete: true })).toBe("2030-12-18");
    expect(parseDate("2030-12-18", { ...de, complete: true })).toBe("2030-12-18");
    expect(parseDate("12/18/2030", { locale: "en-US", today: de.today, complete: true })).toBe(
      "2030-12-18",
    );
  });

  it("waits for the four-digit year while typing", () => {
    expect(parseDate("1.12.20", { ...de, complete: true })).toBeNull();
    expect(parseDate("1.12.", { ...de, complete: true })).toBeNull();
    expect(parseDate("1.12.2030", { ...de, complete: true })).toBe("2030-12-01");
  });

  it("fills in the year and month on leaving the field", () => {
    expect(parseDate("1.12.", { ...de, complete: false })).toBe("2026-12-01");
    expect(parseDate("5", { ...de, complete: false })).toBe("2026-11-05");
    expect(parseDate("1.12.27", { ...de, complete: false })).toBe("2027-12-01");
  });

  it("refuses days that do not exist and text that is no day", () => {
    expect(parseDate("31.02.2027", { ...de, complete: false })).toBeNull();
    expect(parseDate("29.02.2028", { ...de, complete: false })).toBe("2028-02-29");
    expect(parseDate("13/13/2027", { ...en, complete: false })).toBeNull();
    expect(parseDate("morgen", { ...de, complete: false })).toBeNull();
    expect(parseDate("1.2.3.4", { ...de, complete: false })).toBeNull();
  });
});

describe("formatTime and parseTime", () => {
  it("shows the 24-hour clock", () => {
    expect(formatTime("09:05", "de-DE")).toBe("09:05");
    expect(formatTime("14:30", "en-GB")).toBe("14:30");
    expect(formatTime("", "de-DE")).toBe("");
  });

  it("takes a time once the minutes are there while typing", () => {
    expect(parseTime("14:30", { complete: true })).toBe("14:30");
    expect(parseTime("9.05", { complete: true })).toBe("09:05");
    expect(parseTime("14:3", { complete: true })).toBeNull();
    expect(parseTime("14", { complete: true })).toBeNull();
  });

  it("reads short forms and am/pm on leaving the field", () => {
    expect(parseTime("14", { complete: false })).toBe("14:00");
    expect(parseTime("930", { complete: false })).toBe("09:30");
    expect(parseTime("1430", { complete: false })).toBe("14:30");
    expect(parseTime("2:30 pm", { complete: false })).toBe("14:30");
    expect(parseTime("12 am", { complete: false })).toBe("00:00");
  });

  it("refuses times that do not exist", () => {
    expect(parseTime("24:00", { complete: false })).toBeNull();
    expect(parseTime("12:60", { complete: false })).toBeNull();
    expect(parseTime("13 pm", { complete: false })).toBeNull();
    expect(parseTime("Mittag", { complete: false })).toBeNull();
  });
});

describe("timeSteps and stepIndex", () => {
  it("lists the quarter hours of a day", () => {
    const steps = timeSteps(15);
    expect(steps).toHaveLength(96);
    expect(steps.slice(0, 3)).toEqual(["00:00", "00:15", "00:30"]);
    expect(steps.at(-1)).toBe("23:45");
  });

  it("starts the list at the step of the time, or just before it", () => {
    const steps = timeSteps(15);
    expect(steps[stepIndex(steps, "14:30")]).toBe("14:30");
    expect(steps[stepIndex(steps, "14:40")]).toBe("14:30");
    expect(steps[stepIndex(steps, "23:59")]).toBe("23:45");
    expect(stepIndex(steps, "")).toBe(0);
  });
});

describe("the month grid", () => {
  it("shows six weeks from the Monday on or before the 1st", () => {
    const days = monthDays("2026-12-18");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-11-30");
    expect(days[1]).toBe("2026-12-01");
  });

  it("moves with the keys of the ARIA date picker", () => {
    expect(dayAfterKey("2026-12-31", "ArrowRight")).toBe("2027-01-01");
    expect(dayAfterKey("2026-12-01", "ArrowUp")).toBe("2026-11-24");
    expect(dayAfterKey("2026-12-18", "Home")).toBe("2026-12-14");
    expect(dayAfterKey("2026-12-18", "End")).toBe("2026-12-20");
    expect(dayAfterKey("2026-12-18", "PageDown")).toBe("2027-01-18");
    expect(dayAfterKey("2026-12-18", "PageUp", true)).toBe("2025-12-18");
    expect(dayAfterKey("2026-12-18", "Enter")).toBeNull();
  });

  it("keeps the day of the month where it can", () => {
    expect(shiftMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(shiftMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(shiftMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("knows the allowed range", () => {
    expect(withinRange("2026-12-18", "2026-12-18")).toBe(true);
    expect(withinRange("2026-12-17", "2026-12-18")).toBe(false);
    expect(withinRange("2026-12-19", undefined, "2026-12-18")).toBe(false);
    expect(withinRange("2026-12-19")).toBe(true);
  });
});

describe("splitDateTime and joinDateTime", () => {
  it("parts and joins a datetime-local value", () => {
    expect(splitDateTime("2026-12-18T14:30")).toEqual({ date: "2026-12-18", time: "14:30" });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(joinDateTime({ date: "2026-12-18", time: "14:30" })).toBe("2026-12-18T14:30");
    expect(joinDateTime({ date: "2026-12-18", time: "" })).toBe("");
  });
});
