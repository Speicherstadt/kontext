/**
 * Dates and times as the app's own fields show and read them: the value stays what a native
 * field held ("2026-12-18", "14:30", "2026-12-18T14:30"), the text follows the language
 * ("18.12.2026", "18/12/2026"). Pure: the locale and today are passed in.
 */
import { addDays, weekStart } from "./jscalendar";

const pad = (n: number): string => String(n).padStart(2, "0");

const utc = (key: string): Date => new Date(`${key}T12:00:00Z`);

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** "2026-12-18" if the day exists, else null. */
const dateKeyOf = (year: number, month: number, day: number): string | null =>
  year >= 1000 &&
  year <= 9999 &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysInMonth(year, month)
    ? `${year}-${pad(month)}-${pad(day)}`
    : null;

type Part = "day" | "month" | "year";

/** In which order the language writes day, month and year: d.m.y in German and British English. */
export const dateOrder = (locale: string): Part[] =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric", year: "numeric" })
    .formatToParts(new Date(Date.UTC(2024, 0, 2)))
    .map((part) => part.type)
    .filter((type): type is Part => type === "day" || type === "month" || type === "year");

/** "18.12.2026" (de), "18/12/2026" (en-GB); "" for no day. */
export const formatDate = (key: string, locale: string): string =>
  key
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(utc(key))
    : "";

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * The day typed into a date field, or null if it is none (yet). `complete` asks for all three
 * parts with a four-digit year, as while typing: "1.12.20" is not 1 December 2020 before the
 * year is done. Otherwise, as when leaving the field, the year may be left out (this year) or
 * short (20xx), and the month too (this month). The ISO form "2026-12-18" is always read.
 */
export const parseDate = (
  text: string,
  { locale, today, complete }: { locale: string; today: string; complete: boolean },
): string | null => {
  const trimmed = text.trim();
  const iso = ISO_DATE.exec(trimmed);
  if (iso) return dateKeyOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numbers = trimmed.split(/\D+/).filter(Boolean);
  if (numbers.length === 0 || numbers.length > 3) return null;
  if (complete && (numbers.length < 3 || !/^\d{4}$/.test(numbers.at(-1)!))) return null;
  const order = dateOrder(locale).filter((part) => numbers.length === 3 || part !== "year");
  const given = Object.fromEntries(order.map((part, index) => [part, numbers[index]]));
  const [thisYear, thisMonth] = today.split("-").map(Number);
  const year = given.year
    ? Number(given.year) + (given.year.length <= 2 ? 2000 : 0)
    : (thisYear ?? 0);
  const month = given.month ? Number(given.month) : (thisMonth ?? 0);
  return dateKeyOf(year, month, Number(given.day));
};

/** "14:30" in the language's clock; "" for no time. */
export const formatTime = (time: string, locale: string): string => {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 1, hours, minutes)));
};

const TYPED_TIME = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?$/i;
const COMPLETE_TIME = /^\d{1,2}[:.]\d{2}(\s*[ap]\.?\s*m\.?)?$/i;

/** "14:30" if it is a time of day, else null. */
const timeOf = (hours: number, minutes: number, half?: string): string | null => {
  if (minutes > 59) return null;
  if (half) {
    if (hours < 1 || hours > 12) return null;
    const pm = half.toLowerCase() === "p";
    return `${pad((hours % 12) + (pm ? 12 : 0))}:${pad(minutes)}`;
  }
  return hours <= 23 ? `${pad(hours)}:${pad(minutes)}` : null;
};

/**
 * The time typed into a time field, or null. `complete` asks for hours and two-digit minutes
 * ("14:30", "9.05", "2:30 pm"); otherwise also "14" (14:00), "930" and "1430".
 */
export const parseTime = (text: string, { complete }: { complete: boolean }): string | null => {
  const trimmed = text.trim();
  if (complete && !COMPLETE_TIME.test(trimmed)) return null;
  const digits = /^(\d{3,4})$/.exec(trimmed);
  if (digits) {
    const value = digits[1]!;
    return timeOf(Number(value.slice(0, -2)), Number(value.slice(-2)));
  }
  const match = TYPED_TIME.exec(trimmed);
  return match ? timeOf(Number(match[1]), Number(match[2] ?? 0), match[3]) : null;
};

/** The times of a day in steps of `minutes`: "00:00", "00:15", … */
export const timeSteps = (minutes = 15): string[] =>
  Array.from(
    { length: (24 * 60) / minutes },
    (_, index) => `${pad(Math.floor((index * minutes) / 60))}:${pad((index * minutes) % 60)}`,
  );

/** The step at or just before a time, to start the list there; the first for none. */
export const stepIndex = (steps: string[], time: string): number => {
  if (!time) return 0;
  const after = steps.findIndex((step) => step > time);
  return after === -1 ? steps.length - 1 : Math.max(0, after - 1);
};

/** The 42 days of the six weeks that show a month, from a Monday. */
export const monthDays = (month: string): string[] => {
  const first = weekStart(`${month.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
};

/** The same day `months` away, or the month's last if it is shorter (31 Jan → 28 Feb). */
export const shiftMonths = (key: string, months: number): string => {
  const [year, month, day] = key.split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1);
  return `${target.toISOString().slice(0, 8)}${pad(Math.min(day!, lastDay))}`;
};

/**
 * Where a key moves in the month grid, as the ARIA date picker has it: a day sideways, a week up
 * or down, the week's first or last day, the same day a month (Shift: a year) before or after.
 */
export const dayAfterKey = (day: string, key: string, shift = false): string | null => {
  switch (key) {
    case "ArrowLeft":
      return addDays(day, -1);
    case "ArrowRight":
      return addDays(day, 1);
    case "ArrowUp":
      return addDays(day, -7);
    case "ArrowDown":
      return addDays(day, 7);
    case "Home":
      return weekStart(day);
    case "End":
      return addDays(weekStart(day), 6);
    case "PageUp":
      return shiftMonths(day, shift ? -12 : -1);
    case "PageDown":
      return shiftMonths(day, shift ? 12 : 1);
    default:
      return null;
  }
};

/** Whether a day lies within the allowed range ("" or undefined: no limit). */
export const withinRange = (day: string, min?: string, max?: string): boolean =>
  (!min || day >= min) && (!max || day <= max);

/** "2026-12-18T14:30" into its day and time, each "" when missing. */
export const splitDateTime = (value: string): { date: string; time: string } => {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
};

/** Day and time back into "2026-12-18T14:30"; "" until both are there. */
export const joinDateTime = ({ date, time }: { date: string; time: string }): string =>
  date && time ? `${date}T${time}` : "";
