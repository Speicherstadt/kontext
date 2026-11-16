/**
 * The AI spam filter's verdict (Stalwart Enterprise, src/lib/spam-ai.ts): a small note next to the
 * sender when it matters ("KI: Phishing", "KI: unsicher"), and a line in the details.
 */
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { LOCALE } from "@/lib/locale";
import { parseSpamAi, type SpamAiTone, type SpamAiVerdict, spamAiHint } from "@/lib/spam-ai";
import { m } from "@/paraglide/messages";

const CATEGORY: Record<string, () => string> = {
  legitimate: m.mail_spam_ai_legitimate,
  transactional: m.mail_spam_ai_transactional,
  newsletter: m.mail_spam_ai_newsletter,
  unsolicited_sales: m.mail_spam_ai_unsolicited_sales,
  bulk_spam: m.mail_spam_ai_bulk_spam,
  phishing: m.mail_spam_ai_phishing,
  malware: m.mail_spam_ai_malware,
};

/** Stalwart's name in words; a company's own category as it is named, without underscores. */
const categoryText = (category: string): string =>
  CATEGORY[category]?.() ?? category.replaceAll("_", " ");

const TONE: Record<SpamAiTone, string> = {
  danger: "text-danger",
  warn: "text-warn",
  muted: "text-muted",
};

export const SpamAiNote = ({ headers }: { headers: string[] | null }) => {
  const verdict = parseSpamAi(headers?.[0]);
  const hint = spamAiHint(verdict);
  if (!hint || verdict?.kind !== "verdict") return null;
  return (
    <span
      className={cn("flex items-center gap-1 text-[12px]", TONE[hint.tone])}
      title={verdict.reason ?? m.mail_spam_ai_title()}
    >
      <Sparkles size={12} aria-hidden="true" />
      {hint.uncertain
        ? m.mail_spam_ai_uncertain()
        : m.mail_spam_ai_label({ category: categoryText(hint.category) })}
    </span>
  );
};

const percent = (value: number) =>
  value.toLocaleString(LOCALE, { style: "percent", maximumFractionDigits: 0 });

/** "Phishing · 93 % · nur beobachtet", or that the model gave no answer. */
export const spamAiDetails = (verdict: SpamAiVerdict): string => {
  const shadow = verdict.shadow ? ` · ${m.mail_spam_ai_shadow()}` : "";
  if (verdict.kind === "error") return `${m.mail_spam_ai_error()}${shadow}`;
  const what = verdict.uncertain
    ? `${categoryText(verdict.category)} (${m.mail_spam_ai_unsure_word()})`
    : categoryText(verdict.category);
  return `${what} · ${percent(verdict.probability)}${shadow}`;
};
