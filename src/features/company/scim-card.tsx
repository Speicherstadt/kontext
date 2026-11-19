/**
 * SCIM in the Firmenverwaltung (Stalwart Enterprise): the endpoint the identity provider is given
 * and its token, an API key of the Kontext server made for SCIM only; Stalwart shows its secret
 * once, when it is made (server/company/sso.ts).
 */
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { ConfirmButton } from "./fields";
import { useCompanyChange } from "./queries";
import { createScimToken, removeScimToken, type SsoView } from "./sso-api";

/** A value to copy into the provider's settings. */
export const CopyValue = ({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) => (
  <div className="flex flex-col gap-1 text-[13px]">
    <span className="font-medium">{label}</span>
    <code
      data-testid={testId}
      className="rounded-lg border border-border bg-subtle px-3 py-2 font-mono text-[12px] break-all select-all"
    >
      {value}
    </code>
  </div>
);

const madeOn = (createdAt: string | null) =>
  createdAt
    ? m.company_scim_token_since({
        date: new Date(createdAt).toLocaleDateString(LOCALE, { dateStyle: "medium" }),
      })
    : m.company_scim_token_exists();

const SecretNotice = ({ secret, canDelete }: { secret: string; canDelete: boolean }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(secret).catch(() => undefined);
    setCopied(true);
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-subtle p-4">
      <div className="text-[14px] font-medium">{m.company_scim_token_new()}</div>
      <div className="flex items-center gap-2">
        <code
          data-testid="scim-token"
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-[12px] break-all select-all"
        >
          {secret}
        </code>
        <Button onClick={copy} aria-label={m.company_password_copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? m.company_password_copied() : m.company_password_copy()}
        </Button>
      </div>
      <p className="m-0 text-[13px] text-muted">{m.company_scim_token_once()}</p>
      {canDelete ? null : (
        <p className="m-0 text-[13px] text-muted">{m.company_scim_no_delete()}</p>
      )}
    </div>
  );
};

export const ScimCard = ({ view }: { view: SsoView }) => {
  const toast = useToast();
  const [created, setCreated] = useState<{ secret: string; canDelete: boolean } | null>(null);
  const create = useCompanyChange(createScimToken);
  const remove = useCompanyChange(removeScimToken);
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const make = () => create.mutateAsync(undefined).then(setCreated, fail);
  const drop = () =>
    remove.mutateAsync(undefined).then(() => {
      setCreated(null);
      toast.show(m.company_scim_token_removed());
    }, fail);
  const busy = create.isPending || remove.isPending;

  return (
    <SettingsCard title={m.company_scim()} description={m.company_scim_hint()}>
      <CopyValue label={m.company_scim_url()} value={view.scimUrl} testId="scim-url" />
      {created ? <SecretNotice {...created} /> : null}
      <p className="m-0 text-[13px]" data-testid="scim-token-state">
        {view.scimKey ? madeOn(view.scimKey.createdAt) : m.company_scim_token_none()}
      </p>
      <div className="flex flex-wrap gap-2">
        {view.scimKey ? (
          <>
            <ConfirmButton
              label={m.company_scim_token_renew()}
              question={m.company_scim_token_renew_confirm()}
              disabled={busy}
              onConfirm={() => void make()}
            />
            <ConfirmButton
              danger
              label={m.company_scim_token_remove()}
              question={m.company_scim_token_remove_confirm()}
              disabled={busy}
              onConfirm={() => void drop()}
            />
          </>
        ) : (
          <Button disabled={busy} onClick={() => void make()}>
            {m.company_scim_token_create()}
          </Button>
        )}
      </div>
    </SettingsCard>
  );
};
