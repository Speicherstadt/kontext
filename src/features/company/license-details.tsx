/**
 * Under the edition, with Stalwart Enterprise: "12 von 25 Postfächern belegt", until when, for which
 * domain, and a warning shortly before the limit or the end. Stalwart counts every account, shared
 * mailboxes included (server/company/license.ts).
 */
import { CircleAlert } from "lucide-react";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { type License, licenseWarnings, useLicense } from "./license";

const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "long" });
const count = (value: number) => value.toLocaleString(LOCALE);

const Warning = ({ children }: { children: string }) => (
  <p
    role="status"
    className="m-0 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-muted"
  >
    <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
    {children}
  </p>
);

const usage = ({ used, limit }: License): string | null => {
  if (used === null) return null;
  return limit === null
    ? m.company_license_used_only({ used: count(used) })
    : m.company_license_used({ used: count(used), limit: count(limit) });
};

const warningsOf = (license: License): string[] => {
  const { full, nearLimit, expiresSoon } = licenseWarnings(license, Date.now());
  const free = (license.limit ?? 0) - (license.used ?? 0);
  return [
    full ? m.company_license_full() : null,
    nearLimit ? m.company_license_near_limit({ free: count(free) }) : null,
    expiresSoon && license.validTo
      ? m.company_license_expires({ date: dateFormat.format(new Date(license.validTo)) })
      : null,
  ].filter((text) => text !== null);
};

export const LicenseDetails = () => {
  const license = useLicense();
  if (!license) return null;
  const used = usage(license);
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="stalwart-license">
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
        {used && <li className="font-medium">{used}</li>}
        {license.validTo && (
          <li>
            {m.company_license_valid_to({ date: dateFormat.format(new Date(license.validTo)) })}
          </li>
        )}
        {license.domain && <li>{m.company_license_domain({ domain: license.domain })}</li>}
      </ul>
      {license.limit === null && (
        <p className="m-0 text-[13px] text-muted">{m.company_license_details_hidden()}</p>
      )}
      {warningsOf(license).map((text) => (
        <Warning key={text}>{text}</Warning>
      ))}
    </div>
  );
};
