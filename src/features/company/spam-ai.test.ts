import { describe, expect, it } from "vitest";
import { initialForm, missing, requestOf, type SpamAiView } from "./spam-ai";

const off: SpamAiView = {
  known: true,
  enabled: false,
  provider: null,
  model: "",
  url: "",
  hasKey: false,
  mode: "automatic",
  external: false,
  assistantKey: false,
};

const saved: SpamAiView = {
  ...off,
  enabled: true,
  provider: "anthropic",
  model: "claude-haiku-5-5",
  hasKey: true,
};

describe("the KI-Spamfilter form", () => {
  it("starts with Anthropic and a small model when nothing is set up", () => {
    expect(initialForm(off)).toMatchObject({
      enabled: false,
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
  });

  it("needs a key, unless one is saved for the same provider or the assistant's is used", () => {
    const form = { ...initialForm(off), enabled: true };
    expect(missing(form, off)).toBe("key");
    expect(missing({ ...form, apiKey: "sk-ant-x" }, off)).toBeNull();
    expect(missing({ ...initialForm(saved) }, saved)).toBeNull();
    expect(missing({ ...initialForm(saved), provider: "openai", model: "gpt" }, saved)).toBe("key");
    expect(missing({ ...form, useAssistantKey: true }, { ...off, assistantKey: true })).toBeNull();
  });

  it("needs the server's address for Ollama, and a model", () => {
    const form = {
      ...initialForm(off),
      enabled: true,
      provider: "ollama" as const,
      model: "llama",
    };
    expect(missing(form, off)).toBe("url");
    expect(missing({ ...form, url: "http://ai:11434" }, off)).toBeNull();
    expect(missing({ ...form, model: " " }, off)).toBe("model");
  });

  it("sends only what applies", () => {
    expect(requestOf(initialForm(off), off)).toEqual({ enabled: false });
    expect(requestOf({ ...initialForm(saved), mode: "shadow" }, saved)).toEqual({
      enabled: true,
      provider: "anthropic",
      model: "claude-haiku-5-5",
      url: "",
      mode: "shadow",
    });
    const withAssistant = { ...off, assistantKey: true };
    expect(
      requestOf({ ...initialForm(off), enabled: true, useAssistantKey: true }, withAssistant),
    ).toMatchObject({ useAssistantKey: true });
    expect(
      requestOf(
        { ...initialForm(off), enabled: true, provider: "ollama", apiKey: "x", url: " http://ai " },
        off,
      ),
    ).toEqual({
      enabled: true,
      provider: "ollama",
      model: "claude-haiku-5-5",
      url: "http://ai",
      mode: "automatic",
    });
  });
});
