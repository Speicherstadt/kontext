/**
 * KI-Spamfilter: Stalwart Enterprise asks a language model about the mails its own spam filter is
 * unsure of (crates/spam-filter/src/analysis/ai/mod.rs, gate.rs of stalwartlabs/stalwart v1.1.0).
 * Two management objects hold it (crates/registry/src/schema/structs.rs):
 * - `AiModel` (a list): the provider as `@type` (OpenAi, Anthropic, Gemini, Ollama), `name`,
 *   `model`, `url` (empty: the provider's default, crates/common/src/enterprise/ai/config.rs) and
 *   `apiKey` (SecretKeyOptional; Stalwart answers it masked). Kontext keeps one, named MODEL_NAME.
 * - `SpamAi` (a singleton): `Disable`, or `Enable` with `mode` (Automatic: the verdict counts in
 *   the spam score; Shadow: only written into the mail), `tiers` (the models in order) and
 *   `addHeader` (the X-Spam-AI header that src/lib/spam-ai.ts reads). Everything else keeps
 *   Stalwart's defaults (SpamAiProperties::default, structs_impl.rs): categories, questions and
 *   the condition that only borderline mails go to the model.
 * An update that changes `@type` starts the object over from its defaults
 * (crates/jmap/src/registry/set.rs), so a new provider needs a new key. Stalwart reads both at
 * start and on ReloadSettings, and only with a valid license (crates/common/src/enterprise/config.rs).
 * Rights: sysAiModel*, sysSpamAi* (stalwart-setup.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Result } from "./accounts";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

/** How Kontext finds its own model among those an admin may have made in Stalwart. */
export const MODEL_NAME = "Kontext-Spamfilter";

export const SPAM_AI_PROVIDERS = ["anthropic", "openai", "gemini", "ollama"] as const;
export type SpamAiProvider = (typeof SPAM_AI_PROVIDERS)[number];

/** Stalwart's `@type` of AiModel per provider (AiModelType, enums.rs). */
const MODEL_TYPE: Record<SpamAiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAi",
  gemini: "Gemini",
  ollama: "Ollama",
};

const providerOf = (type: string | undefined): SpamAiProvider | undefined =>
  SPAM_AI_PROVIDERS.find((provider) => MODEL_TYPE[provider] === type);

export type SpamAiMode = "automatic" | "shadow";

export type RawModel = {
  id: string;
  "@type": string;
  name?: string;
  model?: string;
  url?: string | null;
  apiKey?: { "@type": string } | null;
};

export type RawSpamAi = {
  "@type": string;
  mode?: string;
  tiers?: Record<string, { modelId?: string }>;
};

/** What the form shows; the key itself never leaves Stalwart. */
export type SpamAiView = {
  /** False when the server's key lacks the rights (setup command not run again). */
  known: boolean;
  enabled: boolean;
  provider: SpamAiProvider | null;
  model: string;
  url: string;
  hasKey: boolean;
  mode: SpamAiMode;
  /** Switched on in Stalwart with a model Kontext did not set up. */
  external: boolean;
  /** The assistant in the chat has a Claude key (assistant.ts) that could be used here too. */
  assistantKey: boolean;
};

const UNKNOWN: SpamAiView = {
  known: false,
  enabled: false,
  provider: null,
  model: "",
  url: "",
  hasKey: false,
  mode: "automatic",
  external: false,
  assistantKey: false,
};

const hasSecret = (key: RawModel["apiKey"]): boolean => Boolean(key && key["@type"] !== "None");

const firstTierModel = (spamAi: RawSpamAi | undefined): string | undefined =>
  Object.entries(spamAi?.tiers ?? {}).sort(([a], [b]) => Number(a) - Number(b))[0]?.[1].modelId;

/** The form's state from what Stalwart has. Pure. */
export const toView = (
  models: RawModel[],
  spamAi: RawSpamAi | undefined,
  assistantKey: boolean,
): SpamAiView => {
  const own = models.find((model) => model.name === MODEL_NAME);
  const enabled = spamAi?.["@type"] === "Enable";
  return {
    known: true,
    enabled,
    provider: providerOf(own?.["@type"]) ?? null,
    model: own?.model ?? "",
    url: own?.url ?? "",
    hasKey: hasSecret(own?.apiKey),
    mode: spamAi?.mode === "Shadow" ? "shadow" : "automatic",
    external: enabled && firstTierModel(spamAi) !== own?.id,
    assistantKey,
  };
};

export const spamAiSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    provider: z.enum(SPAM_AI_PROVIDERS),
    model: z.string().trim().min(1).max(200),
    /** Empty: the provider's own address; for Ollama the server it runs on. */
    url: z.union([z.literal(""), z.string().trim().url().max(500)]).optional(),
    /** A new key; left out, the saved one stays (same provider). */
    apiKey: z.string().trim().min(8).max(400).optional(),
    /** Take the assistant's Claude key (Anthropic only). */
    useAssistantKey: z.boolean().optional(),
    mode: z.enum(["automatic", "shadow"]),
  }),
]);
export type SpamAiInput = z.infer<typeof spamAiSchema>;
export type SpamAiSettings = Extract<SpamAiInput, { enabled: true }>;

/** The key to send to Stalwart: a new one, the assistant's, or none (keep the saved one). */
export const keyFor = (
  input: SpamAiSettings,
  own: RawModel | undefined,
  assistantKey: string | undefined,
): Result<string | undefined> => {
  if (input.apiKey) return { ok: true, value: input.apiKey };
  if (input.useAssistantKey && input.provider === "anthropic" && assistantKey)
    return { ok: true, value: assistantKey };
  const sameProvider = providerOf(own?.["@type"]) === input.provider;
  if (input.provider === "ollama" || (sameProvider && hasSecret(own?.apiKey)))
    return { ok: true, value: undefined };
  return { ok: false, error: "API-Schlüssel fehlt." };
};

/** The AiModel to write; without a key the saved one stays (a patch of the same provider). */
export const modelObject = (input: SpamAiSettings, apiKey: string | undefined) => ({
  "@type": MODEL_TYPE[input.provider],
  name: MODEL_NAME,
  model: input.model,
  url: input.url ? input.url : null,
  ...(apiKey ? { apiKey: { "@type": "Value", secret: apiKey } } : {}),
});

/** SpamAi switched on with Kontext's model as the only tier, or off. */
export const spamAiObject = (input: SpamAiInput, modelId?: string) =>
  input.enabled && modelId
    ? {
        "@type": "Enable",
        mode: input.mode === "shadow" ? "Shadow" : "Automatic",
        tiers: { "0": { modelId } },
        addHeader: true,
      }
    : { "@type": "Disable" };

const RELOAD: Invocation = ["x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }, "0"];

export const createSpamAi = (request: Request) => {
  const set = async (method: string, args: Record<string, unknown>): Promise<SetResult> =>
    (await request([[method, args, "0"]]))[0]![1] as SetResult;
  const outcome = (result: SetResult): Result<null> => {
    const error = firstError(result);
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  const load = async (): Promise<{ models: RawModel[]; spamAi: RawSpamAi | undefined }> => {
    const [models, spamAi] = await request([
      ["x:AiModel/get", { ids: null }, "m"],
      ["x:SpamAi/get", { ids: ["singleton"] }, "s"],
    ]);
    return {
      models: (models![1].list ?? []) as RawModel[],
      spamAi: (spamAi![1].list as RawSpamAi[] | undefined)?.[0],
    };
  };

  const read = async (assistantKey: boolean): Promise<SpamAiView> => {
    try {
      const { models, spamAi } = await load();
      return toView(models, spamAi, assistantKey);
    } catch {
      return UNKNOWN;
    }
  };

  /** Writes the model (created or updated in place), then SpamAi pointing at it. */
  const saveModel = async (
    input: SpamAiSettings,
    assistantKey?: string,
  ): Promise<Result<string>> => {
    const own = (await load()).models.find((model) => model.name === MODEL_NAME);
    const key = keyFor(input, own, assistantKey);
    if (!key.ok) return key;
    const value = modelObject(input, key.value);
    const result = await set(
      "x:AiModel/set",
      own ? { update: { [own.id]: value } } : { create: { m: value } },
    );
    const error = firstError(result);
    if (error) return { ok: false, error };
    const id = own?.id ?? result.created?.m?.id;
    return id ? { ok: true, value: id } : { ok: false, error: "KI-Modell nicht angelegt." };
  };

  const applySpamAi = async (input: SpamAiInput, modelId?: string): Promise<Result<null>> => {
    const written = outcome(
      await set("x:SpamAi/set", { update: { singleton: spamAiObject(input, modelId) } }),
    );
    // Stalwart builds the models and the filter anew only here; a bad URL or key shows up now.
    return written.ok ? outcome((await request([RELOAD]))[0]![1] as SetResult) : written;
  };

  const save = async (input: SpamAiInput, assistantKey?: string): Promise<Result<null>> => {
    if (!input.enabled) return applySpamAi(input);
    const model = await saveModel(input, assistantKey);
    return model.ok ? applySpamAi(input, model.value) : model;
  };

  /** Off, and Kontext's model with its key gone from Stalwart. */
  const remove = async (): Promise<Result<null>> => {
    const off = await applySpamAi({ enabled: false });
    if (!off.ok) return off;
    const own = (await load()).models.find((model) => model.name === MODEL_NAME);
    return own ? outcome(await set("x:AiModel/set", { destroy: [own.id] })) : off;
  };

  return { read, save, remove };
};

export type SpamAi = ReturnType<typeof createSpamAi>;

const ENTERPRISE_ONLY = "Der KI-Spamfilter braucht Stalwart Enterprise.";

/** The Firmenverwaltung's routes; behind its check (routes.ts). Changes only with Enterprise. */
export const spamAiRoutes = (
  spamAi: SpamAi,
  { settings, edition }: Pick<CompanyDeps, "settings" | "edition">,
) => {
  const app = new Hono<Env>();
  const assistantKey = async () => (await settings.assistant())?.apiKey;
  const view = async () => spamAi.read(Boolean(await assistantKey()));
  const enterprise = async () => (edition ? await edition() : "unknown") === "enterprise";
  const answer = async (result: Result<null>) =>
    result.ok ? Response.json(await view()) : bad(result.error);

  app.get("/", async (c) => c.json(await view()));
  app.put("/", async (c) => {
    if (!(await enterprise())) return c.json({ error: ENTERPRISE_ONLY }, 403);
    const body = await bodyOf(c, spamAiSchema);
    if (!body) return bad("Anbieter, Modell oder Adresse fehlt.");
    return answer(await spamAi.save(body, await assistantKey()));
  });
  app.delete("/", async (c) => {
    if (!(await enterprise())) return c.json({ error: ENTERPRISE_ONLY }, 403);
    return answer(await spamAi.remove());
  });
  return app;
};
