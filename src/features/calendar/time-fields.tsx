/** Start and end of an event: a date and a time field each, or the date only for all-day events. */
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { m } from "@/paraglide/messages";

/** As the form's other fields report a change (event-editor.tsx's `set`). */
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
      <DateInput
        aria-label={`${legend} ${m.calendar_event_date()}`}
        value={date}
        onChange={(value) => onDate({ target: { value } })}
        required
      />
      {!allDay ? (
        <TimeInput
          aria-label={`${legend} ${m.field_time()}`}
          value={time}
          onChange={(value) => onTime({ target: { value } })}
          required
          className="w-32 shrink-0"
        />
      ) : null}
    </div>
  </fieldset>
);
