/**
 * Serverzustand (Stalwart Enterprise): how much mail went through over the last day or week, from
 * the metrics Stalwart keeps (`x:Metric`, crates/registry/src/schema/structs.rs, Metric /
 * MetricCount; read in crates/jmap/src/registry/mapping/telemetry.rs). Stalwart writes them at
 * every collection interval (hourly by default, `metricsCollectionInterval` of DataRetention): a
 * counter as what was added since the last write, a gauge as its value then
 * (crates/common/src/telemetry/metrics/store.rs, write_metrics). Only the metrics listed in
 * PERSISTED_COUNTERS / PERSISTED_GAUGES there are kept. Pure: the calls are in
 * server-health-routes.ts.
 */
import { berlinInstant, companyDay } from "../model/tasks";

/** Stalwart's names of what is counted (MetricType::as_str, crates/trc/src/event/enums_impl.rs). */
export const METRICS = {
  /** Delivered into a mailbox, not as spam. */
  received: "message-ingest.ham",
  /** Delivered into the junk folder. */
  spam: "message-ingest.spam",
  /** Handed in by a signed-in person to be sent. */
  sent: "queue.authenticated-message-queued",
  /** Delivery reports Stalwart wrote because a mail could not be delivered (yet). */
  bounced: "queue.dsn-queued",
  signInFailed: "auth.failed",
  /** Addresses Stalwart blocked after too many failed sign-ins. */
  blocked: "security.authentication-ban",
  /** Mails waiting in the queue (a gauge). */
  queue: "queue.count",
} as const;

export const METRIC_NAMES: string[] = Object.values(METRICS);

/** One `x:Metric` as Stalwart returns it; `timestamp` is when it was written. */
export type MetricSample = {
  "@type": string;
  metric: string;
  count?: number;
  timestamp: string;
};

export type Period = "day" | "week";

/** The mail counts of one bar in the chart. */
export type Counts = { received: number; spam: number; sent: number; bounced: number };

export type Bucket = Counts & { start: string; end: string };

export type Overview = {
  buckets: Bucket[];
  totals: Counts & { signInFailed: number; blocked: number };
  /** Mails in the queue at the last write; null when none was written in the period. */
  queue: number | null;
  /** How many samples there were: none means Stalwart records nothing (yet). */
  samples: number;
};

const HOUR = 3_600_000;

/** The 24 hours up to the end of the current hour. */
const hourWindows = (now: Date): [number, number][] => {
  const end = Math.ceil((now.getTime() + 1) / HOUR) * HOUR;
  return Array.from({ length: 24 }, (_, i) => [end - (24 - i) * HOUR, end - (23 - i) * HOUR]);
};

const plusDays = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The last seven days in Berlin, today included, each from midnight to midnight. */
const dayWindows = (now: Date): [number, number][] => {
  const today = companyDay(now);
  return Array.from({ length: 7 }, (_, i) => [
    berlinInstant(plusDays(today, i - 6), "00:00").getTime(),
    berlinInstant(plusDays(today, i - 5), "00:00").getTime(),
  ]);
};

/** The bars of a period: hours of the last day, or days of the last week. */
export const windowsOf = (period: Period, now: Date): [number, number][] =>
  period === "day" ? hourWindows(now) : dayWindows(now);

/** Since when Stalwart is asked: the start of the first bar. */
export const sinceOf = (period: Period, now: Date): Date => new Date(windowsOf(period, now)[0]![0]);

const COUNTED: Record<string, keyof Counts> = {
  [METRICS.received]: "received",
  [METRICS.spam]: "spam",
  [METRICS.sent]: "sent",
  [METRICS.bounced]: "bounced",
};

const empty = (): Counts => ({ received: 0, spam: 0, sent: 0, bounced: 0 });

const add = (counts: Counts, key: keyof Counts, count: number): Counts => ({
  ...counts,
  [key]: counts[key] + count,
});

const countersOf = (samples: MetricSample[], metric: string): number =>
  samples
    .filter((sample) => sample.metric === metric && sample["@type"] === "Counter")
    .reduce((sum, sample) => sum + (sample.count ?? 0), 0);

/** The queue's last value; samples in any order. */
const lastQueue = (samples: MetricSample[]): number | null => {
  const gauges = samples
    .filter((sample) => sample.metric === METRICS.queue && sample["@type"] === "Gauge")
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return gauges.length ? (gauges.at(-1)!.count ?? 0) : null;
};

/** The samples of a period in bars and totals. Samples outside the bars are left out. */
export const overviewOf = (samples: MetricSample[], period: Period, now: Date): Overview => {
  const windows = windowsOf(period, now);
  const [start, end] = [windows[0]![0], windows.at(-1)![1]];
  const inPeriod = samples.filter((sample) => {
    const at = Date.parse(sample.timestamp);
    return at >= start && at < end;
  });
  const buckets = windows.map(([from, to]): Bucket => {
    const counts = inPeriod.reduce((sum, sample) => {
      const key = COUNTED[sample.metric];
      const at = Date.parse(sample.timestamp);
      return key && sample["@type"] === "Counter" && at >= from && at < to
        ? add(sum, key, sample.count ?? 0)
        : sum;
    }, empty());
    return { ...counts, start: new Date(from).toISOString(), end: new Date(to).toISOString() };
  });
  const totals = buckets.reduce(
    (sum, bucket) => ({
      received: sum.received + bucket.received,
      spam: sum.spam + bucket.spam,
      sent: sum.sent + bucket.sent,
      bounced: sum.bounced + bucket.bounced,
    }),
    empty(),
  );
  return {
    buckets,
    totals: {
      ...totals,
      signInFailed: countersOf(inPeriod, METRICS.signInFailed),
      blocked: countersOf(inPeriod, METRICS.blocked),
    },
    queue: lastQueue(inPeriod),
    samples: inPeriod.length,
  };
};
