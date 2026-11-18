import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";

const weekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });

/** Phone: the seven days of the week as buttons above the day view. */
export const DayStrip = ({
  week,
  selected,
  today,
}: {
  week: string[];
  selected: string;
  today: string;
}) => (
  <nav aria-label={m.calendar_week()} className="flex gap-1 border-b border-border px-3 py-2">
    {week.map((day) => (
      <Link
        key={day}
        to="/calendar"
        search={(prev) => ({ ...prev, date: day })}
        aria-current={day === selected ? "date" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-fg no-underline",
          day === selected && "bg-primary text-onprimary",
        )}
      >
        <span className={cn("text-[11px]", day === selected ? "text-onprimary/80" : "text-muted")}>
          {weekdayShort.format(new Date(`${day}T12:00:00Z`)).replace(".", "")}
        </span>
        <span
          className={cn(
            "font-mono text-[16px] font-medium",
            day === today && day !== selected && "text-accent",
          )}
        >
          {Number(day.slice(8))}
        </span>
      </Link>
    ))}
  </nav>
);
