import { describe, expect, it } from "vitest";
import type { Invocation } from "./management";
import type { CompanySettings } from "./settings";
import {
  createSpamAi,
  keyFor,
  MODEL_NAME,
  modelObject,
  type RawModel,
  type RawSpamAi,
  type SpamAiSettings,
  spamAiObject,
  spamAiRoutes,
  toView,
} from "./spam-ai";

const anthropic: SpamAiSettings = {
  enabled: true,
  provider: "anthropic",
  model: "claude-haiku-5-5",
  mode: "automatic",
};

// As x:AiModel/get answers: the key masked (SecretKeyValue::into_value_with, structs_impl.rs).
const ownModel: RawModel = {
  id: "m1",
  "@type": "Anthropic",
  name: MODEL_NAME,
  model: "claude-haiku-5-5",
  url: null,
  apiKey: { "@type": "Value" },
};

describe("toView", () => {
  it("shows Kontext's model, whether a key is saved and the mode", () => {
    const spamAi: RawSpamAi = {
      "@type": "Enable",
      mode: "Shadow",
      tiers: { "0": { modelId: "m1" } },
    };
    expect(toView([ownModel], spamAi, true)).toEqual({
      known: true,
      enabled: true,
      provider: "anthropic",
      model: "claude-haiku-5-5",
      url: "",
      hasKey: true,
      mode: "shadow",
      external: false,
      assistantKey: true,
    });
  });

  it("marks a filter switched on with a model made outside Kontext", () => {
    const other: RawModel = { id: "x", "@type": "OpenAi", name: "Admin's", model: "gpt" };
    const view = toView([other], { "@type": "Enable", tiers: { "0": { modelId: "x" } } }, false);
    expect(view).toMatchObject({ enabled: true, external: true, provider: null, hasKey: false });
  });

  it("is off without settings", () => {
    expect(toView([], { "@type": "Disable" }, false)).toMatchObject({
      enabled: false,
      external: false,
      mode: "automatic",
    });
  });
});

describe("keyFor", () => {
  it("takes a new key first", () => {
    expect(keyFor({ ...anthropic, apiKey: "sk-new-key" }, ownModel, "sk-assistant")).toEqual({
      ok: true,
      value: "sk-new-key",
    });
  });

  it("takes the assistant's key only for Anthropic", () => {
    expect(keyFor({ ...anthropic, useAssistantKey: true }, undefined, "sk-assistant")).toEqual({
      ok: true,
      value: "sk-assistant",
    });
    const openai = { ...anthropic, provider: "openai" as const, useAssistantKey: true };
    expect(keyFor(openai, undefined, "sk-assistant").ok).toBe(false);
  });

  it("keeps the saved key for the same provider, not for another", () => {
    expect(keyFor(anthropic, ownModel, undefined)).toEqual({ ok: true, value: undefined });
    expect(keyFor({ ...anthropic, provider: "gemini" }, ownModel, undefined)).toEqual({
      ok: false,
      error: "API-Schlüssel fehlt.",
    });
  });

  it("needs no key for Ollama", () => {
    expect(keyFor({ ...anthropic, provider: "ollama" }, undefined, undefined).ok).toBe(true);
  });
});

describe("the objects for Stalwart", () => {
  it("writes the model with the provider's type, the key only when given", () => {
    expect(
      modelObject({ ...anthropic, provider: "ollama", url: "http://ai:11434" }, undefined),
    ).toEqual({
      "@type": "Ollama",
      name: MODEL_NAME,
      model: "claude-haiku-5-5",
      url: "http://ai:11434",
    });
    expect(modelObject(anthropic, "sk-ant-x")).toEqual({
      "@type": "Anthropic",
      name: MODEL_NAME,
      model: "claude-haiku-5-5",
      url: null,
      apiKey: { "@type": "Value", secret: "sk-ant-x" },
    });
  });

  it("switches SpamAi on with the model as the only tier and the header, or off", () => {
    expect(spamAiObject({ ...anthropic, mode: "shadow" }, "m1")).toEqual({
      "@type": "Enable",
      mode: "Shadow",
      tiers: { "0": { modelId: "m1" } },
      addHeader: true,
    });
    expect(spamAiObject({ enabled: false })).toEqual({ "@type": "Disable" });
  });
});

/** A Stalwart that answers the calls in order and keeps them. */
const fakeStalwart = (models: RawModel[] = [], fail?: string) => {
  const calls: Invocation[] = [];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> => {
    calls.push(...methodCalls);
    return methodCalls.map(([name, args, id]) => {
      if (name === "x:AiModel/get") return [name, { list: models }, id];
      if (name === "x:SpamAi/get") return [name, { list: [{ "@type": "Disable" }] }, id];
      if (name === "x:Action/set" && fail)
        return [name, { notCreated: { r: { type: "invalidProperties", description: fail } } }, id];
      if (name === "x:AiModel/set" && args.create)
        return [name, { created: { m: { id: "m9" } } }, id];
      return [name, {}, id];
    });
  };
  return { calls, spamAi: createSpamAi(request) };
};

const names = (calls: Invocation[]) => calls.map(([name]) => name);

describe("createSpamAi", () => {
  it("creates the model, points SpamAi at it and reloads", async () => {
    const stalwart = fakeStalwart();
    expect(await stalwart.spamAi.save({ ...anthropic, apiKey: "sk-ant-key" })).toEqual({
      ok: true,
      value: null,
    });
    expect(names(stalwart.calls)).toEqual([
      "x:AiModel/get",
      "x:SpamAi/get",
      "x:AiModel/set",
      "x:SpamAi/set",
      "x:Action/set",
    ]);
    expect(stalwart.calls[3]![1]).toMatchObject({
      update: { singleton: { tiers: { "0": { modelId: "m9" } } } },
    });
  });

  it("updates its own model in place, keeping the key", async () => {
    const stalwart = fakeStalwart([ownModel]);
    await stalwart.spamAi.save({ ...anthropic, model: "claude-sonnet-5-5" });
    const update = stalwart.calls[2]![1].update as Record<string, Record<string, unknown>>;
    expect(update.m1).toMatchObject({ model: "claude-sonnet-5-5" });
    expect(update.m1).not.toHaveProperty("apiKey");
  });

  it("refuses a new provider without a key, before writing anything", async () => {
    const stalwart = fakeStalwart([ownModel]);
    expect(await stalwart.spamAi.save({ ...anthropic, provider: "openai" })).toEqual({
      ok: false,
      error: "API-Schlüssel fehlt.",
    });
    expect(names(stalwart.calls)).not.toContain("x:AiModel/set");
  });

  it("passes on Stalwart's refusal when it reloads", async () => {
    const stalwart = fakeStalwart([], "Invalid AI model URL");
    expect(await stalwart.spamAi.save({ ...anthropic, apiKey: "sk-ant-key" })).toEqual({
      ok: false,
      error: "Invalid AI model URL",
    });
  });

  it("switching off writes Disable and reloads, the model stays", async () => {
    const stalwart = fakeStalwart([ownModel]);
    await stalwart.spamAi.save({ enabled: false });
    expect(names(stalwart.calls)).toEqual(["x:SpamAi/set", "x:Action/set"]);
  });

  it("removing switches off, then deletes its model", async () => {
    const stalwart = fakeStalwart([ownModel]);
    await stalwart.spamAi.remove();
    expect(stalwart.calls.at(-1)).toEqual(["x:AiModel/set", { destroy: ["m1"] }, "0"]);
  });

  it("reads as unknown when the key lacks the rights", async () => {
    const spamAi = createSpamAi(async () => {
      throw new Error("forbidden");
    });
    expect((await spamAi.read(false)).known).toBe(false);
  });
});

describe("spamAiRoutes", () => {
  const setup = (edition: "community" | "enterprise", models: RawModel[] = []) => {
    const stalwart = fakeStalwart(models);
    const settings = {
      assistant: async () => ({ apiKey: "sk-ant-assistant-key", model: "claude-sonnet-5-5" }),
    } as unknown as CompanySettings;
    const app = spamAiRoutes(stalwart.spamAi, { settings, edition: async () => edition });
    const send = (method: string, body?: unknown) =>
      app.request("/", {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { stalwart, send };
  };

  it("shows the settings and whether the assistant's key could be used", async () => {
    const view = await (await setup("enterprise", [ownModel]).send("GET")).json();
    expect(view).toMatchObject({ known: true, provider: "anthropic", assistantKey: true });
  });

  it("refuses changes without Enterprise and writes nothing", async () => {
    const { stalwart, send } = setup("community");
    const response = await send("PUT", { ...anthropic, apiKey: "sk-ant-key" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Der KI-Spamfilter braucht Stalwart Enterprise.",
    });
    expect((await send("DELETE")).status).toBe(403);
    expect(names(stalwart.calls)).toEqual([]);
  });

  it("writes the assistant's key into Stalwart when asked to", async () => {
    const { stalwart, send } = setup("enterprise");
    const response = await send("PUT", { ...anthropic, useAssistantKey: true });
    expect(response.status).toBe(200);
    const create = stalwart.calls.find(([name]) => name === "x:AiModel/set")![1].create as Record<
      string,
      Record<string, unknown>
    >;
    expect(create.m!.apiKey).toEqual({ "@type": "Value", secret: "sk-ant-assistant-key" });
  });

  it("refuses an incomplete form", async () => {
    const response = await setup("enterprise").send("PUT", {
      enabled: true,
      provider: "anthropic",
    });
    expect(response.status).toBe(400);
  });
});
