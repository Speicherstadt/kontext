/**
 * Lesebestätigungen (RFC 8098 / JMAP MDN RFC 9007): Hilfsfunktionen für den lesbaren Text beim
 * Versand über `MDN/send`, das Erkennen eingehender Bestätigungen und die Zuordnung zu gesendeten
 * Mails. Das MIME-Format baut und liest Stalwart 1.2 selbst (`MDN/send`, `MDN/parse`).
 */
import { LOCALE } from "./locale";

/** Schlagwort auf einer Mail, sobald die Bestätigung gesendet oder abgelehnt wurde (RFC 3503). */
export const MDN_SENT = "$MDNSent";

/** Lesbarer Textteil für `MDN/send` (`textBody`). */
export const receiptText = ({
  from,
  original,
}: {
  from: { name: string | null; email: string };
  original: { subject: string; sentAt: string };
}): string => {
  const when = new Date(original.sentAt).toLocaleString(LOCALE, {
    timeZone: "Europe/Berlin",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return [
    `Ihre Nachricht „${original.subject}“ vom ${when}`,
    `wurde von ${from.name ? `${from.name} <${from.email}>` : from.email} geöffnet.`,
    "",
    "Das sagt nur, dass sie angezeigt wurde – nicht, dass sie gelesen oder verstanden wurde.",
  ].join("\n");
};

/** Ob die Bestätigung schon beantwortet wurde (Stalwart liefert Schlagworte klein: "$mdnsent"). */
export const receiptAnswered = (keywords: Record<string, boolean>): boolean =>
  Object.keys(keywords).some((keyword) => keyword.toLowerCase() === MDN_SENT.toLowerCase());

/** Ob eine Mail laut Content-Type-Header eine Lesebestätigung ist. */
export const isReceipt = (contentType: string | null | undefined): boolean =>
  /multipart\/report/i.test(contentType ?? "") &&
  /report-type\s*=\s*"?disposition-notification/i.test(contentType ?? "");

/** "<a@b>" → "a@b"; JMAP liefert Message-IDs ohne spitze Klammern (RFC 8621 §4.1.2.5). */
export const bareMessageId = (value: string): string | null =>
  /<([^<>\s]+)>/.exec(value)?.[1] ?? (/^[^<>\s]+$/.test(value.trim()) ? value.trim() : null);

/**
 * Die Message-IDs, die eine Bestätigung nennt: `In-Reply-To` und `References` aus ihren Headern
 * sowie `originalMessageId` aus `MDN/parse`.
 */
export const receiptTargets = (
  mail: { inReplyTo: string[] | null; references: string[] | null },
  originalMessageId: string | null,
): string[] => {
  const original = originalMessageId ? bareMessageId(originalMessageId) : null;
  return [
    ...new Set([
      ...(mail.inReplyTo ?? []),
      ...(mail.references ?? []),
      ...(original ? [original] : []),
    ]),
  ];
};

/** Eine gesendete Mail, soweit die Ablage von Lesebestätigungen sie braucht. */
export type SentMail = { messageId: string[] | null; receiptTo: unknown[] | null };

/** Nur Bestätigungen für gesendete Mails, die auch um eine gebeten haben, werden abgelegt. */
export const receiptsForSent = <R extends { targets: string[] }>(
  receipts: R[],
  sent: SentMail[],
): R[] => {
  const asked = new Set(
    sent.filter((mail) => mail.receiptTo?.length).flatMap((mail) => mail.messageId ?? []),
  );
  return receipts.filter((receipt) => receipt.targets.some((id) => asked.has(id)));
};
