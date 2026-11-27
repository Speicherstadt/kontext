/**
 * Arbeitszeiten eines Kontos: Umwandlung zwischen Stalwarts `x:CalendarSettings.workingHours`
 * (Stalwart v1.2.1: `WorkingHours` und `WorkingHoursSlot` in `crates/registry/src/schema/structs.rs`,
 * `Weekday` in `crates/registry/src/schema/enums_impl.rs`, `LocalTime` in
 * `crates/registry/src/types/localtime.rs`, `List` in `crates/registry/src/types/list.rs`) und der
 * Form für Einstellungen und Kalenderansicht.
 */
import { DEFAULT_WORK_HOURS, type WorkHours } from "./work-hours";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Höchstzahl an Blöcken in Stalwart (`MAX_WORKING_HOURS_SLOTS`, `working_hours/mod.rs`). */
export const MAX_WORKING_HOURS_SLOTS = 14;

/** Ein Zeitblock im JMAP-Format von Stalwart (`start`/`end` als `"HH:MM"`, bis `"24:00"`). */
export type StalwartWorkingHoursSlot = {
  days: Partial<Record<Weekday, boolean>>;
  start: string;
  end: string;
};

/** `workingHours` auf `x:CalendarSettings` (`slots` ist ein `List<T>`-Objekt mit `"0"`, `"1"`, …). */
export type StalwartWorkingHours = {
  enable: boolean;
  timeZone: string | null;
  slots: Record<string, StalwartWorkingHoursSlot>;
};

export type WorkingHoursSlot = {
  days: Weekday[];
  start: string;
  end: string;
};

export type WorkingHoursForm = {
  enable: boolean;
  timeZone: string;
  slots: WorkingHoursSlot[];
};

export type WorkingHoursValidation =
  | "ok"
  | "no-slots"
  | "too-many-slots"
  | "no-days"
  | "invalid-range";

/** Parst `"HH:MM"` (00:00 bis 24:00) in Minuten seit Mitternacht; sonst `null`. */
export const parseLocalTime = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) return 24 * 60;
  if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
  return null;
};

/** Standard-Arbeitszeit beim ersten Einschalten: Montag bis Freitag, 08:00 bis 17:00. */
export const defaultWorkingHoursSlots = (): WorkingHoursSlot[] => [
  {
    days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    start: "08:00",
    end: "17:00",
  },
];

/** Wandelt Stalwarts `workingHours` in die Form fürs Formular um. */
export const fromStalwartWorkingHours = (
  raw: StalwartWorkingHours | undefined,
  fallbackTimeZone: string,
): WorkingHoursForm => {
  const entries = Object.entries(raw?.slots ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  const slots: WorkingHoursSlot[] = entries.map(([, slot]) => ({
    days: WEEKDAYS.filter((day) => Boolean(slot.days?.[day])),
    start: slot.start || "08:00",
    end: slot.end || "17:00",
  }));
  return {
    enable: Boolean(raw?.enable),
    timeZone: raw?.timeZone || fallbackTimeZone,
    slots,
  };
};

const isValidSlot = (slot: WorkingHoursSlot): boolean => {
  if (slot.days.length === 0) return false;
  const start = parseLocalTime(slot.start);
  const end = parseLocalTime(slot.end);
  return start !== null && end !== null && start < end;
};

/**
 * Wandelt die Formular-Daten zurück in Stalwarts `workingHours`-Objekt.
 * Beim Ausschalten werden unvollständige Blöcke weggelassen, da Stalwart `WorkingSchedule::parse`
 * auch bei `enable: false` ausführt (`crates/jmap/src/registry/mapping/calendar_settings.rs`).
 */
export const toStalwartWorkingHours = (form: WorkingHoursForm): StalwartWorkingHours => {
  const source = form.enable
    ? form.slots
    : form.slots.filter(isValidSlot).slice(0, MAX_WORKING_HOURS_SLOTS);
  const slots: Record<string, StalwartWorkingHoursSlot> = {};
  source.forEach((slot, index) => {
    const days: Partial<Record<Weekday, boolean>> = {};
    for (const day of WEEKDAYS) {
      if (slot.days.includes(day)) days[day] = true;
    }
    slots[String(index)] = { days, start: slot.start, end: slot.end };
  });
  return {
    enable: form.enable,
    timeZone: form.timeZone || null,
    slots,
  };
};

/** Prüft die Formular-Daten nach denselben Regeln wie `WorkingSchedule::parse` in Stalwart. */
export const validateWorkingHours = (form: WorkingHoursForm): WorkingHoursValidation => {
  if (!form.enable) return "ok";
  if (form.slots.length === 0) return "no-slots";
  if (form.slots.length > MAX_WORKING_HOURS_SLOTS) return "too-many-slots";
  for (const slot of form.slots) {
    if (slot.days.length === 0) return "no-days";
    const start = parseLocalTime(slot.start);
    const end = parseLocalTime(slot.end);
    if (start === null || end === null || start >= end) return "invalid-range";
  }
  return "ok";
};

/**
 * Leitet den sichtbaren Stundenbereich des Kalenders (`WorkHours`) aus den Arbeitszeiten ab:
 * frühester Beginn abgerundet, spätestes Ende aufgerundet. Aus oder leer ergibt den Standard.
 */
export const calendarWorkHours = (form: WorkingHoursForm | undefined): WorkHours => {
  if (!form?.enable || form.slots.length === 0) return DEFAULT_WORK_HOURS;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const slot of form.slots) {
    if (slot.days.length === 0) continue;
    const start = parseLocalTime(slot.start);
    const end = parseLocalTime(slot.end);
    if (start === null || end === null || start >= end) continue;
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return DEFAULT_WORK_HOURS;
  const startHour = Math.max(0, Math.floor(earliest / 60));
  const endHour = Math.min(24, Math.ceil(latest / 60));
  return startHour < endHour ? { startHour, endHour } : DEFAULT_WORK_HOURS;
};
