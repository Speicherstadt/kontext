import { describe, expect, it } from "vitest";
import { CAPABILITIES, type JmapClient } from "./client";
import { receiptsFor, receiptsToFile, sendReceipt } from "./receipts";

const REPORT = 'multipart/report; report-type=disposition-notification; boundary="mdn"';

/** A mail the search finds: ordinary, or a receipt naming a Message-ID in its headers or report. */
type Mail = { id: string; from: string; inReplyTo?: string; original?: string; plain?: boolean };
type Sent = { messageId: string; asked: boolean };

/** A Stalwart with these mails found by any search, and these in Sent; answers MDN/parse too. */
const fakeStalwart = (mails: Mail[], sent: Sent[] = []) => {
  const filters: Record<string, unknown>[] = [];
  const parsedBlobs: string[] = [];
  const client = {
    request: async (calls: [string, Record<string, unknown>, string][]) => {
      const [method, args] = calls[0]!;
      if (method === "MDN/parse") {
        const blobIds = (args.blobIds as string[]) ?? [];
        parsedBlobs.push(...blobIds);
        const parsed: Record<string, { originalMessageId?: string }> = {};
        for (const blobId of blobIds) {
          const mail = mails.find((candidate) => `blob-${candidate.id}` === blobId);
          if (mail?.original) parsed[blobId] = { originalMessageId: `<${mail.original}>` };
        }
        return [["MDN/parse", { parsed }, "p"]];
      }
      filters.push(args.filter as Record<string, unknown>);
      const inSent = JSON.stringify(args.filter).includes('"inMailbox":"sent"');
      const list = inSent
        ? sent.map((mail) => ({
            messageId: [mail.messageId],
            "header:Disposition-Notification-To:asAddresses": mail.asked
              ? [{ name: null, email: "jonas@weber.test" }]
              : null,
          }))
        : mails.slice((args.position as number) ?? 0).map((mail) => ({
            id: mail.id,
            blobId: `blob-${mail.id}`,
            from: [{ name: null, email: mail.from }],
            receivedAt: "2026-10-29T10:00:00Z",
            inReplyTo: mail.inReplyTo ? [mail.inReplyTo] : null,
            references: null,
            "header:Content-Type": mail.plain ? "text/plain" : REPORT,
          }));
      return [
        ["Email/query", { ids: [] }, "q"],
        ["Email/get", { list }, "g"],
      ];
    },
  } as unknown as JmapClient;
  return { client, filters, parsedBlobs };
};

const sentMail = {
  messageId: "angebot.1@weber.test",
  subject: "Angebot Bad",
  sentAt: "2026-10-29T09:00:00Z",
  recipients: ["petra@keller-elektro.test"],
};

describe("sendReceipt", () => {
  it("sendet über MDN/send mit Capability mdn und onSuccessUpdateEmail für $mdnsent", async () => {
    const calls: { calls: unknown[]; using?: string[] }[] = [];
    const client = {
      request: async (methodCalls: unknown[], using?: string[]) => {
        calls.push({ calls: methodCalls, using });
        return [["MDN/send", { sent: { r: {} } }, "m"]];
      },
    } as unknown as JmapClient;
    await sendReceipt(client, "acc", "id1", "mail-1", {
      subject: "Gelesen: Angebot",
      textBody: "Geöffnet.",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.using).toContain(CAPABILITIES.mdn);
    expect(calls[0]!.calls[0]).toEqual([
      "MDN/send",
      {
        accountId: "acc",
        identityId: "id1",
        send: {
          r: {
            forEmailId: "mail-1",
            subject: "Gelesen: Angebot",
            textBody: "Geöffnet.",
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
    ]);
  });
});

describe("receiptsFor", () => {
  it("finds a receipt by Original-Message-ID alone via MDN/parse", async () => {
    const { client, filters, parsedBlobs } = fakeStalwart([
      { id: "a", from: "petra@keller-elektro.test", original: "angebot.1@weber.test" },
      { id: "b", from: "petra@keller-elektro.test", original: "other@weber.test" },
      { id: "c", from: "petra@keller-elektro.test", plain: true },
    ]);
    const found = await receiptsFor(client, "acc", sentMail);
    expect(found.map((receipt) => receipt.id)).toEqual(["a"]);
    expect(parsedBlobs).toEqual(["blob-a", "blob-b"]);
    expect(JSON.stringify(filters[0])).toContain('"from":"petra@keller-elektro.test"');
    expect(JSON.stringify(filters[0])).toContain('"subject":"Angebot Bad"');
  });

  it("does not call MDN/parse when In-Reply-To names the mail already", async () => {
    const { client, parsedBlobs } = fakeStalwart([
      { id: "a", from: "petra@keller-elektro.test", inReplyTo: "angebot.1@weber.test" },
    ]);
    expect((await receiptsFor(client, "acc", sentMail)).map((r) => r.id)).toEqual(["a"]);
    expect(parsedBlobs).toEqual([]);
  });

  it("teilt MDN/parse in Blöcke von höchstens 10 blobIds (Stalwart parseLimitEmail)", async () => {
    const mails = Array.from({ length: 12 }, (_, index) => ({
      id: `m${index}`,
      from: "petra@keller-elektro.test",
      original: index === 11 ? "angebot.1@weber.test" : `other-${index}@weber.test`,
    }));
    const { client: base } = fakeStalwart(mails);
    const batchSizes: number[] = [];
    const client = {
      request: async (calls: [string, Record<string, unknown>, string][], using?: string[]) => {
        const [method, args] = calls[0]!;
        if (method === "MDN/parse") {
          const blobIds = (args.blobIds as string[]) ?? [];
          batchSizes.push(blobIds.length);
          if (blobIds.length > 10) {
            throw new Error("requestTooLarge");
          }
        }
        return base.request(calls, using);
      },
    } as unknown as JmapClient;
    const found = await receiptsFor(client, "acc", sentMail);
    expect(found.map((r) => r.id)).toEqual(["m11"]);
    expect(batchSizes).toEqual([10, 2]);
  });
});

describe("receiptsToFile", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const boxes = { inboxId: "inbox", sentId: "sent" };

  it("files only receipts for a sent mail that asked for one", async () => {
    const { client, filters } = fakeStalwart(
      [
        { id: "a", from: "petra@keller-elektro.test", original: "angebot.1@weber.test" },
        { id: "b", from: "petra@keller-elektro.test", original: "plain.2@weber.test" },
        { id: "c", from: "fake@example.test", original: "unknown@example.test" },
        { id: "d", from: "petra@keller-elektro.test", plain: true },
      ],
      [
        { messageId: "angebot.1@weber.test", asked: true },
        { messageId: "plain.2@weber.test", asked: false },
      ],
    );
    expect(await receiptsToFile(client, "acc", boxes, now)).toEqual(["a"]);
    expect(JSON.stringify(filters[0])).toContain('"notKeyword":"$seen"');
    expect(JSON.stringify(filters[0])).toContain('"after":"2026-10-15T11:59:00Z"');
    expect(JSON.stringify(filters.at(-1))).toContain('"to":"fake@example.test"');
  });

  it("asks nothing more without receipts", async () => {
    const { client, filters } = fakeStalwart([{ id: "d", from: "x@y.test", plain: true }]);
    expect(await receiptsToFile(client, "acc", boxes, now)).toEqual([]);
    expect(filters).toHaveLength(1);
  });
});

describe("receiptsToFile in a busy inbox", () => {
  it("files a new receipt behind more than a hundred unread mails", async () => {
    const at = (index: number) => new Date(Date.UTC(2026, 9, 20) + index * 3_600_000).toISOString();
    const ordinary = Array.from({ length: 120 }, (_, index) => ({
      id: `m${index}`,
      blobId: `blob-m${index}`,
      from: [{ name: null, email: "kunde@example.test" }],
      receivedAt: at(index),
      inReplyTo: null,
      references: null,
      "header:Content-Type": "text/plain",
    }));
    const receipt = {
      id: "r",
      blobId: "blob-r",
      from: [{ name: null, email: "petra@keller-elektro.test" }],
      receivedAt: at(120),
      inReplyTo: ["angebot.1@weber.test"],
      references: null,
      "header:Content-Type": REPORT,
    };
    const inbox = [...ordinary, receipt];
    const client = {
      request: async (calls: [string, Record<string, unknown>, string][]) => {
        const [method, query] = calls[0]!;
        if (method === "MDN/parse") return [["MDN/parse", { parsed: {} }, "p"]];
        if (JSON.stringify(query.filter).includes('"inMailbox":"sent"')) {
          const list = [
            {
              messageId: ["angebot.1@weber.test"],
              "header:Disposition-Notification-To:asAddresses": [{ email: "jonas@weber.test" }],
            },
          ];
          return [
            ["Email/query", { ids: [] }, "q"],
            ["Email/get", { list }, "g"],
          ];
        }
        const [sort] = query.sort as { isAscending: boolean }[];
        const sorted = sort?.isAscending === false ? [...inbox].reverse() : inbox;
        const position = (query.position as number) ?? 0;
        const list = sorted.slice(position, position + (query.limit as number));
        return [
          ["Email/query", { ids: [] }, "q"],
          ["Email/get", { list }, "g"],
        ];
      },
    } as unknown as JmapClient;
    const now = new Date("2026-10-29T12:00:00Z");
    expect(await receiptsToFile(client, "acc", { inboxId: "inbox", sentId: "sent" }, now)).toEqual([
      "r",
    ]);
  });
});
