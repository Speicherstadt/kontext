/** The German state whose public holidays to add: in the calendar and the phone's opening hours. */
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STATES, type State } from "@/lib/holidays";
import { m } from "@/paraglide/messages";

const STATE_OPTIONS = Object.entries(STATES).map(([code, name]) => ({
  value: code as State,
  label: name,
}));

export const StateSelect = ({
  value,
  onValueChange,
  className,
}: {
  value: State;
  onValueChange: (state: State) => void;
  className?: string;
}) => (
  <Label className={className}>
    {m.holidays_state()}
    <Select value={value} onValueChange={onValueChange} options={STATE_OPTIONS} />
  </Label>
);
