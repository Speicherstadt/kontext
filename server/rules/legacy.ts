/**
 * The out-of-office reply from before Stalwart 1.2. VacationResponse wrote it as a Sieve script
 * named "vacation"; 1.2 keeps its reply in "managed" and neither takes the old script over nor
 * shows its text (crates/jmap/src/vacation/get.rs). Kontext reads subject, dates and text back
 * from the script, so the next save carries them into "managed" before the old script goes. The
 * script is the one 1.1 built (`build_script` in crates/jmap/src/vacation/set.rs of v1.1.1):
 *
 *   require ["vacation", "relational", "date"];
 *   if currentdate :value "ge" "iso8601" "<from>" {
 *   if currentdate :value "le" "iso8601" "<to>" {
 *   vacation :mime :subject "<subject>" "<MIME body>";
 *   }}
 */
import PostalMime from "postal-mime";
import type { Vacation } from "./filters";

export const LEGACY_VACATION_SCRIPT = "vacation";

/** A Sieve quoted string from `start` (its opening quote): the text and where it ends. */
const quoted = (script: string, start: number): { text: string; end: number } | null => {
  let text = "";
  for (let i = start + 1; i < script.length; i++) {
    const ch = script[i]!;
    if (ch === '"') return { text, end: i + 1 };
    text += ch === "\\" ? (script[++i] ?? "") : ch;
  }
  return null;
};

const dateAfter = (script: string, relation: "ge" | "le"): string | null =>
  new RegExp(`currentdate :value "${relation}" "iso8601" "([^"]+)"`).exec(script)?.[1] ?? null;

/** The reply the old script sends, or null for a script that is not one. */
export const readLegacyReply = async (
  script: string,
): Promise<Omit<Vacation, "isEnabled"> | null> => {
  const command = script.indexOf("vacation :mime ");
  if (command < 0) return null;
  let position = command + "vacation :mime ".length;
  let subject: string | null = null;
  if (script.startsWith(":subject ", position)) {
    const value = quoted(script, position + ":subject ".length);
    if (!value) return null;
    subject = value.text;
    position = value.end + 1;
  }
  const body = script[position] === '"' ? quoted(script, position) : null;
  if (!body) return null;
  const mail = await PostalMime.parse(body.text);
  return {
    subject,
    fromDate: dateAfter(script, "ge"),
    toDate: dateAfter(script, "le"),
    textBody: mail.text?.replace(/\r?\n$/, "") ?? null,
    htmlBody: mail.html ?? null,
  };
};
