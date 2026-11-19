/**
 * The Firmenverwaltung shows which Stalwart edition runs: Kontext works with both, an Enterprise
 * license adds what only Stalwart Enterprise has, and its usage shows below (license-details.tsx).
 * Nothing to set here; the key goes into Stalwart.
 */

import { SettingsCard } from "@/components/settings-card";
import { m } from "@/paraglide/messages";
import { type Edition, useStalwartEdition } from "./edition";
import { LicenseDetails } from "./license-details";

const LABEL: Record<Edition, () => string> = {
  community: m.company_edition_community,
  enterprise: m.company_edition_enterprise,
  unknown: m.company_edition_unknown,
};

export const EditionCard = () => {
  const edition = useStalwartEdition();
  if (edition === undefined) return null;
  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_edition()} description={m.company_edition_hint()}>
        <p className="m-0 text-[14px]">
          {m.company_edition_label()}:{" "}
          <span className="font-medium" data-testid="stalwart-edition">
            {LABEL[edition]()}
          </span>
        </p>
        {edition === "enterprise" && <LicenseDetails />}
      </SettingsCard>
    </div>
  );
};
