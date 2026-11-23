/**
 * "Erinnern": when the assignee gets a push about the task – choices from its due day and time,
 * or a time picked by hand. The server sends it, also with Kontext closed (server/tasks/notices.ts).
 */
import { useId, useState } from "react";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fromLocal, toLocal } from "@/lib/jscalendar";
import { reminderChoices, reminderKey } from "@/lib/task-reminders";
import type { Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";

export const TaskReminder = ({
  task,
  onChange,
}: {
  /** The task, or the one being made in "Neue Aufgabe". */
  task: Pick<Task, "dueDate" | "dueTime" | "remindAt">;
  onChange: (remindAt: string | null) => void;
}) => {
  const choices = reminderChoices(task, new Date());
  const current = reminderKey(task.remindAt, choices);
  const [custom, setCustom] = useState(current === "custom");
  const key = custom ? "custom" : current;
  const whenId = useId();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Label>
        {m.tasks_remind()}
        <Select
          value={key}
          onValueChange={(value) => {
            setCustom(value === "custom");
            if (value === "custom") return;
            const choice = choices.find((entry) => entry.key === value);
            onChange(choice ? choice.at.toISOString() : null);
          }}
          options={[
            { value: "", label: m.tasks_remind_none() },
            ...choices.map((choice) => ({ value: choice.key, label: choice.label })),
            { value: "custom", label: m.tasks_remind_custom() },
          ]}
        />
      </Label>
      {key === "custom" ? (
        <div className="flex flex-col gap-1.5 text-[13px] text-muted">
          <span id={whenId}>{m.tasks_remind_when()}</span>
          <DateTimeInput
            aria-labelledby={whenId}
            value={task.remindAt ? toLocal(new Date(task.remindAt)).slice(0, 16) : ""}
            onChange={(when) => onChange(when ? fromLocal(`${when}:00`).toISOString() : null)}
          />
        </div>
      ) : (
        <p className="m-0 self-end pb-2 text-[12px] text-muted">{m.tasks_remind_hint()}</p>
      )}
    </div>
  );
};
