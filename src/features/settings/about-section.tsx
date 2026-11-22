/**
 * "Über Kontext": the version on this device, the server's when it is already further, the
 * Stalwart edition behind it, and where Kontext comes from (website, source, AGPL). The line in the
 * account menu (src/shell/menu-version.tsx) leads here.
 */
import { ExternalLink } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { type Edition, useStalwartEdition } from "@/company-core/edition";
import { SettingsCard } from "@/components/settings-card";
import { m } from "@/paraglide/messages";
import { APP_VERSION, useServerVersion } from "./version";

const WEBSITE = "https://kontext.email/";
const SOURCE = "https://github.com/Speicherstadt/kontext";
const LICENSE = "https://www.gnu.org/licenses/agpl-3.0.html";

/** A newer server: the worker looks for the new app right away, so the banner follows sooner. */
const checkForUpdate = () => {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);
};

const EDITION_LABEL: Record<Edition, () => string> = {
  community: m.about_edition_community,
  enterprise: m.about_edition_enterprise,
  unknown: m.about_unknown,
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 text-[14px]">
    <dt className="text-muted">{label}</dt>
    <dd className="m-0 text-right font-mono text-[13px]">{children}</dd>
  </div>
);

const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-1.5 text-[14px] text-fg"
  >
    {children} <ExternalLink size={14} className="text-muted" />
  </a>
);

export const AboutSection = () => {
  const server = useServerVersion();
  const edition = useStalwartEdition();
  const behind = Boolean(server) && server !== APP_VERSION;
  useEffect(() => {
    if (behind) checkForUpdate();
  }, [behind]);

  return (
    <>
      <SettingsCard title={m.about_version_title()} description={m.about_version_hint()}>
        <dl className="m-0 flex flex-col gap-2">
          <Row label={m.about_app()}>{APP_VERSION}</Row>
          <Row label={m.about_server()}>{server ?? m.about_unknown()}</Row>
          <Row label={m.about_stalwart()}>{EDITION_LABEL[edition ?? "unknown"]()}</Row>
        </dl>
        {behind && server ? (
          <p className="m-0 text-[13px] text-muted">{m.pwa_version_server({ version: server })}</p>
        ) : null}
      </SettingsCard>
      <SettingsCard title={m.about_project_title()} description={m.about_project_hint()}>
        <div className="flex flex-col gap-2">
          <Out href={WEBSITE}>{m.about_website()}</Out>
          <Out href={SOURCE}>{m.about_source()}</Out>
          <Out href={LICENSE}>{m.about_license()}</Out>
        </div>
      </SettingsCard>
    </>
  );
};
