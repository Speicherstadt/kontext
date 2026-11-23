/**
 * KI-Spamfilter, in the Firmenverwaltung under „Sicherheit der Mails“: Stalwart Enterprise asks a
 * language model about mails its spam filter is unsure of (server/company/spam-ai.ts). Only with
 * Enterprise; with Community the card says so and offers nothing. The key is only typed in and
 * stays in Stalwart; the form learns only whether one is saved.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useStalwartEdition } from "@/company-core/edition";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import {
  canUseAssistantKey,
  initialForm,
  MODEL_EXAMPLES,
  missing,
  OLLAMA_URL_EXAMPLE,
  requestOf,
  type SpamAiForm,
  type SpamAiProvider,
  type SpamAiView,
} from "./spam-ai";

const KEY = ["company", "spam-ai"];

const PROVIDERS: { id: SpamAiProvider; label: () => string }[] = [
  { id: "anthropic", label: m.company_spam_ai_anthropic },
  { id: "openai", label: m.company_spam_ai_openai },
  { id: "gemini", label: m.company_spam_ai_gemini },
  { id: "ollama", label: m.company_spam_ai_ollama },
];

const call = async (method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<SpamAiView> => {
  const response = await fetch("/api/company/spam-ai", {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => ({}))) as SpamAiView & { error?: string };
  if (!response.ok) throw new Error(answer.error ?? String(response.status));
  return answer;
};

export const SpamAiSection = () => {
  const edition = useStalwartEdition();
  if (edition === "community")
    return (
      <div className="mt-6 max-w-[640px]">
        <SettingsCard title={m.company_spam_ai()} description={m.company_spam_ai_community()}>
          {null}
        </SettingsCard>
      </div>
    );
  return edition === "enterprise" ? <SpamAiLoader /> : null;
};

const SpamAiLoader = () => {
  const { data } = useQuery({ queryKey: KEY, queryFn: () => call("GET") });
  return data ? <SpamAiCard view={data} /> : null;
};

const SpamAiCard = ({ view }: { view: SpamAiView }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SpamAiForm>(() => initialForm(view));
  const change = (patch: Partial<SpamAiForm>) => setForm((current) => ({ ...current, ...patch }));
  const done = (next: SpamAiView, message: string) => {
    queryClient.setQueryData(KEY, next);
    setForm(initialForm(next));
    toast.show(message);
  };
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const save = useMutation({
    mutationFn: () => call("PUT", requestOf(form, view)),
    onSuccess: (next) => done(next, m.company_saved()),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => call("DELETE"),
    onSuccess: (next) => done(next, m.company_spam_ai_removed()),
    onError: fail,
  });
  const busy = save.isPending || remove.isPending;

  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_spam_ai()} description={m.company_spam_ai_hint()}>
        {view.known ? null : (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {m.company_spam_ai_unknown()}
          </p>
        )}
        {view.external ? (
          <p className="m-0 text-[13px] text-warn">{m.company_spam_ai_external()}</p>
        ) : null}
        <Switch
          checked={form.enabled}
          disabled={!view.known || busy}
          onChange={(enabled) => change({ enabled })}
        >
          <span className="text-[14px]">{m.company_spam_ai_enabled()}</span>
        </Switch>
        {form.enabled ? <ModelFields form={form} view={view} change={change} /> : null}
        <p className="m-0 text-[13px] text-muted">{m.company_spam_ai_privacy()}</p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!view.known || busy || missing(form, view) !== null}
            onClick={() => save.mutate()}
          >
            {m.company_save()}
          </Button>
          {view.provider ? (
            <Button variant="danger" disabled={busy} onClick={() => remove.mutate()}>
              {m.company_spam_ai_remove()}
            </Button>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
};

const ModelFields = ({
  form,
  view,
  change,
}: {
  form: SpamAiForm;
  view: SpamAiView;
  change: (patch: Partial<SpamAiForm>) => void;
}) => {
  const ollama = form.provider === "ollama";
  const assistant = canUseAssistantKey(form, view);
  const keySaved = view.hasKey && view.provider === form.provider;
  return (
    <>
      <Label>
        {m.company_spam_ai_provider()}
        <Select
          value={form.provider}
          onValueChange={(provider) =>
            change({ provider, model: provider === view.provider ? view.model : "" })
          }
          options={PROVIDERS.map((option) => ({ value: option.id, label: option.label() }))}
        />
      </Label>
      <Label>
        {m.company_spam_ai_model()}
        <Input
          value={form.model}
          spellCheck={false}
          onChange={(event) => change({ model: event.target.value })}
          placeholder={MODEL_EXAMPLES[form.provider]}
        />
      </Label>
      {ollama ? (
        <Label>
          {m.company_spam_ai_url()}
          <Input
            type="url"
            value={form.url}
            spellCheck={false}
            onChange={(event) => change({ url: event.target.value })}
            placeholder={OLLAMA_URL_EXAMPLE}
          />
        </Label>
      ) : (
        <Label>
          {m.company_spam_ai_key()}
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={form.apiKey}
            disabled={form.useAssistantKey && assistant}
            onChange={(event) => change({ apiKey: event.target.value })}
            placeholder={keySaved ? m.company_spam_ai_key_saved() : ""}
          />
        </Label>
      )}
      {!ollama && assistant ? (
        <label className="flex min-h-9 items-center gap-2.5 text-[14px]">
          <Checkbox
            checked={form.useAssistantKey}
            onChange={(event) => change({ useAssistantKey: event.target.checked })}
          />
          {m.company_spam_ai_use_assistant()}
        </label>
      ) : null}
      <Label>
        {m.company_spam_ai_mode()}
        <Select
          value={form.mode}
          onValueChange={(mode) => change({ mode })}
          options={[
            { value: "automatic", label: m.company_spam_ai_automatic() },
            { value: "shadow", label: m.company_spam_ai_shadow() },
          ]}
        />
      </Label>
    </>
  );
};
