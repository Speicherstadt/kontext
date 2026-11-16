import { describe, expect, it } from "vitest";
import { METRICS, type MetricSample, overviewOf, sinceOf, windowsOf } from "./server-health";

const counter = (metric: string, count: number, timestamp: string): MetricSample => ({
  "@type": "Counter",
  metric,
  count,
  timestamp,
});

const gauge = (metric: string, count: number, timestamp: string): MetricSample => ({
  "@type": "Gauge",
  metric,
  count,
  timestamp,
});

// A Monday in winter: Berlin is UTC+1.
const now = new Date("2026-11-16T10:20:00Z");

describe("windowsOf", () => {
  it("cuts the day into the 24 hours up to the end of this hour", () => {
    const windows = windowsOf("day", now);
    expect(windows).toHaveLength(24);
    expect(new Date(windows[0]![0]).toISOString()).toBe("2026-11-15T11:00:00.000Z");
    expect(new Date(windows.at(-1)![1]).toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });

  it("cuts the week into seven Berlin days, today included", () => {
    const windows = windowsOf("week", now);
    expect(windows).toHaveLength(7);
    expect(new Date(windows[0]![0]).toISOString()).toBe("2026-11-09T23:00:00.000Z");
    expect(new Date(windows.at(-1)![0]).toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(new Date(windows.at(-1)![1]).toISOString()).toBe("2026-11-16T23:00:00.000Z");
  });

  it("follows the change to winter time inside the week", () => {
    const windows = windowsOf("week", new Date("2026-10-27T12:00:00Z"));
    const lengths = windows.map(([from, to]) => (to - from) / 3_600_000);
    expect(lengths).toContain(25);
  });

  it("asks Stalwart from the start of the first bar", () => {
    expect(sinceOf("day", now).toISOString()).toBe("2026-11-15T11:00:00.000Z");
  });
});

describe("overviewOf", () => {
  it("adds the counters into their hour and the period's totals", () => {
    const overview = overviewOf(
      [
        counter(METRICS.received, 4, "2026-11-16T09:00:00Z"),
        counter(METRICS.received, 3, "2026-11-16T09:30:00Z"),
        counter(METRICS.spam, 2, "2026-11-16T10:00:00Z"),
        counter(METRICS.sent, 5, "2026-11-15T12:00:00Z"),
        counter(METRICS.bounced, 1, "2026-11-16T10:00:00Z"),
        counter(METRICS.signInFailed, 7, "2026-11-16T08:00:00Z"),
        counter(METRICS.blocked, 1, "2026-11-16T08:00:00Z"),
      ],
      "day",
      now,
    );
    expect(overview.totals).toEqual({
      received: 7,
      spam: 2,
      sent: 5,
      bounced: 1,
      signInFailed: 7,
      blocked: 1,
    });
    const nine = overview.buckets.find((bucket) => bucket.start === "2026-11-16T09:00:00.000Z");
    expect(nine).toMatchObject({ received: 7, spam: 0 });
    expect(overview.buckets.at(-1)).toMatchObject({ spam: 2, bounced: 1 });
    expect(overview.samples).toBe(7);
  });

  it("leaves out what is older than the period", () => {
    const overview = overviewOf([counter(METRICS.received, 9, "2026-11-14T09:00:00Z")], "day", now);
    expect(overview.totals.received).toBe(0);
    expect(overview.samples).toBe(0);
  });

  it("takes the queue's last value, whatever the order", () => {
    const overview = overviewOf(
      [
        gauge(METRICS.queue, 12, "2026-11-16T10:00:00Z"),
        gauge(METRICS.queue, 3, "2026-11-16T08:00:00Z"),
      ],
      "day",
      now,
    );
    expect(overview.queue).toBe(12);
  });

  it("knows no queue when Stalwart wrote none", () => {
    expect(overviewOf([], "day", now).queue).toBeNull();
  });

  it("counts a week by Berlin days", () => {
    const overview = overviewOf(
      [
        // 23:30 in Berlin on Sunday the 15th
        counter(METRICS.received, 2, "2026-11-15T22:30:00Z"),
        // 00:30 in Berlin on Monday the 16th
        counter(METRICS.received, 5, "2026-11-15T23:30:00Z"),
      ],
      "week",
      now,
    );
    expect(overview.buckets.at(-2)?.received).toBe(2);
    expect(overview.buckets.at(-1)?.received).toBe(5);
  });
});
