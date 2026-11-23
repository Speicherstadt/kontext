/** The app's language on this device: as the browser says, or German or English. */
import { useId } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Select } from "@/components/ui/select";
import { chooseLanguage, chosenLanguage } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { getLocale, isLocale, type Locale } from "@/paraglide/runtime";

/** Each language in its own words, so the way back is readable whatever is set. */
const LANGUAGES: [Locale, string][] = [
  ["de", "Deutsch"],
  ["en", "English"],
];

const SYSTEM = "system";

export const LanguageCard = () => {
  const id = useId();
  const current = LANGUAGES.find(([locale]) => locale === getLocale())?.[1] ?? "";
  return (
    <SettingsCard title={m.settings_language()} description={m.settings_language_hint()}>
      <div className="flex items-center justify-between gap-3 text-[14px]">
        <label htmlFor={id}>{m.settings_language()}</label>
        <Select
          id={id}
          value={chosenLanguage() ?? SYSTEM}
          onValueChange={(value) => chooseLanguage(isLocale(value) ? value : undefined)}
          options={[
            { value: SYSTEM, label: m.settings_language_system({ language: current }) },
            ...LANGUAGES.map(([value, label]) => ({ value: value as string, label })),
          ]}
          className="w-auto"
        />
      </div>
    </SettingsCard>
  );
};
