import { describe, expect, it } from "vitest";
import { deliveryProblems, type RawTrace } from "./delivery-problems";

const text = (value: string) => ({ "@type": "String", value });
const number = (value: number) => ({ "@type": "UnsignedInt", value });

const start = (timestamp: string, ...to: string[]) => ({
  event: "delivery.attempt-start",
  timestamp,
  keyValues: [
    { key: "from", value: text("jonas@weber-haustechnik.test") },
    { key: "to", value: { "@type": "List", value: to.map(text) } },
  ],
});

describe("deliveryProblems", () => {
  it("says why a mail bounced, with the remote server's answer", () => {
    const trace: RawTrace = {
      id: "t1",
      events: [
        start("2026-11-16T09:00:00Z", "max@kunde.test"),
        {
          event: "delivery.rcpt-to-rejected",
          timestamp: "2026-11-16T09:00:01Z",
          keyValues: [
            { key: "hostname", value: text("mx.kunde.test") },
            { key: "to", value: text("max@kunde.test") },
            { key: "code", value: number(550) },
            { key: "details", value: text("5.1.1 User unknown") },
          ],
        },
        { event: "delivery.attempt-end", timestamp: "2026-11-16T09:00:02Z", keyValues: [] },
      ],
    };
    expect(deliveryProblems([trace])).toEqual([
      {
        id: "t1/max@kunde.test",
        at: "2026-11-16T09:00:01Z",
        to: "max@kunde.test",
        reason: "550 5.1.1 User unknown",
        host: "mx.kunde.test",
        permanent: true,
      },
    ]);
  });

  it("marks a 4xx answer as tried again", () => {
    const trace: RawTrace = {
      id: "t2",
      events: [
        start("2026-11-16T09:00:00Z", "a@kunde.test"),
        {
          event: "delivery.rcpt-to-rejected",
          timestamp: "2026-11-16T09:00:01Z",
          keyValues: [
            { key: "to", value: text("a@kunde.test") },
            { key: "code", value: number(451) },
            { key: "details", value: text("451 Greylisted, try later") },
          ],
        },
      ],
    };
    expect(deliveryProblems([trace])[0]).toMatchObject({
      reason: "451 Greylisted, try later",
      permanent: false,
      host: null,
    });
  });

  it("keeps the final answer over a later temporary one", () => {
    const trace: RawTrace = {
      id: "t3",
      events: [
        start("2026-11-16T09:00:00Z", "a@kunde.test"),
        {
          event: "delivery.dsn-perm-fail",
          timestamp: "2026-11-16T09:00:01Z",
          keyValues: [
            { key: "to", value: text("a@kunde.test") },
            { key: "details", value: text("Mailbox full") },
          ],
        },
        {
          event: "delivery.dsn-temp-fail",
          timestamp: "2026-11-16T09:00:02Z",
          keyValues: [{ key: "to", value: text("a@kunde.test") }],
        },
      ],
    };
    expect(deliveryProblems([trace])).toMatchObject([{ reason: "Mailbox full", permanent: true }]);
  });

  it("gives a rejected message to every recipient of the attempt, with the nested reason", () => {
    const trace: RawTrace = {
      id: "t4",
      events: [
        start("2026-11-16T09:00:00Z", "a@kunde.test", "b@kunde.test"),
        {
          event: "delivery.message-rejected",
          timestamp: "2026-11-16T09:00:01Z",
          keyValues: [
            {
              key: "causedBy",
              value: {
                "@type": "Event",
                event: "smtp.error",
                value: [{ key: "details", value: text("554 Spam detected") }],
              },
            },
          ],
        },
      ],
    };
    expect(deliveryProblems([trace]).map((problem) => [problem.to, problem.reason])).toEqual([
      ["a@kunde.test", "554 Spam detected"],
      ["b@kunde.test", "554 Spam detected"],
    ]);
  });

  it("leaves out attempts that went well and sorts the rest newest first", () => {
    const failed = (id: string, timestamp: string): RawTrace => ({
      id,
      events: [
        start(timestamp, `${id}@kunde.test`),
        {
          event: "delivery.failed",
          timestamp,
          keyValues: [
            { key: "to", value: text(`${id}@kunde.test`) },
            { key: "reason", value: text("Message expired") },
          ],
        },
      ],
    });
    const fine: RawTrace = {
      id: "ok",
      events: [
        start("2026-11-16T12:00:00Z", "c@kunde.test"),
        { event: "delivery.delivered", timestamp: "2026-11-16T12:00:01Z" },
      ],
    };
    const problems = deliveryProblems(
      [failed("old", "2026-11-15T09:00:00Z"), fine, failed("new", "2026-11-16T09:00:00Z")],
      1,
    );
    expect(problems.map((problem) => problem.to)).toEqual(["new@kunde.test"]);
  });
});
