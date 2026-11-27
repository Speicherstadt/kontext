import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_HOURS } from "./work-hours";
import {
  calendarWorkHours,
  defaultWorkingHoursSlots,
  fromStalwartWorkingHours,
  MAX_WORKING_HOURS_SLOTS,
  parseLocalTime,
  toStalwartWorkingHours,
  validateWorkingHours,
} from "./working-hours";

describe("parseLocalTime", () => {
  it("liest HH:MM einschließlich 24:00", () => {
    expect(parseLocalTime("00:00")).toBe(0);
    expect(parseLocalTime("08:30")).toBe(510);
    expect(parseLocalTime("24:00")).toBe(1440);
  });

  it("lehnt ungültige Zeiten ab", () => {
    expect(parseLocalTime("8:00")).toBeNull();
    expect(parseLocalTime("08:00:00")).toBeNull();
    expect(parseLocalTime("24:01")).toBeNull();
    expect(parseLocalTime("25:00")).toBeNull();
    expect(parseLocalTime("12:60")).toBeNull();
  });
});

describe("fromStalwartWorkingHours und toStalwartWorkingHours", () => {
  it("wandelt Stalwarts List-Objekt sortiert um und wieder zurück", () => {
    const raw = {
      enable: true,
      timeZone: "Europe/Berlin",
      slots: {
        "1": { days: { friday: true }, start: "08:00", end: "13:00" },
        "0": {
          days: { thursday: true, monday: true, wednesday: true, tuesday: true },
          start: "08:30",
          end: "16:30",
        },
      },
    };
    const form = fromStalwartWorkingHours(raw, "UTC");
    expect(form).toEqual({
      enable: true,
      timeZone: "Europe/Berlin",
      slots: [
        { days: ["monday", "tuesday", "wednesday", "thursday"], start: "08:30", end: "16:30" },
        { days: ["friday"], start: "08:00", end: "13:00" },
      ],
    });
    expect(toStalwartWorkingHours(form)).toEqual({
      enable: true,
      timeZone: "Europe/Berlin",
      slots: {
        "0": {
          days: { monday: true, tuesday: true, wednesday: true, thursday: true },
          start: "08:30",
          end: "16:30",
        },
        "1": { days: { friday: true }, start: "08:00", end: "13:00" },
      },
    });
  });

  it("nutzt die Ausweich-Zeitzone, wenn Stalwart keine liefert", () => {
    const form = fromStalwartWorkingHours(undefined, "Europe/Berlin");
    expect(form).toEqual({ enable: false, timeZone: "Europe/Berlin", slots: [] });
  });
});

describe("validateWorkingHours", () => {
  it("erlaubt ausgeschaltete Arbeitszeiten auch ohne Blöcke", () => {
    expect(validateWorkingHours({ enable: false, timeZone: "Europe/Berlin", slots: [] })).toBe(
      "ok",
    );
  });

  it("prüft Blöcke, Tage und Zeitspanne bei eingeschalteten Arbeitszeiten", () => {
    expect(validateWorkingHours({ enable: true, timeZone: "Europe/Berlin", slots: [] })).toBe(
      "no-slots",
    );
    expect(
      validateWorkingHours({
        enable: true,
        timeZone: "Europe/Berlin",
        slots: [{ days: [], start: "08:00", end: "16:00" }],
      }),
    ).toBe("no-days");
    expect(
      validateWorkingHours({
        enable: true,
        timeZone: "Europe/Berlin",
        slots: [{ days: ["monday"], start: "16:00", end: "08:00" }],
      }),
    ).toBe("invalid-range");
    expect(
      validateWorkingHours({
        enable: true,
        timeZone: "Europe/Berlin",
        slots: Array.from({ length: MAX_WORKING_HOURS_SLOTS + 1 }, () => ({
          days: ["monday"],
          start: "08:00",
          end: "12:00",
        })),
      }),
    ).toBe("too-many-slots");
    expect(
      validateWorkingHours({
        enable: true,
        timeZone: "Europe/Berlin",
        slots: defaultWorkingHoursSlots(),
      }),
    ).toBe("ok");
  });
});

describe("calendarWorkHours", () => {
  it("leitet frühesten Beginn und spätestes Ende über alle Blöcke ab", () => {
    expect(
      calendarWorkHours({
        enable: true,
        timeZone: "Europe/Berlin",
        slots: [
          { days: ["monday", "tuesday"], start: "08:30", end: "12:00" },
          { days: ["monday", "tuesday"], start: "13:00", end: "16:15" },
        ],
      }),
    ).toEqual({ startHour: 8, endHour: 17 });
  });

  it("fällt auf den Standard zurück, wenn Arbeitszeiten aus oder leer sind", () => {
    expect(calendarWorkHours(undefined)).toEqual(DEFAULT_WORK_HOURS);
    expect(
      calendarWorkHours({
        enable: false,
        timeZone: "Europe/Berlin",
        slots: defaultWorkingHoursSlots(),
      }),
    ).toEqual(DEFAULT_WORK_HOURS);
  });
});
