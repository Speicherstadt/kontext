/**
 * Stundenbereich des Kalenders: Tag und Woche beginnen hier und hinterlegen die Stunden davor und
 * danach grau. Der Standard entspricht dem Arbeitstag der Terminplanung (availability.ts).
 */
import { WORKDAY } from "./availability";
import { weekDays } from "./jscalendar";

export type WorkHours = { startHour: number; endHour: number };

export const DEFAULT_WORK_HOURS: WorkHours = {
  startHour: WORKDAY.startHour,
  endHour: WORKDAY.endHour,
};

/** Die Teile eines Tages außerhalb der Arbeitszeit, in Minuten ab Mitternacht. */
export const offHours = ({ startHour, endHour }: WorkHours): { top: number; bottom: number }[] =>
  [
    { top: 0, bottom: startHour * 60 },
    { top: endHour * 60, bottom: 24 * 60 },
  ].filter((part) => part.bottom > part.top);

const isWorkday = (day: string): boolean =>
  WORKDAY.weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());

/** Montag bis Freitag der Woche rund um einen Tag: dieselben Arbeitstage wie bei der Planung. */
export const workWeek = (day: string): string[] => weekDays(day).filter(isWorkday);
