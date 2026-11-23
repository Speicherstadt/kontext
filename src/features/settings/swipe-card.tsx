/** Per device: what swiping a mail in the list to the left or right does on the phone. */
import { useId } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Select } from "@/components/ui/select";
import { SWIPE_ACTIONS, type SwipeAction, type SwipeDirection } from "@/lib/swipe";
import { setSwipeSettings, useSwipeSettings } from "@/mail-core/swipe-settings";
import { m } from "@/paraglide/messages";

const ACTION_LABEL: Record<SwipeAction, () => string> = {
  archive: m.settings_swipe_archive,
  delete: m.settings_swipe_delete,
  read: m.settings_swipe_read,
  flag: m.settings_swipe_flag,
  none: m.settings_swipe_none,
};

const DIRECTIONS: [SwipeDirection, () => string][] = [
  ["left", m.settings_swipe_left],
  ["right", m.settings_swipe_right],
];

export const SwipeCard = () => {
  const settings = useSwipeSettings();
  const id = useId();
  return (
    <SettingsCard title={m.settings_swipe()} description={m.settings_swipe_hint()}>
      {DIRECTIONS.map(([direction, label]) => (
        <div key={direction} className="flex items-center justify-between gap-3 text-[14px]">
          <label htmlFor={`${id}-${direction}`}>{label()}</label>
          <Select
            id={`${id}-${direction}`}
            value={settings[direction]}
            onValueChange={(action) => setSwipeSettings({ ...settings, [direction]: action })}
            options={SWIPE_ACTIONS.map((action) => ({
              value: action,
              label: ACTION_LABEL[action](),
            }))}
            className="w-44"
          />
        </div>
      ))}
    </SettingsCard>
  );
};
