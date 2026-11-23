/** Per device: the working hours the calendar's day and week start at and shade around. */
import { useId } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Select } from "@/components/ui/select";
import { timeLabel } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { setWorkHours, useWorkHours } from "../calendar/work-hours-setting";

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

const hourOptions = (hours: number[]) =>
  hours.map((hour) => ({ value: String(hour), label: timeLabel(hour * 60) }));

export const WorkHoursCard = () => {
  const hours = useWorkHours();
  const fromId = useId();
  const toId = useId();
  return (
    <SettingsCard title={m.settings_work_hours()} description={m.settings_work_hours_hint()}>
      <div className="flex flex-wrap items-center gap-3 text-[14px]">
        <label htmlFor={fromId}>{m.settings_work_hours_from()}</label>
        <Select
          id={fromId}
          value={String(hours.startHour)}
          onValueChange={(value) => setWorkHours({ ...hours, startHour: Number(value) })}
          options={hourOptions(HOURS.filter((hour) => hour < hours.endHour))}
          className="w-auto"
        />
        <label htmlFor={toId}>{m.settings_work_hours_to()}</label>
        <Select
          id={toId}
          value={String(hours.endHour)}
          onValueChange={(value) => setWorkHours({ ...hours, endHour: Number(value) })}
          options={hourOptions(HOURS.filter((hour) => hour > hours.startHour))}
          className="w-auto"
        />
      </div>
    </SettingsCard>
  );
};
