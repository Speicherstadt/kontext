import { describe, expect, it } from "vitest";
import { delayReason, heldState } from "./submissions";

// What Stalwart 1.1 answers in EmailSubmission.deliveryStatus (crates/smtp/src/queue/submission.rs).
const greylisted =
  "Code: 451, Enhanced code: 4.7.1, Message: 152.53.197.44 is not yet authorized to deliver mail from <info@teufel-it.de> to <a@example.de>. Please try later.";

describe("delayReason", () => {
  it("gives the receiving server's message while a recipient is retried after a refusal", () => {
    expect(
      delayReason({
        "a@example.de": { delivered: "queued", smtpReply: greylisted },
      }),
    ).toBe(
      "152.53.197.44 is not yet authorized to deliver mail from <info@teufel-it.de> to <a@example.de>. Please try later.",
    );
  });

  it("gives none while the recipients are untried or done", () => {
    expect(
      delayReason({
        "a@example.de": { delivered: "queued", smtpReply: "250 2.1.5 Queued" },
        "b@example.de": {
          delivered: "yes",
          smtpReply: "Code: 250, Enhanced code: 2.0.0, Message: OK",
        },
      }),
    ).toBeUndefined();
    expect(delayReason(null)).toBeUndefined();
    expect(delayReason({})).toBeUndefined();
  });

  it("takes a reply without Stalwart's prefix as it is", () => {
    expect(
      delayReason({ "a@example.de": { delivered: "queued", smtpReply: "Connection refused" } }),
    ).toBe("Connection refused");
  });
});

describe("heldState", () => {
  const now = new Date("2026-11-24T12:40:00Z");

  it("is scheduled before its time", () => {
    expect(heldState({ sendAt: "2026-11-24T12:45:00Z", delay: undefined }, now)).toBe("scheduled");
  });

  it("is on its way past its time", () => {
    expect(heldState({ sendAt: "2026-11-24T12:38:00Z", delay: undefined }, now)).toBe("sending");
  });

  it("is delayed past its time when the receiving server turned it away for now", () => {
    expect(heldState({ sendAt: "2026-11-24T12:38:00Z", delay: "Please try later." }, now)).toBe(
      "delayed",
    );
  });
});
