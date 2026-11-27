/**
 * Arbeitszeiten des Kontos aus Stalwarts `x:CalendarSettings.workingHours` (src/jmap/calendar-settings.ts).
 * Der Stundenbereich des Kalenders (`useWorkHours`) wird direkt daraus abgeleitet; ohne Rechte
 * oder ausgeschaltete Arbeitszeiten gilt `DEFAULT_WORK_HOURS`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { getCalendarSettings, updateWorkingHours } from "@/jmap/calendar-settings";
import { DEFAULT_WORK_HOURS, type WorkHours } from "@/lib/work-hours";
import {
  calendarWorkHours,
  fromStalwartWorkingHours,
  toStalwartWorkingHours,
  type WorkingHoursForm,
} from "@/lib/working-hours";

export const CALENDAR_SETTINGS_KEY = ["settings", "calendar-working-hours"] as const;

export const localTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";

export const useCalendarSettings = () => {
  const client = useClient();
  return useQuery({
    queryKey: CALENDAR_SETTINGS_KEY,
    queryFn: () => getCalendarSettings(client),
    retry: false,
  });
};

export const useSaveWorkingHours = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: WorkingHoursForm) =>
      updateWorkingHours(client, toStalwartWorkingHours(form)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CALENDAR_SETTINGS_KEY }),
  });
};

/** Stundenbereich für Tag und Woche im Kalender, abgeleitet aus den gespeicherten Arbeitszeiten. */
export const useWorkHours = (): WorkHours => {
  const { data } = useCalendarSettings();
  if (!data || data.status !== "ok") return DEFAULT_WORK_HOURS;
  return calendarWorkHours(fromStalwartWorkingHours(data.workingHours, localTimeZone()));
};
