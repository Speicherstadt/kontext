/** An appointment as the agent's tools give it, turned into the app's event form. Pure. */
import { newEventForm } from "@/lib/event-form";

/** "2026-11-03 09:00" or "2026-11-03T09:00" → date and time; a bare day is all day. */
const splitLocal = (value: string): { date: string; time: string | null } => {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) throw new Error(`Kein Datum: ${value} (erwartet YYYY-MM-DD HH:mm)`);
  return { date: match[1]!, time: match[2] ?? null };
};

/** The event form for an agent's appointment, in local time (Europe/Berlin). */
export const appointmentForm = (input: {
  title: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
}) => {
  const start = splitLocal(input.start);
  const allDay = input.allDay ?? start.time === null;
  const form = newEventForm(`${start.date}T${start.time ?? "09:00"}`, input.durationMinutes ?? 60);
  const end = input.end ? splitLocal(input.end) : null;
  const filled = {
    ...form,
    title: input.title.trim(),
    allDay,
    location: input.location ?? "",
    description: input.description ?? "",
    ...(end ? { endDate: end.date, endTime: end.time ?? form.endTime } : {}),
    ...(allDay ? { endDate: end?.date ?? start.date } : {}),
  };
  if (!filled.title) throw new Error("Der Termin braucht einen Titel.");
  const from = allDay ? filled.date : `${filled.date}T${filled.startTime}`;
  const to = allDay ? filled.endDate : `${filled.endDate}T${filled.endTime}`;
  if (to < from) throw new Error("Das Ende liegt vor dem Anfang.");
  return filled;
};
