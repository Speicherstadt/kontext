/**
 * A day, in the app's look instead of the browser's: a text field in the app's language
 * ("18.12.2026") to type into, and a month to pick from (the button, or Alt+↓ / ↓ in the field).
 * The value is the native field's "2026-12-18" ("" for none). Touch devices keep the system's
 * picker (`useNativePicker`).
 */
import * as Popover from "@radix-ui/react-popover";
import { Calendar } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, parseDate, withinRange } from "@/lib/date-field";
import { dateKey } from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { FieldPopoverContent, useNativePicker } from "./field-popover";
import { Input } from "./input";
import { MonthGrid } from "./month-grid";
import { useTypedValue } from "./typed-value";

export type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  "aria-label"?: string;
  disabled?: boolean;
  required?: boolean;
  /** The first and last day allowed, "2026-12-18"; the form refuses others, as with `min`. */
  min?: string;
  max?: string;
  className?: string;
};

/** What the form says about a day outside min and max; "" when it is fine. */
const rangeProblem = (value: string, min?: string, max?: string): string => {
  if (!value || withinRange(value, min, max)) return "";
  return min && value < min
    ? m.field_date_min({ date: formatDate(min, LOCALE) })
    : m.field_date_max({ date: formatDate(max ?? "", LOCALE) });
};

const DateField = ({
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  ...input
}: DateInputProps) => {
  const today = dateKey(new Date());
  const field = useTypedValue(value, onChange, {
    format: (day) => formatDate(day, LOCALE),
    complete: (text) => parseDate(text, { locale: LOCALE, today, complete: true }),
    loose: (text) => parseDate(text, { locale: LOCALE, today, complete: false }),
  });
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Back into the field after a pick or Escape; not after a click elsewhere.
  const backToField = useRef(false);
  const problem = rangeProblem(value, min, max);
  useEffect(() => inputRef.current?.setCustomValidity(problem), [problem]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      field.settle();
      setOpen(true);
    } else if (event.key === "Enter" && field.typing && !event.ctrlKey && !event.metaKey) {
      // The typed day counts before Enter sends the form, which would still see the old one.
      event.preventDefault();
      field.settle();
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className={cn("relative h-10 w-full min-w-[9.5rem]", className)}>
          <Input
            ref={inputRef}
            {...input}
            role="combobox"
            aria-haspopup="dialog"
            aria-expanded={open}
            autoComplete="off"
            placeholder={m.field_date_placeholder()}
            value={field.text}
            disabled={disabled}
            onChange={(event) => field.type(event.target.value)}
            onBlur={field.settle}
            onKeyDown={onKeyDown}
            className="h-full pr-9 tabular-nums"
          />
          <Popover.Trigger
            disabled={disabled}
            aria-label={m.field_date_open()}
            title={m.field_date_open()}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted hover:text-fg disabled:opacity-50"
          >
            <Calendar size={16} />
          </Popover.Trigger>
        </div>
      </Popover.Anchor>
      <FieldPopoverContent
        aria-label={m.field_date_dialog()}
        // On the chosen day (or today), not the first button. Here rather than in the month's
        // own effect: only now has the popover taken the focus over from a dialog around it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement)
            event.currentTarget.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus();
        }}
        onEscapeKeyDown={() => {
          backToField.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (backToField.current) inputRef.current?.focus();
          backToField.current = false;
        }}
      >
        <MonthGrid
          selected={value}
          today={today}
          min={min}
          max={max}
          onPick={(day) => {
            field.choose(day);
            backToField.current = true;
            setOpen(false);
          }}
        />
      </FieldPopoverContent>
    </Popover.Root>
  );
};

export const DateInput = (props: DateInputProps) => {
  const native = useNativePicker();
  if (!native) return <DateField {...props} />;
  const { value, onChange, className, ...input } = props;
  return (
    <Input
      type="date"
      {...input}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
};
