/**
 * A month to pick a day from, as the ARIA date picker dialog has it: a grid with one stop for Tab,
 * the arrow keys from day to day (up and down by a week), Home and End to the week's ends, Page Up
 * and Page Down by a month (with Shift by a year), Enter or Space picks. Weeks start on Monday;
 * today is marked, the chosen day filled.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { dayAfterKey, monthDays, shiftMonths, withinRange } from "@/lib/date-field";
import { weekdayHeads } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";

const utc = (key: string) => new Date(`${key}T12:00:00Z`);
const monthTitle = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayName = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayName = new Intl.DateTimeFormat(LOCALE, { weekday: "long", timeZone: "UTC" });
// 1 January 2024 was a Monday.
const WEEKDAYS = weekdayHeads(LOCALE).map((head, index) => ({
  head,
  name: weekdayName.format(new Date(Date.UTC(2024, 0, 1 + index))),
}));

const weeksOf = (days: string[]): string[][] =>
  Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));

const MonthButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover"
  >
    {children}
  </button>
);

const Day = ({
  day,
  month,
  chosen,
  today,
  focused,
  allowed,
  onPick,
}: {
  day: string;
  month: string;
  chosen: boolean;
  today: boolean;
  focused: boolean;
  allowed: boolean;
  onPick: (day: string) => void;
}) => (
  <button
    type="button"
    data-day={day}
    tabIndex={focused ? 0 : -1}
    aria-label={dayName.format(utc(day))}
    aria-current={today ? "date" : undefined}
    aria-disabled={allowed ? undefined : true}
    onClick={() => allowed && onPick(day)}
    className={cn(
      "flex h-8 w-full items-center justify-center rounded-md font-mono hover:bg-hover",
      // Other months' days as dimmed as WCAG AA's 4.5:1 allows (as in the small month).
      day.slice(0, 7) === month ? "text-fg" : "text-muted dark:text-muted/80",
      today && !chosen && "font-semibold text-accent",
      chosen && "bg-accent-fill font-medium text-white hover:bg-accent-fill",
      !allowed && "cursor-default line-through opacity-50 hover:bg-transparent",
    )}
  >
    {Number(day.slice(8))}
  </button>
);

export const MonthGrid = ({
  selected,
  today,
  min,
  max,
  onPick,
}: {
  /** The chosen day, "" for none. */
  selected: string;
  today: string;
  min?: string;
  max?: string;
  onPick: (day: string) => void;
}) => {
  // The day Tab stops at and the arrows start from: the chosen one, else today.
  const [focused, setFocused] = useState(selected || today);
  const month = focused.slice(0, 7);
  const titleId = useId();
  const grid = useRef<HTMLTableElement>(null);
  // Focus follows the arrows (the popover puts it on the day when it opens).
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focused}"]`)?.focus();
  });
  const go = (day: string, focus: boolean) => {
    moved.current = focus;
    setFocused(day);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const next = dayAfterKey(focused, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    go(next, true);
  };

  return (
    <div className="flex w-[17.5rem] flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <MonthButton
          label={m.field_date_previous_month()}
          onClick={() => go(shiftMonths(focused, -1), false)}
        >
          <ChevronLeft size={16} />
        </MonthButton>
        <span id={titleId} aria-live="polite" className="font-medium capitalize">
          {monthTitle.format(utc(`${month}-01`))}
        </span>
        <MonthButton
          label={m.field_date_next_month()}
          onClick={() => go(shiftMonths(focused, 1), false)}
        >
          <ChevronRight size={16} />
        </MonthButton>
      </div>
      <table
        ref={grid}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA date picker's grid is a table
        role="grid"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="w-full border-collapse text-center text-[13px]"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th
                key={day.name}
                scope="col"
                abbr={day.name}
                className="pb-1 text-[12px] font-normal text-muted"
              >
                {day.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(monthDays(month)).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => (
                // biome-ignore lint/a11y/useAriaPropsSupportedByRole: a cell of a grid is a gridcell
                <td key={day} aria-selected={day === selected} className="p-0.5">
                  <Day
                    day={day}
                    month={month}
                    chosen={day === selected}
                    today={day === today}
                    focused={day === focused}
                    allowed={withinRange(day, min, max)}
                    onPick={onPick}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
