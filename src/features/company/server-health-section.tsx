/**
 * Serverzustand (Stalwart Enterprise): mail in and out over the last day or week, failed sign-ins,
 * the queue, storage, and why mails to outside did not arrive. Read from Stalwart's metrics and
 * traces by the server (server/company/server-health-routes.ts); with Community only a hint.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Clock, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { getServerHealth } from "@/company-core/api";
import { useStalwartEdition } from "@/company-core/edition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatSize, listDate } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import type { DeliveryProblem } from "../../../server/company/delivery-problems";
import type { Period } from "../../../server/company/server-health";
import type { ServerHealthView } from "../../../server/company/server-health-routes";
import { metricsState, type PartState, problemsState } from "./server-health";
import { ServerHealthChart } from "./server-health-chart";

const GUIDE = "https://kontext.email/installation.html#serverzustand";

const count = (value: number) => value.toLocaleString(LOCALE);

const Notice = ({ children }: { children: ReactNode }) => (
  <p className="m-0 rounded-lg border border-border px-3 py-2.5 text-[13px] text-muted">
    {children}{" "}
    <a href={GUIDE} target="_blank" rel="noreferrer">
      {m.health_guide()}
    </a>
  </p>
);

const NOTICE: Partial<Record<PartState, () => string>> = {
  denied: m.health_denied,
  empty: m.health_empty,
};

const Tile = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5">
    <span className="text-[12px] text-muted">{label}</span>
    <span className="text-[18px] leading-tight font-semibold tabular-nums">{value}</span>
    {note ? <span className="text-[12px] text-muted">{note}</span> : null}
  </div>
);

const Tiles = ({ view }: { view: ServerHealthView }) => {
  const totals = view.metrics?.totals;
  const value = (n: number | undefined) => (n === undefined ? "–" : count(n));
  const queue = view.metrics?.queue;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tile label={m.health_received()} value={value(totals?.received)} />
      <Tile label={m.health_sent()} value={value(totals?.sent)} />
      <Tile label={m.health_spam()} value={value(totals?.spam)} />
      <Tile label={m.health_bounced()} value={value(totals?.bounced)} />
      <Tile
        label={m.health_sign_in_failed()}
        value={value(totals?.signInFailed)}
        note={totals?.blocked ? m.health_blocked({ count: totals.blocked }) : undefined}
      />
      <Tile label={m.health_queue()} value={queue == null ? "–" : count(queue)} />
      <Tile label={m.health_storage()} value={formatSize(view.storageBytes)} />
    </div>
  );
};

const ProblemRow = ({ problem }: { problem: DeliveryProblem }) => {
  const Icon = problem.permanent ? CircleAlert : Clock;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        size={16}
        aria-hidden="true"
        className={cn("mt-0.5 shrink-0", problem.permanent ? "text-danger" : "text-warn")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-medium">{problem.to}</span>
          <span className="shrink-0 text-[12px] text-muted">
            {listDate(problem.at, new Date())}
          </span>
        </span>
        <span className="text-[12px] text-muted">
          {problem.permanent ? m.health_permanent() : m.health_temporary()}
          {problem.host ? ` · ${problem.host}` : ""}
        </span>
        <span className="font-mono text-[12px] break-words text-muted">{problem.reason}</span>
      </span>
    </li>
  );
};

const Problems = ({ view }: { view: ServerHealthView }) => {
  const state = problemsState(view);
  return (
    <section aria-label={m.health_problems()} className="flex flex-col gap-1">
      <h3 className="m-0 text-[14px] font-medium">{m.health_problems()}</h3>
      <p className="m-0 text-[13px] text-muted">{m.health_problems_hint()}</p>
      {state === "off" ? <Notice>{m.health_traces_off()}</Notice> : null}
      {state === "denied" ? <Notice>{m.health_denied()}</Notice> : null}
      {state === "empty" ? (
        <p className="m-0 py-2 text-[14px] text-muted">{m.health_problems_none()}</p>
      ) : null}
      {state === "ok" ? (
        <ul className="m-0 list-none divide-y divide-border p-0">
          {view.problems!.map((problem) => (
            <ProblemRow key={problem.id} problem={problem} />
          ))}
        </ul>
      ) : null}
    </section>
  );
};

const PeriodSwitch = ({ period, onChange }: { period: Period; onChange: (p: Period) => void }) => (
  <fieldset aria-label={m.health_period()} className="m-0 flex gap-1 border-0 p-0">
    {(["day", "week"] as const).map((value) => (
      <Button
        key={value}
        variant="ghost"
        size="sm"
        aria-pressed={period === value}
        className={cn(period === value && "bg-subtle text-fg")}
        onClick={() => onChange(value)}
      >
        {value === "day" ? m.health_day() : m.health_week()}
      </Button>
    ))}
  </fieldset>
);

const Health = () => {
  const [period, setPeriod] = useState<Period>("day");
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["company", "server-health", period],
    queryFn: () => getServerHealth(period),
    staleTime: 60_000,
  });
  const state = data ? metricsState(data) : null;
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <p className="m-0 text-[13px] text-muted">{m.health_hint()}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodSwitch period={period} onChange={setPeriod} />
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />
          {m.health_refresh()}
        </Button>
      </div>
      {error ? <p className="m-0 text-[14px] text-danger">{error.message}</p> : null}
      {!data && !error ? <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p> : null}
      {data && state ? (
        <>
          {state === "off" ? <Notice>{m.health_metrics_off()}</Notice> : null}
          {NOTICE[state] ? <Notice>{NOTICE[state]!()}</Notice> : null}
          <Tiles view={data} />
          {data.metrics && state === "ok" ? (
            <ServerHealthChart buckets={data.metrics.buckets} period={data.period} />
          ) : null}
          <Problems view={data} />
        </>
      ) : null}
    </div>
  );
};

export const ServerHealthSection = () => {
  const edition = useStalwartEdition();
  if (edition === undefined)
    return <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>;
  if (edition !== "enterprise") {
    return <p className="m-0 max-w-[640px] text-[14px] text-muted">{m.health_enterprise_only()}</p>;
  }
  return <Health />;
};
