/** Mail operations on top of the JMAP client (RFC 8621). Each function is one round-trip. */

import { ASSIGNMENT_NAMESPACE, type AssignmentView, assignmentConditions } from "@/lib/assignment";
import type { Snippet } from "@/lib/attachment-hit";
import type { Comparator } from "@/lib/mail-sort";
import { CAPABILITIES, type Invocation, type JmapClient } from "./client";
import type { BodyPart, EmailDetail, EmailSummary, Identity, Mailbox } from "./types";

/**
 * Every Authentication-Results header (`:all`, topmost first, RFC 8621 §4.1.3): the sender check
 * of the reading pane, and in the list whether a row may show the sender's photo (lib/photo.ts
 * `mailSenderKey`). Without `:all` JMAP returns the bottommost one, which the sender may have
 * written themselves.
 */
export const AUTHENTICATION_RESULTS = "header:Authentication-Results:asText:all";

export const SUMMARY_PROPERTIES = [
  "threadId",
  "mailboxIds",
  "keywords",
  "from",
  "to",
  "subject",
  "receivedAt",
  "preview",
  "hasAttachment",
  "size",
  // Raw, as Stalwart names it: shows an encrypted mail in the list (src/lib/pgp-mail.ts).
  "header:Content-Type",
  // Who takes care of it in a shared mailbox (src/lib/assignment.ts); Kontext's namespace only.
  `metadata/${ASSIGNMENT_NAMESPACE}`,
  // Raw too: whether the row's picture may show the sender (lib/row-face.ts).
  AUTHENTICATION_RESULTS,
];

const DETAIL_PROPERTIES = [
  ...SUMMARY_PROPERTIES,
  "blobId",
  "cc",
  "bcc",
  "replyTo",
  "sentAt",
  "messageId",
  "references",
  "inReplyTo",
  "htmlBody",
  "textBody",
  "attachments",
  "bodyStructure",
  "bodyValues",
  // All header fields in order: only so is Stalwart's X-Spam-AI told from a forged one (src/lib/spam-ai.ts).
  "headers",
];

const BODY_PROPERTIES = [
  "partId",
  "blobId",
  "type",
  "name",
  "size",
  "cid",
  "disposition",
  // bodyStructure's tree (signedOverEncrypted in src/lib/smime.ts); leaves have none.
  "subParts",
];

/** Headers for the sender check, by the field of EmailDetail they are put under. */
export const CHECK_HEADERS = {
  authenticationResults: AUTHENTICATION_RESULTS,
  spamScore: "header:X-Spam-Score:asText:all",
  /** Its type, raw (Stalwart names raw headers without ":asRaw"): an encrypted or signed mail. */
  contentType: "header:Content-Type",
  /** The sender's public key, if they send it along (src/lib/pgp.ts). */
  autocrypt: "header:Autocrypt:asText",
  /** How it came to the own server, topmost first (src/lib/transport.ts). */
  received: "header:Received:all",
  /** Who asks for a read receipt (RFC 8098). */
  receiptTo: "header:Disposition-Notification-To:asAddresses",
  /** How to unsubscribe from a newsletter (RFC 2369, RFC 8058). */
  unsubscribe: "header:List-Unsubscribe:asURLs",
  unsubscribePost: "header:List-Unsubscribe-Post:asText",
} as const;

export const listMailboxes = async (client: JmapClient, accountId: string): Promise<Mailbox[]> => {
  const { list } = await client.call<{ list: Mailbox[] }>("Mailbox/get", {
    accountId,
    properties: [
      "name",
      "parentId",
      "role",
      "sortOrder",
      "totalEmails",
      "unreadEmails",
      "myRights",
    ],
  });
  return list;
};

/** One folder (optionally only unread), or a prepared search filter (src/lib/mail-search.ts). */
export type EmailFilter =
  | {
      mailboxId: string;
      unreadOnly?: boolean;
      /** In a shared mailbox: the open mails of `me`, or all open ones (lib/assignment.ts). */
      assignment?: { view: AssignmentView; me: string };
    }
  | { search: Record<string, unknown> };

export const emailQueryFilter = (filter: EmailFilter): Record<string, unknown> => {
  if ("search" in filter) return filter.search;
  const conditions: Record<string, unknown>[] = [{ inMailbox: filter.mailboxId }];
  if (filter.unreadOnly) conditions.push({ notKeyword: "$seen" });
  if (filter.assignment)
    conditions.push(...assignmentConditions(filter.assignment.view, filter.assignment.me));
  return conditions.length === 1 ? conditions[0]! : { operator: "AND", conditions };
};

export type EmailPage = { emails: EmailSummary[]; total: number; position: number };

export const queryEmails = async (
  client: JmapClient,
  accountId: string,
  filter: EmailFilter,
  position: number,
  limit = 50,
  {
    collapseThreads = false,
    sort = [{ property: "receivedAt", isAscending: false }],
  }: {
    /** One mail per conversation, the first in the list's order (RFC 8621 §4.4.3). */
    collapseThreads?: boolean;
    /** The order (RFC 8621 §4.4.2), newest first by default; src/lib/mail-sort.ts. */
    sort?: Comparator[];
  } = {},
): Promise<EmailPage> => {
  const queryFilter = emailQueryFilter(filter);
  const search = "search" in filter;
  const calls = (withSnippets: boolean): Invocation[] => [
    [
      "Email/query",
      {
        accountId,
        filter: queryFilter,
        sort,
        collapseThreads,
        position,
        limit,
        calculateTotal: true,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        // A search also finds a word in Cc and Bcc (lib/attachment-hit.ts).
        properties: search ? [...SUMMARY_PROPERTIES, "cc", "bcc"] : SUMMARY_PROPERTIES,
      },
      "g",
    ],
    // A search also asks what it marks, to tell hits in an attachment (lib/attachment-hit.ts).
    ...(withSnippets
      ? [
          [
            "SearchSnippet/get",
            {
              accountId,
              filter: queryFilter,
              "#emailIds": { resultOf: "q", name: "Email/query", path: "/ids" },
            },
            "s",
          ] as Invocation,
        ]
      : []),
  ];
  // The snippets only add the chip: when Stalwart refuses them, the search still shows its hits.
  const [query, get, snippets] = search
    ? await client.request(calls(true)).catch(() => client.request(calls(false)))
    : await client.request(calls(false));
  const marked = new Map(
    ((snippets?.[1].list ?? []) as (Snippet & { emailId: string })[]).map(
      ({ emailId, subject, preview }) => [emailId, { subject, preview }],
    ),
  );
  const emails = (get![1].list as EmailSummary[]) ?? [];
  return {
    emails: marked.size
      ? emails.map((email) => {
          const snippet = marked.get(email.id);
          return snippet ? { ...email, snippet } : email;
        })
      : emails,
    total: Number(query![1].total ?? 0),
    position,
  };
};

export const getEmail = async (
  client: JmapClient,
  accountId: string,
  id: string,
): Promise<EmailDetail | null> => {
  const { list } = await client.call<{ list: Record<string, unknown>[] }>("Email/get", {
    accountId,
    ids: [id],
    properties: [...new Set([...DETAIL_PROPERTIES, ...Object.values(CHECK_HEADERS)])],
    bodyProperties: BODY_PROPERTIES,
    fetchHTMLBodyValues: true,
    fetchTextBodyValues: true,
    maxBodyValueBytes: 2_000_000,
  });
  const email = list[0];
  if (!email) return null;
  const headers = Object.fromEntries(
    Object.entries(CHECK_HEADERS).map(([field, property]) => [field, email[property] ?? null]),
  );
  return { ...email, ...headers } as EmailDetail;
};

/** Emails exchanged with an address, newest first, for the contact view. */
export const emailsWithAddress = async (
  client: JmapClient,
  accountId: string,
  address: string,
  limit = 5,
): Promise<EmailSummary[]> => {
  const [, get] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: {
          operator: "OR",
          conditions: [{ from: address }, { to: address }, { cc: address }],
        },
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: SUMMARY_PROPERTIES,
      },
      "g",
    ],
  ]);
  return (get![1].list as EmailSummary[]) ?? [];
};

export const listIdentities = async (
  client: JmapClient,
  accountId: string,
): Promise<Identity[]> => {
  const { list } = await client.call<{ list: Identity[] }>("Identity/get", { accountId }, [
    CAPABILITIES.core,
    CAPABILITIES.mail,
    CAPABILITIES.submission,
  ]);
  return list;
};

export type Quota = { used: number; limit: number | null };

export const getQuota = async (client: JmapClient, accountId: string): Promise<Quota | null> => {
  try {
    const { list } = await client.call<{
      list: { used: number; hardLimit: number; resourceType: string }[];
    }>("Quota/get", { accountId }, [CAPABILITIES.core, "urn:ietf:params:jmap:quota"]);
    const octets = list.find((quota) => quota.resourceType === "octets");
    return octets ? { used: octets.used, limit: octets.hardLimit || null } : null;
  } catch {
    return null;
  }
};

export * from "./mail-change";
export * from "./mail-send";

/** The part to display: the HTML body if there is one, else the text body as HTML. */
export const displayBody = (email: EmailDetail): { kind: "html" | "text"; value: string } => {
  const pick = (parts: BodyPart[]) =>
    parts
      .map((part) => (part.partId ? email.bodyValues[part.partId]?.value : undefined))
      .filter(Boolean)
      .join("\n");
  const hasHtml = email.htmlBody.some((part) => part.type === "text/html");
  if (hasHtml) return { kind: "html", value: pick(email.htmlBody) };
  return { kind: "text", value: pick(email.textBody) };
};

export const isUnread = (email: Pick<EmailSummary, "keywords">): boolean => !email.keywords.$seen;
export const isFlagged = (email: Pick<EmailSummary, "keywords">): boolean =>
  Boolean(email.keywords.$flagged);
