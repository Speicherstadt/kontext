/**
 * Serverzustand under /api/company/server-health: mail counts, sign-in failures and the queue from
 * Stalwart's metrics, recent delivery problems from its traces, and the storage the company's
 * mailboxes use. Metrics and traces are Stalwart Enterprise only (assert_enterprise_object in
 * crates/jmap/src/registry/mod.rs refuses `x:Metric` and `x:Trace` without a license), so the route
 * answers 403 unless the edition check says Enterprise. Stalwart records only with its MetricsStore
 * and TracingStore switched on (both Disabled by default, structs_impl.rs; read at start, so a
 * change needs a restart, crates/common/src/cache/reload.rs). Rights of the key: sysMetricGet,
 * sysMetricQuery, sysTraceGet, sysTraceQuery, sysMetricsStoreGet, sysTracingStoreGet
 * (stalwart-setup.ts).
 */
import { Hono } from "hono";
import type { Env } from "./context";
import { type DeliveryProblem, deliveryProblems, type RawTrace } from "./delivery-problems";
import type { EditionCheck } from "./edition";
import type { Invocation } from "./management";
import {
  METRIC_NAMES,
  type MetricSample,
  type Overview,
  overviewOf,
  type Period,
  sinceOf,
} from "./server-health";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

/** Stalwart's limits: query results and objects per get (Jmap::default, structs_impl.rs). */
const MAX_QUERY = 5000;
const MAX_GET = 500;
/** Delivery attempts looked at for problems; most go well. */
const MAX_TRACES = 200;

/** Whether Stalwart keeps metrics and traces at all; null: it would not say. */
export type Recording = { metrics: boolean | null; traces: boolean | null };

export type ServerHealthView = {
  period: Period;
  recording: Recording;
  /** Null: Stalwart refused (no right). */
  metrics: Overview | null;
  /** Null: Stalwart refused (no right). */
  problems: DeliveryProblem[] | null;
  /** What the company's mailboxes take up on the server. */
  storageBytes: number;
};

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

const listsOf = <T>(responses: Invocation[]): T[] =>
  responses.flatMap(([, args]) => (args.list as T[] | undefined) ?? []);

/** Metrics and traces since a moment; null where Stalwart refuses (no right, no store). */
export const createServerHealth = (request: Request) => {
  const metrics = async (since: Date): Promise<MetricSample[] | null> => {
    try {
      const [query] = await request([
        [
          "x:Metric/query",
          {
            filter: { timestampIsGreaterThanOrEqual: since.toISOString(), metric: METRIC_NAMES },
            sort: [{ property: "timestamp", isAscending: false }],
            limit: MAX_QUERY,
          },
          "q",
        ],
      ]);
      const ids = (query![1].ids as string[] | undefined) ?? [];
      if (!ids.length) return [];
      const gets = chunks(ids, MAX_GET).map(
        (part, i): Invocation => ["x:Metric/get", { ids: part }, `g${i}`],
      );
      return listsOf<MetricSample>(await request(gets));
    } catch {
      return null;
    }
  };

  const traces = async (since: Date): Promise<RawTrace[] | null> => {
    try {
      const responses = await request([
        [
          "x:Trace/query",
          {
            filter: {
              event: "delivery.attempt-start",
              timestampIsGreaterThan: since.toISOString(),
            },
            sort: [{ property: "timestamp", isAscending: false }],
            limit: MAX_TRACES,
          },
          "q",
        ],
        ["x:Trace/get", { "#ids": { resultOf: "q", name: "x:Trace/query", path: "/ids" } }, "g"],
      ]);
      return listsOf<RawTrace>(responses.slice(1));
    } catch {
      return null;
    }
  };

  /** The stores' kind: "Disabled", or where they keep it (MetricsStore, TracingStore). */
  const recording = async (): Promise<Recording> => {
    const kind = async (object: string): Promise<boolean | null> =>
      request([[`x:${object}/get`, { ids: ["singleton"] }, "s"]])
        .then(([response]) => {
          const type = (response![1].list as { "@type"?: string }[] | undefined)?.[0]?.["@type"];
          return type ? type !== "Disabled" : null;
        })
        .catch(() => null);
    const [metricsOn, tracesOn] = await Promise.all([kind("MetricsStore"), kind("TracingStore")]);
    return { metrics: metricsOn, traces: tracesOn };
  };

  return { metrics, traces, recording };
};

export type ServerHealth = ReturnType<typeof createServerHealth>;

export const periodOf = (value: string | undefined): Period => (value === "week" ? "week" : "day");

export const serverHealthRoutes = ({
  health,
  edition,
  now = () => new Date(),
}: {
  health: ServerHealth;
  edition?: EditionCheck;
  now?: () => Date;
}) => {
  const app = new Hono<Env>();
  app.get("/", async (c) => {
    if ((await edition?.()) !== "enterprise") {
      return c.json({ error: "Nur mit Stalwart Enterprise." }, 403);
    }
    const period = periodOf(c.req.query("period"));
    const at = now();
    const since = sinceOf(period, at);
    const [samples, traces, recording] = await Promise.all([
      health.metrics(since),
      health.traces(since),
      health.recording(),
    ]);
    const { employees, mailboxes } = c.get("loaded").company;
    const view: ServerHealthView = {
      period,
      recording,
      metrics: samples ? overviewOf(samples, period, at) : null,
      problems: traces ? deliveryProblems(traces) : null,
      storageBytes: [...employees, ...mailboxes].reduce((sum, item) => sum + item.usedBytes, 0),
    };
    return c.json(view);
  });
  return app;
};
