// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createExchange, exchangeRoutes } from "./exchange";
import type { Invocation } from "./management";

const fake = (handlers: Record<string, (args: Record<string, unknown>) => unknown>) => {
  const calls: [string, Record<string, unknown>][] = [];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> =>
    methodCalls.map(([name, args, id]) => {
      calls.push([name, args]);
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected ${name}`);
      return [name, handler(args) as Record<string, unknown>, id];
    });
  return { request, calls };
};

describe("createExchange", () => {
  it("liest x:Exchange.enable und meldet known: false bei fehlenden Rechten", async () => {
    const on = fake({ "x:Exchange/get": () => ({ list: [{ enable: true }] }) });
    expect(await createExchange(on.request).read()).toEqual({ known: true, enabled: true });

    const forbidden = fake({
      "x:Exchange/get": () => {
        throw new Error("forbidden");
      },
    });
    expect(await createExchange(forbidden.request).read()).toEqual({
      known: false,
      enabled: false,
    });
  });

  it("schreibt x:Exchange.enable und löst ReloadSettings aus", async () => {
    let enabled = false;
    const { request, calls } = fake({
      "x:Exchange/get": () => ({ list: [{ enable: enabled }] }),
      "x:Exchange/set": (args) => {
        enabled = Boolean((args.update as { singleton?: { enable?: boolean } })?.singleton?.enable);
        return { updated: { singleton: null } };
      },
      "x:Action/set": () => ({ created: { r: { id: "1" } } }),
    });
    const app = exchangeRoutes(createExchange(request));
    const response = await app.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ known: true, enabled: true });
    expect(calls.map(([name]) => name)).toEqual([
      "x:Exchange/set",
      "x:Action/set",
      "x:Exchange/get",
    ]);
    expect(calls[1]?.[1]).toEqual({ create: { r: { "@type": "ReloadSettings" } } });
  });

  it("bricht vor ReloadSettings ab, wenn x:Exchange/set scheitert", async () => {
    const { request, calls } = fake({
      "x:Exchange/set": () => ({
        notUpdated: { singleton: { type: "forbidden", description: "Keine Rechte" } },
      }),
    });
    const result = await createExchange(request).setEnabled(true);
    expect(result).toEqual({ ok: false, error: "Keine Rechte" });
    expect(calls.map(([name]) => name)).toEqual(["x:Exchange/set"]);
  });

  it("meldet known: false, wenn x:Exchange/get eine leere Liste liefert", async () => {
    const empty = fake({ "x:Exchange/get": () => ({ list: [], notFound: ["singleton"] }) });
    expect(await createExchange(empty.request).read()).toEqual({
      known: false,
      enabled: false,
    });
  });

  it("liefert bei einem JMAP-Methodenfehler in PUT / einen 400-Fehler statt 500", async () => {
    const { request, calls } = fake({
      "x:Exchange/set": () => {
        throw new Error("forbidden");
      },
    });
    const app = exchangeRoutes(createExchange(request));
    const response = await app.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(calls.map(([name]) => name)).toEqual(["x:Exchange/set"]);
  });
});

