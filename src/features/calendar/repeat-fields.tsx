/** "Wiederholen" in the event editor: how often, and when the series ends. */
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type Repeat, type RepeatEnd, type RepeatForm, repeatLabel } from "@/lib/recurrence";
import { m } from "@/paraglide/messages";

const REPEATS: Repeat[] = ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"];

const ENDS: [RepeatEnd, () => string][] = [
  ["never", m.calendar_repeat_end_never],
  ["count", m.calendar_repeat_end_count],
  ["until", m.calendar_repeat_end_until],
];

type Props = {
  /** null: a rule from another app the form cannot show; it is kept as it is. */
  value: RepeatForm | null;
  onChange: (value: RepeatForm) => void;
};

export const RepeatFields = ({ value, onChange }: Props) => {
  if (!value) return <p className="m-0 text-[13px] text-muted">{m.calendar_repeat_custom()}</p>;
  const set = (patch: Partial<RepeatForm>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <Label>
        {m.calendar_repeat()}
        <Select
          value={value.repeat}
          onValueChange={(repeat) => set({ repeat })}
          options={REPEATS.map((repeat) => ({ value: repeat, label: repeatLabel(repeat) }))}
        />
      </Label>
      {value.repeat !== "none" ? (
        <div className="flex gap-2">
          <Label className="flex-1">
            {m.calendar_repeat_ends()}
            <Select
              value={value.repeatEnd}
              onValueChange={(repeatEnd) => set({ repeatEnd })}
              options={ENDS.map(([end, label]) => ({ value: end, label: label() }))}
            />
          </Label>
          {value.repeatEnd === "count" ? (
            <Label className="w-32 shrink-0">
              {m.calendar_repeat_count()}
              <Input
                type="number"
                min={1}
                max={999}
                value={value.repeatCount}
                onChange={(e) => set({ repeatCount: Number(e.target.value) })}
                required
              />
            </Label>
          ) : null}
          {value.repeatEnd === "until" ? (
            <Label className="flex-1">
              {m.calendar_repeat_until()}
              <Input
                type="date"
                value={value.repeatUntil}
                onChange={(e) => set({ repeatUntil: e.target.value })}
                required
              />
            </Label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
