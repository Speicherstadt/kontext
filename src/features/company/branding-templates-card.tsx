/**
 * The templates of Stalwart's calendar mails (Enterprise): the reminder by mail and the
 * invitation mail (also change, cancellation, answer). Without one of its own Stalwart uses its
 * built-in template; the editor then starts from Kontext's (src/lib/calendar-template-defaults.ts).
 * Checked as Stalwart reads it and shown with an example appointment before it is saved.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  CALENDAR_TEMPLATE_KINDS,
  type CalendarTemplateKind,
  templateProblem,
} from "@/lib/calendar-template";
import { defaultTemplate, type TemplateLanguage } from "@/lib/calendar-template-defaults";
import { previewTemplate } from "@/lib/calendar-template-preview";
import { logoSource } from "@/lib/company-logo";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { BRANDING_KEY, type BrandingView, saveTemplate } from "./branding";

const KIND_LABEL: Record<CalendarTemplateKind, () => string> = {
  alarm: m.company_branding_kind_alarm,
  invitation: m.company_branding_kind_invitation,
};

/** Stands in for the logo in the preview while the company has none (Stalwart sends its own). */
const PLACEHOLDER_LOGO = `data:image/svg+xml;base64,${btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="28"><rect width="140" height="28" rx="6" fill="#e4e4e7"/><text x="70" y="19" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#68686f">Logo</text></svg>',
)}`;

const problemText = (problem: string) =>
  problem === "empty"
    ? m.company_branding_template_empty()
    : problem === "too long"
      ? m.company_branding_template_too_long()
      : m.company_branding_template_invalid({ reason: problem });

const Preview = ({
  template,
  kind,
  language,
  logo,
}: {
  template: string;
  kind: CalendarTemplateKind;
  language: TemplateLanguage;
  logo: string;
}) => {
  const deferred = useDeferredValue(template);
  const preview = useMemo(
    () => previewTemplate(deferred, kind, language, logo),
    [deferred, kind, language, logo],
  );
  if (!preview.ok) return null;
  return (
    <iframe
      title={m.company_branding_preview()}
      sandbox=""
      srcDoc={preview.html}
      className="h-[480px] w-full rounded-lg border border-border bg-white"
    />
  );
};

export const BrandingTemplatesCard = ({ view }: { view: BrandingView }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CalendarTemplateKind>("alarm");
  const [language, setLanguage] = useState<TemplateLanguage>(getLocale());
  const [drafts, setDrafts] = useState<Partial<Record<CalendarTemplateKind, string>>>({});
  const saved = view.templates[kind];
  const text = drafts[kind] ?? saved ?? defaultTemplate(kind, language);
  const problem = templateProblem(text);
  const setText = (value: string) => setDrafts((current) => ({ ...current, [kind]: value }));

  const save = useMutation({
    mutationFn: saveTemplate,
    onSuccess: (next: BrandingView, { kind: changed }) => {
      queryClient.setQueryData(BRANDING_KEY, next);
      setDrafts(({ [changed]: _, ...rest }) => rest);
      toast.show(m.company_saved());
    },
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
  });
  const reset = () => {
    if (window.confirm(m.company_branding_reset_confirm())) save.mutate({ kind, template: null });
  };

  return (
    <SettingsCard
      title={m.company_branding_templates()}
      description={m.company_branding_templates_hint()}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Label>
          {m.company_branding_kind()}
          <Select
            value={kind}
            onValueChange={setKind}
            options={CALENDAR_TEMPLATE_KINDS.map((option) => ({
              value: option,
              label: KIND_LABEL[option](),
            }))}
          />
        </Label>
        <Label>
          {m.company_branding_language()}
          <Select
            value={language}
            onValueChange={setLanguage}
            options={[
              { value: "de", label: "Deutsch" },
              { value: "en", label: "English" },
            ]}
          />
        </Label>
      </div>
      <p className="m-0 text-[13px] text-muted" data-testid="branding-template-state">
        {saved ? m.company_branding_state_own() : m.company_branding_state_stalwart()}
      </p>
      <Label>
        {m.company_branding_template()}
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          spellCheck={false}
          className="font-mono text-[12px]"
        />
      </Label>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problemText(problem)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={save.isPending || problem !== null || text === saved}
          onClick={() => save.mutate({ kind, template: text })}
        >
          {m.company_save()}
        </Button>
        <Button variant="outline" onClick={() => setText(defaultTemplate(kind, language))}>
          {m.company_branding_insert_default()}
        </Button>
        {saved ? (
          <Button variant="danger" disabled={save.isPending} onClick={reset}>
            {m.company_branding_reset()}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{m.company_branding_preview()}</span>
        <Preview
          template={text}
          kind={kind}
          language={language}
          logo={logoSource(view.logo) ?? PLACEHOLDER_LOGO}
        />
      </div>
    </SettingsCard>
  );
};
