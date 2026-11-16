import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env, Loaded } from "./context";
import type { Edition } from "./edition";
import type { Invocation } from "./management";
import {
  createServerHealth,
  periodOf,
  type ServerHealthView,
  serverHealthRoutes,
} from "./server-health-routes";

const now = new Date("2026-11-16T10:20:00Z");

/** A Stalwart that answers the telemetry objects from these lists and keeps the calls. */
const fakeStalwart = ({
  metricIds = ["m1", "m2"],
  refuse = [] as string[],
  metricsStore = "Default",
} = {}) => {
  const calls: Invocation[] = [];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> => {
    calls.push(...methodCalls);
    return methodCalls.map(([name, args, id]): Invocation => {
      if (refuse.some((object) => name.startsWith(`x:${object}/`))) throw new Error("forbidden");
      if (name === "x:Metric/query") return [name, { ids: metricIds }, id];
      if (name === "x:Metric/get") {
        const ids = args.ids as string[];
        return [
          name,
          {
            list: ids.map((metricId) => ({
              id: metricId,
              "@type": "Counter",
              metric: "message-ingest.ham",
              count: 2,
              timestamp: "2026-11-16T09:00:00Z",
            })),
          },
          id,
        ];
      }
      if (name === "x:Trace/query") return [name, { ids: ["t1"] }, id];
      if (name === "x:Trace/get") {
        return [
          name,
          {
            list: [
              {
                id: "t1",
                events: [
                  {
                    event: "delivery.dsn-perm-fail",
                    timestamp: "2026-11-16T09:00:00Z",
                    keyValues: [
                      { key: "to", value: { "@type": "String", value: "x@kunde.test" } },
                      { key: "details", value: { "@type": "String", value: "User unknown" } },
                    ],
                  },
                ],
              },
            ],
          },
          id,
        ];
      }
      if (name === "x:MetricsStore/get") return [name, { list: [{ "@type": metricsStore }] }, id];
      if (name === "x:TracingStore/get") return [name, { list: [{ "@type": "Disabled" }] }, id];
      return ["error", { type: "unknownMethod" }, id];
    });
  };
  return { request, calls };
};

const loaded = {
  company: {
    employees: [{ usedBytes: 1000 }, { usedBytes: 500 }],
    mailboxes: [{ usedBytes: 250 }],
  },
} as unknown as Loaded;

const appWith = (stalwart: ReturnType<typeof fakeStalwart>, edition: Edition = "enterprise") => {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("loaded", loaded);
    await next();
  });
  app.route(
    "/server-health",
    serverHealthRoutes({
      health: createServerHealth(stalwart.request),
      edition: async () => edition,
      now: () => now,
    }),
  );
  return app;
};

describe("periodOf", () => {
  it("reads week, else the day", () => {
    expect(periodOf("week")).toBe("week");
    expect(periodOf(undefined)).toBe("day");
    expect(periodOf("year")).toBe("day");
  });
});

describe("server health route", () => {
  it("refuses without Stalwart Enterprise and asks Stalwart nothing", async () => {
    const stalwart = fakeStalwart();
    const response = await appWith(stalwart, "community").request("/server-health");
    expect(response.status).toBe(403);
    expect(stalwart.calls).toEqual([]);
  });

  it("answers counts, problems, storage and what Stalwart records", async () => {
    const stalwart = fakeStalwart();
    const response = await appWith(stalwart).request("/server-health?period=day");
    const view = (await response.json()) as ServerHealthView;
    expect(view.period).toBe("day");
    expect(view.recording).toEqual({ metrics: true, traces: false });
    expect(view.metrics?.totals.received).toBe(4);
    expect(view.problems).toMatchObject([{ to: "x@kunde.test", reason: "User unknown" }]);
    expect(view.storageBytes).toBe(1750);
    const query = stalwart.calls.find(([name]) => name === "x:Metric/query")!;
    expect(query[1].filter).toMatchObject({
      timestampIsGreaterThanOrEqual: "2026-11-15T11:00:00.000Z",
    });
  });

  it("fetches many metrics in parts Stalwart accepts", async () => {
    const stalwart = fakeStalwart({ metricIds: Array.from({ length: 1201 }, (_, i) => `m${i}`) });
    const view = (await (
      await appWith(stalwart).request("/server-health?period=week")
    ).json()) as ServerHealthView;
    const gets = stalwart.calls.filter(([name]) => name === "x:Metric/get");
    expect(gets.map(([, args]) => (args.ids as string[]).length)).toEqual([500, 500, 201]);
    expect(view.metrics?.samples).toBe(1201);
  });

  it("says null where Stalwart refuses, and still answers the rest", async () => {
    const stalwart = fakeStalwart({ refuse: ["Metric", "Trace", "TracingStore"] });
    const view = (await (
      await appWith(stalwart).request("/server-health")
    ).json()) as ServerHealthView;
    expect(view.metrics).toBeNull();
    expect(view.problems).toBeNull();
    expect(view.recording).toEqual({ metrics: true, traces: null });
    expect(view.storageBytes).toBe(1750);
  });
});
