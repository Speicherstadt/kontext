/**
 * The Serverzustand's chart: per hour or day a bar for what came in (received, spam on top) and
 * one for what was sent. Plain boxes in the app's tokens, so it follows light and dark.
 */
import { m } from "@/paraglide/messages";
import type { Bucket, Period } from "../../../server/company/server-health";
import { axisLabel, barPercent, bucketTime, chartMax } from "./server-health";

const Legend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm bg-accent" /> {m.health_received()}
    </span>
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm bg-accent/40" /> {m.health_spam()}
    </span>
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm bg-muted" /> {m.health_sent()}
    </span>
  </div>
);

const Bar = ({ bucket, max, period }: { bucket: Bucket; max: number; period: Period }) => {
  const label = m.health_bar({
    time: bucketTime(bucket, period),
    received: bucket.received,
    spam: bucket.spam,
    sent: bucket.sent,
  });
  return (
    <li title={label} aria-label={label} className="flex h-full min-w-0 flex-1 items-end gap-px">
      <span className="flex h-full flex-1 flex-col justify-end">
        <span
          className="rounded-t-sm bg-accent/40"
          style={{ height: `${barPercent(bucket.spam, max)}%` }}
        />
        <span className="bg-accent" style={{ height: `${barPercent(bucket.received, max)}%` }} />
      </span>
      <span className="flex h-full flex-1 flex-col justify-end">
        <span
          className="rounded-t-sm bg-muted"
          style={{ height: `${barPercent(bucket.sent, max)}%` }}
        />
      </span>
    </li>
  );
};

export const ServerHealthChart = ({ buckets, period }: { buckets: Bucket[]; period: Period }) => {
  const max = chartMax(buckets);
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{m.health_chart()}</span>
        <Legend />
      </figcaption>
      <ul
        aria-label={m.health_chart()}
        className="m-0 flex h-28 list-none items-end gap-0.5 border-b border-border p-0 md:gap-1"
      >
        {buckets.map((bucket) => (
          <Bar key={bucket.start} bucket={bucket} max={max} period={period} />
        ))}
      </ul>
      <div aria-hidden="true" className="flex gap-0.5 md:gap-1">
        {buckets.map((bucket, index) => (
          <span
            key={bucket.start}
            className="min-w-0 flex-1 text-[11px] whitespace-nowrap text-muted"
          >
            {axisLabel(bucket, index, period)}
          </span>
        ))}
      </div>
    </figure>
  );
};
