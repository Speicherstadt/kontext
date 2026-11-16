import { describe, expect, it } from "vitest";
import type { Bucket, Overview } from "../../../server/company/server-health";
import type { ServerHealthView } from "../../../server/company/server-health-routes";
import {
  axisLabel,
  barPercent,
  bucketTime,
  chartMax,
  metricsState,
  problemsState,
} from "./server-health";

const bucket = (start: string, end: string, counts: Partial<Bucket> = {}): Bucket => ({
  start,
  end,
  received: 0,
  spam: 0,
  sent: 0,
  bounced: 0,
  ...counts,
});

const overview = (samples: number): Overview => ({
  buckets: [],
  totals: { received: 0, spam: 0, sent: 0, bounced: 0, signInFailed: 0, blocked: 0 },
  queue: null,
  samples,
});

const view = (change: Partial<ServerHealthView>): ServerHealthView => ({
  period: "day",
  recording: { metrics: true, traces: true },
  metrics: overview(3),
  problems: [],
  storageBytes: 0,
  ...change,
});

describe("metricsState", () => {
  it("shows the numbers when Stalwart wrote some", () => {
    expect(metricsState(view({}))).toBe("ok");
  });

  it("says Stalwart records nothing when its store is off, before anything else", () => {
    expect(metricsState(view({ recording: { metrics: false, traces: true }, metrics: null }))).toBe(
      "off",
    );
  });

  it("says the key may not read them when Stalwart refused", () => {
    expect(metricsState(view({ recording: { metrics: null, traces: null }, metrics: null }))).toBe(
      "denied",
    );
  });

  it("says nothing was recorded yet", () => {
    expect(metricsState(view({ metrics: overview(0) }))).toBe("empty");
  });
});

describe("problemsState", () => {
  it("tells off, denied, none and some apart", () => {
    expect(problemsState(view({ recording: { metrics: true, traces: false } }))).toBe("off");
    expect(problemsState(view({ problems: null }))).toBe("denied");
    expect(problemsState(view({}))).toBe("empty");
    const problem = {
      id: "t/a",
      at: "2026-11-16T09:00:00Z",
      to: "a@kunde.test",
      reason: "550 User unknown",
      host: null,
      permanent: true,
    };
    expect(problemsState(view({ problems: [problem] }))).toBe("ok");
  });
});

describe("chart", () => {
  it("scales to the highest of received with spam, and sent", () => {
    const buckets = [bucket("a", "b", { received: 3, spam: 2 }), bucket("b", "c", { sent: 4 })];
    expect(chartMax(buckets)).toBe(5);
    expect(barPercent(4, 5)).toBe(80);
  });

  it("keeps empty bars flat", () => {
    expect(chartMax([bucket("a", "b")])).toBe(1);
    expect(barPercent(0, 1)).toBe(0);
  });

  it("labels every sixth hour of a day and every day of a week, in Berlin time", () => {
    const nine = bucket("2026-11-16T08:00:00.000Z", "2026-11-16T09:00:00.000Z");
    expect(axisLabel(nine, 0, "day")).toBe("09:00");
    expect(axisLabel(nine, 1, "day")).toBe("");
    expect(axisLabel(nine, 1, "week")).toMatch(/^Mo/);
    expect(bucketTime(nine, "day")).toBe("09:00–10:00");
    expect(bucketTime(nine, "week")).toContain("16.11.");
  });
});
