import { describe, expect, it } from "vitest";
import {
  bareMessageId,
  isReceipt,
  MDN_SENT,
  receiptAnswered,
  receiptsForSent,
  receiptTargets,
  receiptText,
} from "./mdn";

describe("receiptText", () => {
  it("baut den deutschen Hinweistext für MDN/send", () => {
    const text = receiptText({
      from: { name: "Max Becker", email: "max@weber.test" },
      original: { subject: "Angebot Bad", sentAt: "2026-10-29T09:15:00Z" },
    });
    expect(text).toContain("Ihre Nachricht „Angebot Bad“");
    expect(text).toContain("Max Becker <max@weber.test>");
  });

  it("kommt ohne Namen nur mit der Adresse aus", () => {
    const text = receiptText({
      from: { name: null, email: "max@weber.test" },
      original: { subject: "Angebot", sentAt: "2026-10-29T09:15:00Z" },
    });
    expect(text).toContain("wurde von max@weber.test geöffnet.");
  });
});

describe("receiptAnswered", () => {
  it("erkennt $MDNSent unabhängig von Groß- und Kleinschreibung", () => {
    expect(receiptAnswered({ [MDN_SENT]: true })).toBe(true);
    expect(receiptAnswered({ $mdnsent: true })).toBe(true);
    expect(receiptAnswered({ $seen: true })).toBe(false);
  });
});

describe("isReceipt", () => {
  it("erkennt multipart/report mit disposition-notification", () => {
    expect(isReceipt('multipart/report; report-type=disposition-notification; boundary="x"')).toBe(
      true,
    );
    expect(isReceipt(' multipart/report; report-type="disposition-notification"; boundary=x')).toBe(
      true,
    );
    expect(isReceipt("multipart/report; report-type=delivery-status")).toBe(false);
    expect(isReceipt("text/plain")).toBe(false);
    expect(isReceipt(null)).toBe(false);
  });
});

describe("bareMessageId und receiptTargets", () => {
  it("entfernt spitze Klammern und fasst Header mit originalMessageId zusammen", () => {
    expect(bareMessageId(" <a@b> ")).toBe("a@b");
    expect(bareMessageId("a@b")).toBe("a@b");
    expect(bareMessageId("two words")).toBeNull();
    expect(receiptTargets({ inReplyTo: ["m1@x"], references: ["m1@x", "m2@x"] }, "<m3@x>")).toEqual(
      ["m1@x", "m2@x", "m3@x"],
    );
    expect(receiptTargets({ inReplyTo: null, references: null }, null)).toEqual([]);
  });
});

describe("receiptsForSent", () => {
  it("behält nur Bestätigungen für gesendete Mails, die eine angefordert haben", () => {
    const sent = [
      { messageId: ["asked@x"], receiptTo: [{ email: "jonas@x" }] },
      { messageId: ["plain@x"], receiptTo: null },
    ];
    const receipts = [
      { id: "1", targets: ["asked@x"] },
      { id: "2", targets: ["plain@x"] },
      { id: "3", targets: ["unknown@x"] },
      { id: "4", targets: [] },
    ];
    expect(receiptsForSent(receipts, sent).map((r) => r.id)).toEqual(["1"]);
  });
});
