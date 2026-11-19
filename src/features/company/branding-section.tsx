/**
 * Firmenlogo und Vorlagen in the Firmenverwaltung: the logo and the calendar mail templates
 * Stalwart uses, only with a Stalwart Enterprise license (Stalwart ignores them in Community).
 * Without one the entry is not in the list; opened by its address, it says why.
 */
import { useQuery } from "@tanstack/react-query";
import { useStalwartEdition } from "@/company-core/edition";
import { m } from "@/paraglide/messages";
import { BRANDING_KEY, getBranding } from "./branding";
import { BrandingLogoCard } from "./branding-logo-card";
import { BrandingTemplatesCard } from "./branding-templates-card";

const Hint = ({ text }: { text: string }) => <p className="m-0 text-[14px] text-muted">{text}</p>;

const BrandingCards = () => {
  const { data } = useQuery({ queryKey: BRANDING_KEY, queryFn: getBranding });
  if (!data) return null;
  if (!data.known) return <Hint text={m.company_branding_unknown()} />;
  return (
    <>
      <BrandingLogoCard logo={data.logo} />
      <BrandingTemplatesCard view={data} />
    </>
  );
};

export const BrandingSection = () => {
  const edition = useStalwartEdition();
  if (edition === undefined) return null;
  if (edition !== "enterprise") return <Hint text={m.company_branding_enterprise_only()} />;
  return <BrandingCards />;
};
