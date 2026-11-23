/**
 * Anmeldung über Firmenkonto (SSO), Stalwart Enterprise only: the company's identity provider
 * (Kontext's client there, Stalwart's OIDC directory), the domains it signs in, a connection test,
 * and SCIM (scim-card.tsx). In Community the section only says what it needs.
 */
import { useQuery } from "@tanstack/react-query";
import { type ComponentProps, type FormEvent, useState } from "react";
import { useStalwartEdition } from "@/company-core/edition";
import { useCompanyChange } from "@/company-core/queries";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { ConfirmButton } from "./fields";
import { CopyValue, ScimCard } from "./scim-card";
import {
  type ConnectionTest,
  type DomainChoice,
  getSso,
  initialSettings,
  removeSso,
  SSO_KEY,
  type SsoSettings,
  type SsoView,
  saveSso,
  saveSsoDomains,
  testSso,
} from "./sso-api";

const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {text}
    </p>
  ) : null;

const Field = ({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & ComponentProps<typeof Input>) => (
  <Label>
    {label}
    <Input autoComplete="off" {...props} />
    {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
  </Label>
);

type TextKey = Exclude<keyof SsoSettings, "tokenCheck">;

/** The provider's values, in the order its admin pages show them. */
const FIELDS: {
  key: TextKey;
  label: () => string;
  hint?: () => string;
  type?: string;
  required?: boolean;
}[] = [
  {
    key: "issuerUrl",
    label: m.company_sso_issuer,
    hint: m.company_sso_issuer_hint,
    type: "url",
    required: true,
  },
  { key: "clientId", label: m.company_sso_client_id, required: true },
  { key: "clientSecret", label: m.company_sso_client_secret, type: "password" },
  { key: "scopes", label: m.company_sso_scopes, hint: m.company_sso_scopes_hint, required: true },
  { key: "audience", label: m.company_sso_audience, hint: m.company_sso_audience_hint },
  {
    key: "claimUsername",
    label: m.company_sso_claim_username,
    hint: m.company_sso_claim_username_hint,
  },
  { key: "usernameDomain", label: m.company_sso_username_domain },
  { key: "claimName", label: m.company_sso_claim_name },
  { key: "claimGroups", label: m.company_sso_claim_groups, hint: m.company_sso_claim_groups_hint },
];

/** A saved secret is never sent back: the field stays empty and may stay so. */
const secretProps = (view: SsoView) => ({
  placeholder: view.client?.hasSecret ? m.company_sso_secret_saved() : undefined,
  required: !view.client?.hasSecret,
});

const ProviderCard = ({ view }: { view: SsoView }) => {
  const toast = useToast();
  const [form, setForm] = useState<SsoSettings>(() => initialSettings(view));
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCompanyChange(saveSso);
  const remove = useCompanyChange(removeSso);
  const set = (key: keyof SsoSettings) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync(form);
      setForm((current) => ({ ...current, clientSecret: "" }));
      toast.show(m.company_saved());
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const drop = async () => {
    try {
      setForm(initialSettings(await remove.mutateAsync(undefined)));
      toast.show(m.company_sso_removed());
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <SettingsCard title={m.company_sso_provider()} description={m.company_sso_provider_hint()}>
      <CopyValue label={m.company_sso_redirect()} value={view.redirectUri} testId="sso-redirect" />
      <form onSubmit={submit} className="flex flex-col gap-4">
        {FIELDS.map((field) => (
          <Field
            key={field.key}
            label={field.label()}
            hint={field.hint?.()}
            type={field.type}
            required={field.required}
            value={form[field.key]}
            onChange={(e) => set(field.key)(e.target.value)}
            {...(field.key === "clientSecret" ? secretProps(view) : {})}
          />
        ))}
        <Label>
          {m.company_sso_token_check()}
          <Select value={form.tokenCheck} onChange={(e) => set("tokenCheck")(e.target.value)}>
            <option value="jwt">{m.company_sso_token_jwt()}</option>
            <option value="userInfo">{m.company_sso_token_userinfo()}</option>
          </Select>
        </Label>
        <Problem text={problem} />
        <div className="flex flex-wrap justify-end gap-2">
          {view.directory ? (
            <ConfirmButton
              danger
              label={m.company_sso_remove()}
              question={m.company_sso_remove_confirm()}
              disabled={remove.isPending}
              onConfirm={() => void drop()}
            />
          ) : null}
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {m.company_save()}
          </Button>
        </div>
      </form>
      {view.client ? <TestConnection /> : null}
    </SettingsCard>
  );
};

const TestConnection = () => {
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setResult(await testSso());
    } catch (error) {
      setProblem((error as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Button className="self-start" disabled={busy} onClick={() => void run()}>
        {m.company_sso_test()}
      </Button>
      <Problem text={problem} />
      {result ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]" data-testid="sso-test">
          <li className={result.provider.ok ? "" : "text-danger"}>
            {result.provider.ok
              ? m.company_sso_test_provider_ok()
              : m.company_sso_test_provider_failed({ error: result.provider.error })}
          </li>
          {result.domains.map((domain) => (
            <li key={domain.name} className={domain.servedByProvider ? "" : "text-danger"}>
              {domain.servedByProvider
                ? m.company_sso_test_domain_ok({ domain: domain.name })
                : m.company_sso_test_domain_failed({ domain: domain.name })}
            </li>
          ))}
          {result.domains.length ? null : <li>{m.company_sso_test_no_domains()}</li>}
        </ul>
      ) : null}
    </div>
  );
};

const DomainsCard = ({ view }: { view: SsoView }) => {
  const toast = useToast();
  const [choices, setChoices] = useState<DomainChoice[]>(() =>
    view.domains.map(({ id, sso, scim }) => ({ id, sso, scim })),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCompanyChange(saveSsoDomains);
  const toggle = (id: string, key: "sso" | "scim", value: boolean) =>
    setChoices((current) => current.map((c) => (c.id === id ? { ...c, [key]: value } : c)));

  const submit = async () => {
    setProblem(null);
    try {
      await save.mutateAsync(choices);
      toast.show(m.company_saved());
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <SettingsCard title={m.company_sso_domains()} description={m.company_sso_domains_hint()}>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {view.domains.map((domain) => {
          const choice = choices.find((c) => c.id === domain.id);
          return (
            <li key={domain.id} className="flex flex-col gap-1.5 py-2.5">
              <span className="text-[14px] font-medium">{domain.name}</span>
              {domain.otherDirectory ? (
                <span className="text-[13px] text-muted">{m.company_sso_other_directory()}</span>
              ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(choice?.sso)}
                      disabled={!view.directory}
                      onChange={(e) => toggle(domain.id, "sso", e.target.checked)}
                      aria-label={m.company_sso_domain_sso({ domain: domain.name })}
                    />
                    {m.company_sso_column_sso()}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={Boolean(choice?.scim)}
                      onChange={(e) => toggle(domain.id, "scim", e.target.checked)}
                      aria-label={m.company_sso_domain_scim({ domain: domain.name })}
                    />
                    {m.company_sso_column_scim()}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[12px] text-muted">{m.company_sso_domains_warning()}</p>
      <Problem text={problem} />
      <Button
        variant="primary"
        className="self-end"
        disabled={save.isPending}
        onClick={() => void submit()}
      >
        {m.company_save()}
      </Button>
    </SettingsCard>
  );
};

export const SsoSection = () => {
  const edition = useStalwartEdition();
  const enterprise = edition === "enterprise";
  const { data: view, error } = useQuery({
    queryKey: SSO_KEY,
    queryFn: getSso,
    enabled: enterprise,
    retry: false,
  });
  if (edition === undefined) return null;
  if (!enterprise)
    return (
      <p className="m-0 text-[14px] text-muted" data-testid="sso-enterprise-only">
        {m.company_sso_enterprise_only()}
      </p>
    );
  if (error) return <p className="m-0 text-[14px] text-muted">{m.company_forbidden()}</p>;
  if (!view) return <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>;
  return (
    <>
      <p className="m-0 text-[13px] text-muted">{m.company_sso_intro()}</p>
      {view.known ? null : (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {m.company_sso_rights_missing()}
        </p>
      )}
      <ProviderCard key={view.directory?.issuerUrl ?? "new"} view={view} />
      <DomainsCard key={view.domains.map((d) => `${d.id}${d.sso}${d.scim}`).join()} view={view} />
      <ScimCard view={view} />
    </>
  );
};
