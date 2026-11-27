/**
 * Arbeitszeiten des Kontos (`x:CalendarSettings.workingHours`): Tage, mehrere Zeitblöcke pro Tag
 * und Zeitzone. Kollegen sehen die Zeit außerhalb in der Verfügbarkeit, und der Kalender leitet
 * seinen sichtbaren Stundenbereich daraus ab.
 */
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { LOCALE } from "@/lib/locale";
import {
  defaultWorkingHoursSlots,
  fromStalwartWorkingHours,
  MAX_WORKING_HOURS_SLOTS,
  validateWorkingHours,
  WEEKDAYS,
  type Weekday,
  type WorkingHoursForm,
  type WorkingHoursSlot,
  type WorkingHoursValidation,
} from "@/lib/working-hours";
import { m } from "@/paraglide/messages";
import {
  localTimeZone,
  useCalendarSettings,
  useSaveWorkingHours,
} from "../calendar/work-hours-setting";

/** Feste Woche (Mo 2. bis So 8. November 2026) zum Formatieren der Wochentagsnamen in `LOCALE`. */
const WEEKDAY_DATES: Record<Weekday, string> = {
  monday: "2026-11-02",
  tuesday: "2026-11-03",
  wednesday: "2026-11-04",
  thursday: "2026-11-05",
  friday: "2026-11-06",
  saturday: "2026-11-07",
  sunday: "2026-11-08",
};

const shortDay = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat(LOCALE, { weekday: "long", timeZone: "UTC" });

const weekdayLabel = (day: Weekday, format: Intl.DateTimeFormat): string =>
  format.format(new Date(`${WEEKDAY_DATES[day]}T12:00:00Z`));

/** Halbstündliche Uhrzeiten von 00:00 bis 24:00 (Stalwart erlaubt 00:00–24:00). */
const BASE_TIMES: string[] = Array.from({ length: 49 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = (index % 2) * 30;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

const timeOptions = (current: string) => {
  const values = BASE_TIMES.includes(current) ? BASE_TIMES : [...BASE_TIMES, current].sort();
  return values.map((value) => ({ value, label: value }));
};

const FALLBACK_ZONES = ["Europe/Berlin", "Europe/Vienna", "Europe/Zurich", "UTC"];

const timeZoneOptions = (current: string) => {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : FALLBACK_ZONES;
  const values = supported.includes(current) ? supported : [current, ...supported];
  return values.map((zone) => ({ value: zone, label: zone }));
};

const validationMessage = (state: WorkingHoursValidation): string | null => {
  if (state === "no-slots") return m.settings_working_hours_error_no_slots();
  if (state === "too-many-slots")
    return m.settings_working_hours_error_too_many({ max: MAX_WORKING_HOURS_SLOTS });
  if (state === "no-days") return m.settings_working_hours_error_no_days();
  if (state === "invalid-range") return m.settings_working_hours_error_range();
  return null;
};

const WorkingHoursSlotRow = ({
  slot,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  slot: WorkingHoursSlot;
  index: number;
  canRemove: boolean;
  onChange: (next: WorkingHoursSlot) => void;
  onRemove: () => void;
}) => {
  const fromId = useId();
  const toId = useId();
  const toggleDay = (day: Weekday) => {
    const has = slot.days.includes(day);
    const days = has
      ? slot.days.filter((item) => item !== day)
      : WEEKDAYS.filter((item) => item === day || slot.days.includes(item));
    onChange({ ...slot, days });
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="m-0 flex flex-wrap gap-1 border-0 p-0">
          <legend className="sr-only">{m.settings_working_hours_days({ index: index + 1 })}</legend>
          {WEEKDAYS.map((day) => {
            const active = slot.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                aria-label={weekdayLabel(day, longDay)}
                onClick={() => toggleDay(day)}
                className={cn(
                  "min-w-9 cursor-pointer rounded-md border px-2 py-1 text-[13px] transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-fg font-medium"
                    : "border-border bg-bg text-fg hover:bg-subtle",
                )}
              >
                {weekdayLabel(day, shortDay)}
              </button>
            );
          })}
        </fieldset>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            aria-label={m.settings_working_hours_remove_slot()}
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <label htmlFor={fromId}>{m.settings_work_hours_from()}</label>
        <Select
          id={fromId}
          value={slot.start}
          onValueChange={(start) => onChange({ ...slot, start })}
          options={timeOptions(slot.start)}
          className="w-auto"
        />
        <label htmlFor={toId}>{m.settings_work_hours_to()}</label>
        <Select
          id={toId}
          value={slot.end}
          onValueChange={(end) => onChange({ ...slot, end })}
          options={timeOptions(slot.end)}
          className="w-auto"
        />
      </div>
    </div>
  );
};

export const WorkHoursCard = () => {
  const { data, isPending, isError } = useCalendarSettings();
  const save = useSaveWorkingHours();
  const toast = useToast();
  const zoneId = useId();
  const fallbackZone = useMemo(() => localTimeZone(), []);
  const [form, setForm] = useState<WorkingHoursForm>(() =>
    fromStalwartWorkingHours(undefined, fallbackZone),
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.status === "ok" && !dirty) {
      setForm(fromStalwartWorkingHours(data.workingHours, fallbackZone));
    }
  }, [data, dirty, fallbackZone]);

  if (data?.status === "forbidden") {
    return (
      <SettingsCard title={m.settings_work_hours()} description={m.settings_work_hours_hint()}>
        <p className="m-0 text-[13px] text-muted">{m.settings_working_hours_forbidden()}</p>
      </SettingsCard>
    );
  }

  const update = (next: WorkingHoursForm) => {
    setForm(next);
    setDirty(true);
  };

  const toggleEnable = (enable: boolean) => {
    const slots = enable && form.slots.length === 0 ? defaultWorkingHoursSlots() : form.slots;
    update({ ...form, enable, slots });
  };

  const validation = validateWorkingHours(form);
  const problem = validationMessage(validation);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (validation !== "ok") return;
    save.mutate(form, {
      onSuccess: () => {
        setDirty(false);
        toast.show(m.settings_working_hours_saved());
      },
      onError: (error: Error) => toast.show(m.common_error({ message: error.message }), "error"),
    });
  };

  return (
    <SettingsCard title={m.settings_work_hours()} description={m.settings_work_hours_hint()}>
      {isError ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {m.settings_working_hours_load_error()}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Switch checked={form.enable} onChange={toggleEnable} disabled={isPending}>
            {m.settings_working_hours_enable()}
          </Switch>
          {form.enable ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[14px]">
                <label htmlFor={zoneId}>{m.settings_working_hours_timezone()}</label>
                <Select
                  id={zoneId}
                  value={form.timeZone}
                  onValueChange={(timeZone) => update({ ...form, timeZone })}
                  options={timeZoneOptions(form.timeZone)}
                  className="w-auto max-w-full"
                />
              </div>
              <div className="flex flex-col gap-2">
                {form.slots.map((slot, index) => (
                  <WorkingHoursSlotRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: slots are edited in place by index
                    key={index}
                    slot={slot}
                    index={index}
                    canRemove={form.slots.length > 1}
                    onChange={(next) =>
                      update({
                        ...form,
                        slots: form.slots.map((item, i) => (i === index ? next : item)),
                      })
                    }
                    onRemove={() =>
                      update({
                        ...form,
                        slots: form.slots.filter((_, i) => i !== index),
                      })
                    }
                  />
                ))}
              </div>
              {form.slots.length < MAX_WORKING_HOURS_SLOTS ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="self-start"
                  onClick={() =>
                    update({
                      ...form,
                      slots: [...form.slots, { days: [], start: "13:00", end: "17:00" }],
                    })
                  }
                >
                  <Plus size={16} aria-hidden="true" />
                  {m.settings_working_hours_add_slot()}
                </Button>
              ) : null}
            </>
          ) : null}
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="self-start"
            disabled={isPending || save.isPending || !dirty || validation !== "ok"}
          >
            {m.settings_working_hours_save()}
          </Button>
        </form>
      )}
    </SettingsCard>
  );
};
