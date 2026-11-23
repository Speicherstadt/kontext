/**
 * A time of day, in the app's look instead of the browser's: a text field to type any time into
 * ("14:30", "1430", "9"), and a list of the quarter hours below it while it has the focus, as the
 * ARIA combobox has it: ↓ and ↑ go through the list (Page Down and Page Up by an hour), Enter
 * takes the time, Escape closes the list; the focus stays in the field. The value is the native
 * field's "14:30" ("" for none). Touch devices keep the system's picker (`useNativePicker`).
 */
import * as Popover from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatTime, parseTime, stepIndex, timeSteps } from "@/lib/date-field";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { FieldPopoverContent, useNativePicker } from "./field-popover";
import { Input } from "./input";
import { useTypedValue } from "./typed-value";

export type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  "aria-label"?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

const STEPS = timeSteps(15);

/** How far a key moves in the list, or null for a key the list leaves alone. */
const STEP_KEYS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 };

const clampIndex = (index: number) => Math.min(STEPS.length - 1, Math.max(0, index));

/** The quarter hours; the keys that move through them are the field's (aria-activedescendant). */
const TimeList = ({
  id,
  value,
  active,
  optionId,
  onTake,
}: {
  id: string;
  value: string;
  active: number;
  optionId: (index: number) => string;
  onTake: (index: number) => void;
}) => {
  const list = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  // The highlighted time in view: in the middle when the list opens, at the edge while the keys
  // move it. By hand, not scrollIntoView: that would also scroll the page while the popover is
  // still being placed.
  useEffect(() => {
    const box = list.current;
    const option = box?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!box || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (!opened.current) box.scrollTop = top - (box.clientHeight - option.offsetHeight) / 2;
    else if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
    opened.current = true;
  }, [active]);
  return (
    <div
      ref={list}
      id={id}
      role="listbox"
      aria-label={m.field_time_list()}
      className="relative max-h-60 overflow-y-auto p-1"
    >
      {STEPS.map((step, index) => (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the keys are the field's, see above
        <div
          key={step}
          id={optionId(index)}
          data-index={index}
          role="option"
          tabIndex={-1}
          aria-selected={step === value}
          // Keeps the focus in the field.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onTake(index)}
          className={cn(
            "flex h-8 cursor-pointer items-center rounded-lg px-2.5 tabular-nums",
            index === active && "bg-hover",
            step === value && "font-semibold",
          )}
        >
          {formatTime(step, LOCALE)}
        </div>
      ))}
    </div>
  );
};

const TimeField = ({ value, onChange, className, disabled, ...input }: TimeInputProps) => {
  const field = useTypedValue(value, onChange, {
    format: (time) => formatTime(time, LOCALE),
    complete: (text) => parseTime(text, { complete: true }),
    loose: (text) => parseTime(text, { complete: false }),
  });
  const [open, setOpen] = useState(false);
  // The highlighted time in the list (aria-activedescendant), from the field's time.
  const [active, setActive] = useState(() => stepIndex(STEPS, value));
  const anchor = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-${index}`;

  const show = () => {
    setActive(stepIndex(STEPS, value));
    setOpen(true);
  };
  const take = (index: number) => {
    field.choose(STEPS[index]!);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = STEP_KEYS[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (open) setActive(clampIndex(active + step));
      else show();
    } else if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      if (open) {
        event.preventDefault();
        take(active);
      } else if (field.typing) {
        // The typed time counts before Enter sends the form, which would still see the old one.
        event.preventDefault();
        field.settle();
      }
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={anchor} className={cn("relative h-10 w-full", className)}>
          <Input
            {...input}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? optionId(active) : undefined}
            aria-autocomplete="none"
            autoComplete="off"
            placeholder={m.field_time_placeholder()}
            value={field.text}
            disabled={disabled}
            onChange={(event) => {
              field.type(event.target.value);
              const typed = parseTime(event.target.value, { complete: false });
              if (typed) setActive(stepIndex(STEPS, typed));
            }}
            onClick={() => !open && show()}
            onBlur={field.settle}
            onKeyDown={onKeyDown}
            className="h-full pr-9 tabular-nums"
          />
          <Clock
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
          />
        </div>
      </Popover.Anchor>
      <FieldPopoverContent
        // The focus stays in the field; the list follows its keys.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // A click into the field is no click outside.
        onInteractOutside={(event) => {
          if (anchor.current?.contains(event.target as Node)) event.preventDefault();
        }}
        className="w-[var(--radix-popover-trigger-width)] min-w-28"
      >
        <TimeList id={listId} value={value} active={active} optionId={optionId} onTake={take} />
      </FieldPopoverContent>
    </Popover.Root>
  );
};

export const TimeInput = (props: TimeInputProps) => {
  const native = useNativePicker();
  if (!native) return <TimeField {...props} />;
  const { value, onChange, className, ...input } = props;
  return (
    <Input
      type="time"
      {...input}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
};
