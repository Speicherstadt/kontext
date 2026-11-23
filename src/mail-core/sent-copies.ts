/**
 * „Gesendete Mails ablegen“ of the shared mailboxes (lib/sent-copy.ts), as the Kontext server
 * keeps them (server/company/sent-copies.ts). Without the server, or when it fails, every
 * mailbox keeps the default.
 */
import { useQuery } from "@tanstack/react-query";
import type { SentCopy } from "@/lib/sent-copy";

export const SENT_COPIES_KEY = ["company", "sent-copies"];

export const getSentCopies = async (): Promise<Record<string, SentCopy>> => {
  const response = await fetch("/api/company/sent-copies", { credentials: "same-origin" });
  if (!response.ok) return {};
  return ((await response.json()) as { copies: Record<string, SentCopy> }).copies;
};

/** Mailbox id → its setting; only those set otherwise than the default. */
export const useSentCopies = (): Record<string, SentCopy> =>
  useQuery({
    queryKey: SENT_COPIES_KEY,
    queryFn: getSentCopies,
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? {};
