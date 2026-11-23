/**
 * „Gesendete Mails ablegen“ per shared mailbox (src/lib/sent-copy.ts): a company_setting
 * (settings.ts). Everyone signed in reads it, because their composer decides with it where a mail
 * sent as a shared mailbox's address is kept; only the Firmenverwaltung changes it, with the
 * mailbox (mailboxes.ts).
 */
import { z } from "zod";
import { SENT_COPIES, type SentCopy } from "../../src/lib/sent-copy";
import type { CompanyDeps } from "./context";

export const sentCopySchema = z.enum(SENT_COPIES);

/** For everyone signed in; null for a request without a session. */
export const readSentCopies =
  ({ currentEmail, settings }: Pick<CompanyDeps, "currentEmail" | "settings">) =>
  async (request: Request): Promise<{ copies: Record<string, SentCopy> } | null> =>
    (await currentEmail(request)) ? { copies: await settings.sentCopies() } : null;
