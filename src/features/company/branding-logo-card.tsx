/**
 * The company logo in Stalwart (Enterprise): shown in Stalwart's calendar mails instead of
 * Stalwart's logo. Uploaded as a file; the server checks it as Stalwart would
 * (src/lib/company-logo.ts) and puts it into `x:Enterprise`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LOGO_ACCEPT, LOGO_MAX_BYTES, logoSource } from "@/lib/company-logo";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";
import { BRANDING_KEY, type BrandingView, readLogoFile, saveLogo } from "./branding";

export const BrandingLogoCard = ({ logo }: { logo: string | null }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: saveLogo,
    onSuccess: (view: BrandingView) => {
      queryClient.setQueryData(BRANDING_KEY, view);
      toast.show(m.company_saved());
    },
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
  });
  const pick = async (file: File) => {
    if (file.size > LOGO_MAX_BYTES) {
      toast.show(m.company_branding_logo_too_large(), "error");
      return;
    }
    save.mutate(await readLogoFile(file));
  };
  const source = logoSource(logo);

  return (
    <SettingsCard title={m.company_branding_logo()} description={m.company_branding_logo_hint()}>
      <div className="flex min-h-16 items-center rounded-lg border border-border bg-subtle p-3">
        {source ? (
          <img
            src={source}
            alt={m.company_branding_logo_current()}
            className="max-h-16 max-w-[200px] object-contain"
          />
        ) : (
          <span className="text-[13px] text-muted">
            {logo ? m.company_branding_logo_unshown() : m.company_branding_logo_none()}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3.5 text-[13px] hover:bg-hover">
          <Upload size={16} aria-hidden="true" /> {m.company_branding_logo_upload()}
          <input
            type="file"
            accept={LOGO_ACCEPT}
            hidden
            disabled={save.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void pick(file);
              event.target.value = "";
            }}
          />
        </label>
        {logo ? (
          <Button variant="danger" disabled={save.isPending} onClick={() => save.mutate(null)}>
            {m.company_branding_logo_remove()}
          </Button>
        ) : null}
      </div>
    </SettingsCard>
  );
};
