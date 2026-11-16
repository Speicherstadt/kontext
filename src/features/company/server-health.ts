/**
 * Serverzustand in the Firmenverwaltung: what the view shows from the server's answer
 * (server/company/server-health-routes.ts). Pure, the drawing is in server-health-section.tsx.
 */
import { TIME_ZONE } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import type { Bucket, Period } from "../../../server/company/server-health";
import type { ServerHealthView } from "../../../server/company/server-health-routes";

/**
 * What can be shown of a part: its data, or why not – Stalwart does not record it (its store is
 * off), the key may not read it, or nothing was recorded in the period yet.
 */
export type PartState = "ok" | "off" | "denied" | "empty";

export const metricsState = (view: ServerHealthView): PartState => {
  if (view.recording.metrics === false) return "off";
  if (!view.metrics) return "denied";
  return view.metrics.samples ? "ok" : "empty";
};

export const problemsState = (view: ServerHealthView): PartState => {
  if (view.recording.traces === false) return "off";
  if (!view.problems) return "denied";
  return view.problems.length ? "ok" : "empty";
};

/** The highest bar: received with spam, or sent; at least 1 so empty bars stay flat. */
export const chartMax = (buckets: Bucket[]): number =>
  Math.max(1, ...buckets.flatMap((bucket) => [bucket.received + bucket.spam, bucket.sent]));

/** A bar's height in percent of the chart. */
export const barPercent = (value: number, max: number): number =>
  Math.round((value / max) * 1000) / 10;

const weekday = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: "short" });
const hourRange = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** The label under a bar: every sixth hour of a day, every day of a week; else empty. */
export const axisLabel = (bucket: Bucket, index: number, period: Period): string => {
  if (period === "week") return weekday.format(new Date(bucket.start));
  return index % 6 === 0 ? hourRange.format(new Date(bucket.start)) : "";
};

/** When a bar is, in words for its tooltip: "09:00–10:00" or "Mo., 16.11.". */
export const bucketTime = (bucket: Bucket, period: Period): string =>
  period === "week"
    ? day.format(new Date(bucket.start))
    : `${hourRange.format(new Date(bucket.start))}–${hourRange.format(new Date(bucket.end))}`;
