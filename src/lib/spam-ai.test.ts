import { describe, expect, it } from "vitest";
import { parseSpamAi, spamAiHint } from "./spam-ai";

// As `header` in crates/spam-filter/src/analysis/ai/verdict.rs writes them, unfolded (asText).
const PHISHING =
  'phishing; p=0.93; confidence=0.88; model=claude-haiku-5-5; tier=1; reason="Claims to be the bank, links go to bank-login.example"';

const verdict = (text: string) => spamAiHint(parseSpamAi(text));

describe("parseSpamAi", () => {
  it("reads category, probability, confidence and the reason", () => {
    expect(parseSpamAi(PHISHING)).toEqual({
      kind: "verdict",
      category: "phishing",
      probability: 0.93,
      confidence: 0.88,
      uncertain: false,
      shadow: false,
      reason: "Claims to be the bank, links go to bank-login.example",
    });
  });

  it("knows the flags uncertain and shadow, also after earlier tiers", () => {
    expect(
      parseSpamAi(
        "bulk_spam; p=0.51; confidence=0.40; model=gpt-x; tier=2; uncertain; tier1=newsletter/0.40; shadow",
      ),
    ).toMatchObject({ category: "bulk_spam", uncertain: true, shadow: true });
  });

  it("takes an equals sign inside the reason as text", () => {
    expect(
      parseSpamAi('legitimate; p=0.10; confidence=0.95; model=m; tier=1; reason="a=b, c"'),
    ).toMatchObject({ category: "legitimate", reason: "a=b, c" });
  });

  it("reads an error", () => {
    expect(parseSpamAi('error; tier=1; error="Request timed out"; shadow')).toEqual({
      kind: "error",
      shadow: true,
    });
  });

  it("ignores what is missing or not Stalwart's form", () => {
    expect(parseSpamAi(undefined)).toBeUndefined();
    expect(parseSpamAi(null)).toBeUndefined();
    expect(parseSpamAi("  ")).toBeUndefined();
    expect(parseSpamAi("YES")).toBeUndefined();
  });
});

describe("spamAiHint", () => {
  it("is red for phishing and malware, amber for spam", () => {
    expect(verdict(PHISHING)).toEqual({ tone: "danger", uncertain: false, category: "phishing" });
    expect(verdict("malware; p=0.9; confidence=0.9; model=m; tier=1")?.tone).toBe("danger");
    expect(verdict("bulk_spam; p=0.9; confidence=0.9; model=m; tier=1")?.tone).toBe("warn");
  });

  it("says unsure quietly", () => {
    expect(verdict("phishing; p=0.5; confidence=0.2; model=m; tier=1; uncertain")).toEqual({
      tone: "muted",
      uncertain: true,
      category: "phishing",
    });
  });

  it("stays quiet for ordinary mail, errors and the shadow mode", () => {
    expect(verdict("legitimate; p=0.05; confidence=0.9; model=m; tier=1")).toBeNull();
    expect(verdict("newsletter; p=0.2; confidence=0.9; model=m; tier=1")).toBeNull();
    expect(verdict('error; tier=1; error="x"')).toBeNull();
    expect(verdict(`${PHISHING}; shadow`)).toBeNull();
    expect(spamAiHint(undefined)).toBeNull();
  });

  it("shows a company's own category quietly", () => {
    expect(verdict("job_offer; p=0.7; confidence=0.9; model=m; tier=1")?.tone).toBe("muted");
  });
});
