import { describe, expect, it } from "vitest";
import { parseSpamAi, spamAiHint, stalwartSpamAi } from "./spam-ai";

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

// Header fields as JMAP's `headers` lists them: Stalwart's block on top (crates/smtp/src/inbound/
// data.rs), then the mail as the sender sent it.
const h = (name: string, value: string) => ({ name, value: ` ${value}` });
const STALWART_BLOCK = [
  h("Received", "from mail.bank-sicher.test by mx.weber-haustechnik.test (Stalwart SMTP)"),
  h("Authentication-Results", "mx.weber-haustechnik.test; spf=pass"),
  h("Received-SPF", "pass"),
  h("X-Spam-Result", "AI_PHISHING_HIGH (5.00)"),
];
const SENDER_PART = [h("From", "Sparkasse <service@bank-sicher.test>"), h("Subject", "Ihr Konto")];
const LEGITIMATE = "legitimate; p=0.02; confidence=0.99; model=m; tier=1";

describe("stalwartSpamAi", () => {
  it("takes Stalwart's header between X-Spam-Result and X-Spam-Score, unfolded", () => {
    const headers = [
      ...STALWART_BLOCK,
      h(
        "X-Spam-AI",
        'phishing; p=0.93; confidence=0.88; model=m; tier=1; reason="Gibt\r\n\tsich aus"',
      ),
      h("X-Spam-Score", "spam, score=9.10"),
      h("Return-Path", "<service@bank-sicher.test>"),
      ...SENDER_PART,
    ];
    const value = stalwartSpamAi(headers);
    expect(parseSpamAi(value)).toMatchObject({ category: "phishing", reason: "Gibt sich aus" });
  });

  it("ignores a header the sender put below Stalwart's spam headers", () => {
    const headers = [
      ...STALWART_BLOCK,
      h("X-Spam-Score", "spam, score=9.10"),
      h("Return-Path", "<service@bank-sicher.test>"),
      h("Received", "from client by mail.bank-sicher.test"),
      h("X-Spam-Result", "AI_LEGITIMATE_HIGH (-5.00)"),
      h("X-Spam-AI", LEGITIMATE),
      h("X-Spam-Score", "ham, score=-5.00"),
      ...SENDER_PART,
    ];
    expect(stalwartSpamAi(headers)).toBeUndefined();
  });

  it("ignores a forged block in a mail without any Received line", () => {
    const headers = [
      h("X-Spam-Result", "AI_LEGITIMATE_HIGH (-5.00)"),
      h("X-Spam-AI", LEGITIMATE),
      h("X-Spam-Score", "ham, score=-5.00"),
      ...SENDER_PART,
    ];
    expect(stalwartSpamAi(headers)).toBeUndefined();
  });

  it("ignores a header that is not inside Stalwart's block", () => {
    const headers = [
      h("Received", "from mail.bank-sicher.test by mx.weber-haustechnik.test (Stalwart SMTP)"),
      h("Subject", "Ihr Konto"),
      h("X-Spam-Result", "x"),
      h("X-Spam-AI", LEGITIMATE),
      h("X-Spam-Score", "ham, score=-5.00"),
    ];
    expect(stalwartSpamAi(headers)).toBeUndefined();
  });

  it("finds nothing without headers", () => {
    expect(stalwartSpamAi(undefined)).toBeUndefined();
    expect(stalwartSpamAi(null)).toBeUndefined();
    expect(stalwartSpamAi(SENDER_PART)).toBeUndefined();
  });
});
