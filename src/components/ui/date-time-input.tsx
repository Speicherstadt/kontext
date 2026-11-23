/**
 * A day and a time, where a native field would be `datetime-local`: a `DateInput` and a
 * `TimeInput` side by side in a group (fieldset) named by `aria-label` or `aria-labelledby`. The value is
 * the native field's "2026-12-18T14:30", "" while day or time is missing.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { joinDateTime, splitDateTime } from "@/lib/date-field";
import { m } from "@/paraglide/messages";
import { DateInput } from "./date-input";
import { TimeInput } from "./time-input";

export const DateTimeInput = ({
  value,
  onChange,
  min,
  className,
  ...group
}: {
  value: string;
  onChange: (value: string) => void;
  /** The first day allowed, "2026-12-18" (the time is up to the caller to check). */
  min?: string;
  className?: string;
} & ({ "aria-label": string } | { "aria-labelledby": string })) => {
  // Day and time as typed: one alone is no value yet, but it stays in its field.
  const [parts, setParts] = useState(() => splitDateTime(value));
  if (value && value !== joinDateTime(parts)) setParts(splitDateTime(value));
  const change = (next: typeof parts) => {
    setParts(next);
    const joined = joinDateTime(next);
    if (joined !== value) onChange(joined);
  };
  return (
    <fieldset {...group} className={cn("m-0 flex min-w-0 gap-2 border-0 p-0", className)}>
      <DateInput
        aria-label={m.field_date()}
        value={parts.date}
        min={min}
        onChange={(date) => change({ ...parts, date })}
      />
      <TimeInput
        aria-label={m.field_time()}
        value={parts.time}
        onChange={(time) => change({ ...parts, time })}
        className="w-32 shrink-0"
      />
    </fieldset>
  );
};
