/**
 * The KI-Spamfilter form's rules (server/company/spam-ai.ts): what it starts with, when it may be
 * saved and what it sends. Pure.
 */
import type {
  SpamAiInput,
  SpamAiMode,
  SpamAiProvider,
  SpamAiView,
} from "../../../server/company/spam-ai";

export type { SpamAiProvider, SpamAiView };

export type SpamAiForm = {
  enabled: boolean;
  provider: SpamAiProvider;
  model: string;
  url: string;
  apiKey: string;
  useAssistantKey: boolean;
  mode: SpamAiMode;
};

/** A small, cheap model is enough to sort mail; the others are examples to type over. */
export const MODEL_EXAMPLES: Record<SpamAiProvider, string> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-5-mini",
  gemini: "gemini-2.5-flash",
  ollama: "llama3.1:8b",
};

export const OLLAMA_URL_EXAMPLE = "http://ollama.intern:11434";

export const initialForm = (view: SpamAiView): SpamAiForm => {
  const provider = view.provider ?? "anthropic";
  return {
    enabled: view.enabled,
    provider,
    model: view.model || (provider === "anthropic" ? MODEL_EXAMPLES.anthropic : ""),
    url: view.url,
    apiKey: "",
    useAssistantKey: false,
    mode: view.mode,
  };
};

/** Whether Stalwart already holds a key that would stay: same provider, one saved. */
const keepsKey = (form: SpamAiForm, view: SpamAiView) =>
  view.hasKey && view.provider === form.provider;

/** The assistant's Claude key can stand in, for Anthropic only. */
export const canUseAssistantKey = (form: SpamAiForm, view: SpamAiView) =>
  view.assistantKey && form.provider === "anthropic";

/** What is still missing before saving makes sense; null when nothing. */
export const missing = (form: SpamAiForm, view: SpamAiView): "model" | "url" | "key" | null => {
  if (!form.enabled) return null;
  if (!form.model.trim()) return "model";
  if (form.provider === "ollama") return form.url.trim() ? null : "url";
  const hasKey =
    form.apiKey.trim() !== "" ||
    keepsKey(form, view) ||
    (form.useAssistantKey && canUseAssistantKey(form, view));
  return hasKey ? null : "key";
};

/** The body of PUT /api/company/spam-ai. */
export const requestOf = (form: SpamAiForm, view: SpamAiView): SpamAiInput => {
  if (!form.enabled) return { enabled: false };
  const apiKey = form.provider === "ollama" ? "" : form.apiKey.trim();
  return {
    enabled: true,
    provider: form.provider,
    model: form.model.trim(),
    url: form.provider === "ollama" ? form.url.trim() : "",
    mode: form.mode,
    ...(apiKey ? { apiKey } : {}),
    ...(!apiKey && form.useAssistantKey && canUseAssistantKey(form, view)
      ? { useAssistantKey: true }
      : {}),
  };
};
