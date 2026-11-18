/** Start and end of an event: a date and a time field each, or the date only for all-day events. */
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

type Change = (e: { target: { value: string } }) => void;

export const TimeFields = ({
  legend,
  date,
  time,
  allDay,
  onDate,
  onTime,
}: {
  legend: string;
  date: string;
  time: string;
  allDay: boolean;
  onDate: Change;
  onTime: Change;
}) => (
  <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
    <legend className="mb-1.5 p-0 text-[13px] text-muted">{legend}</legend>
    <div className="flex gap-2">
      <Input
        type="date"
        aria-label={`${legend} ${m.calendar_event_date()}`}
        value={date}
        onChange={onDate}
        required
      />
      {!allDay ? (
        <Input
          type="time"
          aria-label={`${legend} Uhrzeit`}
          value={time}
          onChange={onTime}
          required
          className="w-32 shrink-0"
        />
      ) : null}
    </div>
  </fieldset>
);
