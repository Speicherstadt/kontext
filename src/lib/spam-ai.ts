/**
 * The verdict of Stalwart Enterprise's AI spam filter (server/company/spam-ai.ts), as Stalwart
 * writes it into the mail with `addHeader` (`header` in crates/spam-filter/src/analysis/ai/
 * verdict.rs of stalwartlabs/stalwart v1.1.0):
 *
 *   X-Spam-AI: phishing; p=0.93; confidence=0.88; model=claude-haiku-5-5; tier=1[; uncertain]
 *              [; tier1=newsletter/0.40][; shadow][; reason="…"]
 *   X-Spam-AI: error; tier=1; error="…"[; shadow]
 *
 * The category is one of the classifier's names (Stalwart's defaults below,
 * SpamAiProperties::default in crates/registry/src/schema/structs_impl.rs). Reasons and errors
 * come without `"` or `;` (push_reason), so a plain split is enough. Pure.
 */
import type { EmailHeader } from "@/jmap/types";

export type SpamAiVerdict =
  | {
      kind: "verdict";
      category: string;
      probability: number;
      confidence: number;
      /** Below `uncertainBelow`: Stalwart tags it AI_UNCERTAIN instead of the category. */
      uncertain: boolean;
      /** Shadow mode: written into the mail only, not counted in the spam score. */
      shadow: boolean;
      reason?: string;
    }
  | { kind: "error"; shadow: boolean };

/** Stalwart's default categories; a company may have named its own. */
export const SPAM_AI_CATEGORIES = [
  "legitimate",
  "transactional",
  "newsletter",
  "unsolicited_sales",
  "bulk_spam",
  "phishing",
  "malware",
] as const;

const QUOTED = /\b(reason|error)="([^"]*)"/g;

const numberOf = (value: string | undefined): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export type { EmailHeader };

const named = (header: EmailHeader | undefined, name: string) =>
  header?.name.toLowerCase() === name;

/** What Stalwart writes between its Received line and the spam headers. */
const BETWEEN = new Set(["authentication-results", "received-spf"]);

/**
 * Stalwart's own X-Spam-AI, or undefined. Nothing strips a header of that name that the sender put
 * into the mail, and the model is asked only about borderline mails, so the header alone proves
 * nothing. At delivery Stalwart puts one block above the mail as it came (crates/smtp/src/inbound/
 * data.rs, then `dkim + raw_headers + message` in crates/smtp/src/queue/spool.rs): its Received,
 * Authentication-Results, Received-SPF, then X-Spam-Result, X-Spam-AI, X-Spam-Score (in that order,
 * crates/spam-filter/src/analysis/score.rs), then Return-Path. So Stalwart's verdict sits right
 * between X-Spam-Result and the first X-Spam-Score, under its Received with only those two in
 * between; a sender's copy is always below Stalwart's X-Spam-Score. Pure.
 */
export const stalwartSpamAi = (headers: EmailHeader[] | null | undefined): string | undefined => {
  if (!headers) return undefined;
  const score = headers.findIndex((header) => named(header, "x-spam-score"));
  if (score < 3 || !named(headers[score - 1], "x-spam-ai")) return undefined;
  if (!named(headers[score - 2], "x-spam-result")) return undefined;
  for (let index = score - 3; index >= 0; index--) {
    const header = headers[index]!;
    if (named(header, "received")) return headers[score - 1]!.value.replace(/\r?\n[ \t]+/g, " ");
    if (!BETWEEN.has(header.name.toLowerCase())) return undefined;
  }
  return undefined;
};

/** An X-Spam-AI value (from stalwartSpamAi) read; else undefined. */
export const parseSpamAi = (header: string | null | undefined): SpamAiVerdict | undefined => {
  if (!header?.trim()) return undefined;
  const quoted: Record<string, string> = {};
  const rest = header.replace(QUOTED, (_, key: string, value: string) => {
    quoted[key] = value.trim();
    return "";
  });
  const [first = "", ...parts] = rest.split(";").map((part) => part.trim());
  const flags = new Set(parts.filter((part) => part && !part.includes("=")));
  const values = Object.fromEntries(
    parts.flatMap((part) => {
      const at = part.indexOf("=");
      return at > 0 ? [[part.slice(0, at).trim(), part.slice(at + 1).trim()]] : [];
    }),
  );
  const shadow = flags.has("shadow");
  if (first === "error") return { kind: "error", shadow };
  if (!first || values.p === undefined) return undefined;
  return {
    kind: "verdict",
    category: first,
    probability: numberOf(values.p),
    confidence: numberOf(values.confidence),
    uncertain: flags.has("uncertain"),
    shadow,
    ...(quoted.reason ? { reason: quoted.reason } : {}),
  };
};

/** How loud the hint in the reading pane is. */
export type SpamAiTone = "danger" | "warn" | "muted";

const TONE: Record<string, SpamAiTone> = {
  phishing: "danger",
  malware: "danger",
  bulk_spam: "warn",
  unsolicited_sales: "warn",
};

/** Ordinary mail needs no hint: the verdict is in the details only. */
const QUIET = new Set(["legitimate", "transactional", "newsletter"]);

/**
 * Whether the reading pane shows a hint next to the sender, and how: for phishing and malware in
 * red, for spam and unsolicited sales in amber, "unsure" and a company's own categories quietly.
 * Ordinary mail, errors and the shadow mode (which the admin uses to try the filter out) only in
 * the details.
 */
export const spamAiHint = (
  verdict: SpamAiVerdict | undefined,
): { tone: SpamAiTone; uncertain: boolean; category: string } | null => {
  if (!verdict || verdict.kind === "error" || verdict.shadow) return null;
  if (verdict.uncertain) return { tone: "muted", uncertain: true, category: verdict.category };
  if (QUIET.has(verdict.category)) return null;
  return { tone: TONE[verdict.category] ?? "muted", uncertain: false, category: verdict.category };
};
