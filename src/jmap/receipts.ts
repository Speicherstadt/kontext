/**
 * Lesebestätigungen über JMAP MDN (RFC 9007, Stalwart 1.2: `MDN/send` in `crates/jmap/src/mdn/send.rs`,
 * `MDN/parse` in `crates/jmap/src/mdn/parse.rs`): Bestätigungen senden (mit `onSuccessUpdateEmail`
 * für `$mdnsent`), eingehende Bestätigungen für eine gesendete Mail finden und im Posteingang
 * still ablegen.
 */

import { isReceipt, receiptsForSent, receiptTargets, type SentMail } from "@/lib/mdn";
import { CAPABILITIES, type JmapClient } from "./client";
import { searchPages } from "./search-pages";
import type { EmailAddress } from "./types";

const MDN_USING = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.mdn];

export type Receipt = {
  id: string;
  blobId: string;
  from: EmailAddress[] | null;
  receivedAt: string;
  inReplyTo: string[] | null;
  references: string[] | null;
  "header:Content-Type": string | null;
};

/** Eine Bestätigung mit den Message-IDs, die sie bestätigt. */
export type ReadReceipt = Receipt & { targets: string[] };

const RECEIPT_QUERY = {
  properties: ["blobId", "from", "receivedAt", "inReplyTo", "references", "header:Content-Type"],
};

/** Seiten, die eine Suche höchstens liest (500 Mails dieser Absender nach dem Senden). */
const MAX_PAGES = 10;
/** Höchstens so viele Empfänger; eine Mail an mehr ist ein Rundschreiben. */
const MAX_PEOPLE = 20;

const keepReceipt = (mail: Receipt) => isReceipt(mail["header:Content-Type"]);

/**
 * Sendet eine Lesebestätigung über `MDN/send` (RFC 9007 §2.1) und setzt `$mdnsent` atomar per
 * `onSuccessUpdateEmail`. Stalwart baut das MIME-Format und versendet ohne Kopie in „Gesendet“.
 */
export const sendReceipt = async (
  client: JmapClient,
  accountId: string,
  identityId: string,
  forEmailId: string,
  { subject, textBody }: { subject: string; textBody: string },
): Promise<void> => {
  const [response] = await client.request(
    [
      [
        "MDN/send",
        {
          accountId,
          identityId,
          send: {
            r: {
              forEmailId,
              subject,
              textBody,
              reportingUA: "Kontext",
              disposition: {
                actionMode: "manual-action",
                sendingMode: "mdn-sent-manually",
                type: "displayed",
              },
            },
          },
          onSuccessUpdateEmail: { "#r": { "keywords/$mdnsent": true } },
        },
        "m",
      ],
    ],
    MDN_USING,
  );
  const result = response![1] as {
    sent?: Record<string, unknown>;
    notSent?: Record<string, { description?: string; type?: string }>;
  };
  if (!result.sent?.r) {
    const err = result.notSent?.r;
    throw new Error(err?.description ?? err?.type ?? "MDN/send fehlgeschlagen");
  }
};

/** Stalwart 1.2 begrenzt `MDN/parse` standardmäßig auf `parseLimitEmail = 10` (`structs_impl.rs`). */
const MAX_PARSE_BLOBS = 10;

/**
 * Ermittelt die bestätigten Message-IDs: zuerst aus den eigenen Headern; nur wenn diese die
 * gesuchte Mail noch nicht nennen (oder alle gefragt sind), liest `MDN/parse` den Bericht.
 */
const parseReceiptTargets = async (
  client: JmapClient,
  accountId: string,
  mails: Receipt[],
  wanted?: string,
): Promise<ReadReceipt[]> => {
  const blobIds = [
    ...new Set(
      mails
        .filter((mail) => {
          const fromHeaders = receiptTargets(mail, null);
          return !(wanted && fromHeaders.includes(wanted)) && Boolean(mail.blobId);
        })
        .map((mail) => mail.blobId),
    ),
  ];
  const parsed: Record<string, { originalMessageId?: string | null }> = {};
  for (let offset = 0; offset < blobIds.length; offset += MAX_PARSE_BLOBS) {
    const batch = blobIds.slice(offset, offset + MAX_PARSE_BLOBS);
    const [response] = await client.request(
      [["MDN/parse", { accountId, blobIds: batch }, "p"]],
      MDN_USING,
    );
    Object.assign(
      parsed,
      (response![1] as { parsed?: Record<string, { originalMessageId?: string | null }> }).parsed ??
        {},
    );
  }
  return mails.map((mail) => ({
    ...mail,
    targets: receiptTargets(mail, parsed[mail.blobId]?.originalMessageId ?? null),
  }));
};

/** "after" eine Minute früher: die Bestätigung kann dieselbe Sekunde tragen wie die Mail. */
const afterOf = (time: number) => new Date(time - 60_000).toISOString().replace(/\.\d+Z$/, "Z");

/** Die Lesebestätigungen für eine gesendete Mail. */
export const receiptsFor = async (
  client: JmapClient,
  accountId: string,
  {
    messageId,
    subject,
    sentAt,
    recipients,
  }: {
    messageId: string;
    subject: string;
    sentAt: string;
    recipients: string[];
  },
): Promise<ReadReceipt[]> => {
  const who = [
    ...(subject ? [{ subject }] : []),
    ...recipients.slice(0, MAX_PEOPLE).map((email) => ({ from: email })),
  ];
  const after = { after: afterOf(Date.parse(sentAt)) };
  const filter = who.length
    ? { operator: "AND", conditions: [after, { operator: "OR", conditions: who }] }
    : after;
  const found = await searchPages(
    client,
    accountId,
    { filter, ...RECEIPT_QUERY },
    keepReceipt,
    who.length ? MAX_PAGES : 1,
  );
  const read = await parseReceiptTargets(client, accountId, found, messageId);
  return read.filter((mail) => mail.targets.includes(messageId));
};

/** Wie weit zurück ungelesene Bestätigungen im Posteingang abgelegt werden. */
const RECENT_DAYS = 14;
/** Höchstens so viele gesendete Mails an die Absender der Bestätigungen, neueste zuerst. */
const SENT_LIMIT = 200;

const sentTo = async (
  client: JmapClient,
  accountId: string,
  sentId: string,
  people: string[],
): Promise<SentMail[]> => {
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: {
          operator: "AND",
          conditions: [
            { inMailbox: sentId },
            {
              operator: "OR",
              conditions: people.flatMap((email) => [{ to: email }, { cc: email }, { bcc: email }]),
            },
          ],
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit: SENT_LIMIT,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["messageId", "header:Disposition-Notification-To:asAddresses"],
      },
      "g",
    ],
  ]);
  const list = (got![1] as { list?: Record<string, unknown>[] }).list ?? [];
  return list.map((mail) => ({
    messageId: (mail.messageId as string[] | null) ?? null,
    receiptTo: (mail["header:Disposition-Notification-To:asAddresses"] as unknown[] | null) ?? null,
  }));
};

/** Ungelesene Bestätigungen der letzten Tage im Posteingang für eigene gesendete Mails. */
export const receiptsToFile = async (
  client: JmapClient,
  accountId: string,
  { inboxId, sentId }: { inboxId: string; sentId: string },
  now: Date,
): Promise<string[]> => {
  const filter = {
    operator: "AND",
    conditions: [
      { inMailbox: inboxId },
      { notKeyword: "$seen" },
      { after: afterOf(now.getTime() - RECENT_DAYS * 86_400_000) },
    ],
  };
  const found = await searchPages(
    client,
    accountId,
    { filter, newestFirst: true, ...RECEIPT_QUERY },
    keepReceipt,
    2,
  );
  if (!found.length) return [];
  const read = await parseReceiptTargets(client, accountId, found);
  const people = [
    ...new Set(read.flatMap((mail) => mail.from ?? []).map((a) => a.email.toLowerCase())),
  ].slice(0, MAX_PEOPLE);
  if (!people.length) return [];
  const sent = await sentTo(client, accountId, sentId, people);
  return receiptsForSent(read, sent).map((mail) => mail.id);
};
