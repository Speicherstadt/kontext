/**
 * Feld „Raum oder Gerät“ im Termin-Editor: schlägt Räume (`type: "location"`) und Geräte
 * (`type: "resource"`) getrennt von Personen vor (`Principal/get`, Stalwart
 * `crates/jmap/src/principal/get.rs`).
 */
import { usePrincipals } from "@/directory/queries";
import { formatAddressInput } from "@/lib/addresses";
import { attendeeAddresses } from "@/lib/event-form";
import { withNames } from "@/lib/suggestions";
import { RecipientField } from "@/mail-core/recipient-field";
import { m } from "@/paraglide/messages";

const useResourcePrincipals = () => {
  const { data: principals = [] } = usePrincipals();
  return principals.filter(
    (p): p is typeof p & { type: "location" | "resource"; email: string } =>
      (p.type === "location" || p.type === "resource") && Boolean(p.email),
  );
};

/** Zuordnung E-Mail (klein) → JSCalendar-Teilnehmerart (`"location"` oder `"resource"`). */
export const useResourceKinds = (): Record<string, "location" | "resource"> =>
  Object.fromEntries(useResourcePrincipals().map((p) => [p.email.toLowerCase(), p.type]));

export const ResourceField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const resources = useResourcePrincipals();
  if (resources.length === 0 && !value.trim()) return null;
  const suggestions = resources.map((p) => ({
    kind: "person" as const,
    name: p.description || p.name,
    email: p.email,
  }));
  return (
    <RecipientField
      boxed
      label={m.calendar_event_resources()}
      placeholder={m.calendar_event_resources_hint()}
      value={withNames(attendeeAddresses(value), suggestions)}
      onChange={(addresses) => onChange(formatAddressInput(addresses))}
      suggestions={suggestions}
    />
  );
};
