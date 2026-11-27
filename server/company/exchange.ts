/**
 * Exchange und ActiveSync (neu in Stalwart 1.2): schaltet `x:Exchange.enable` um (EWS, MAPI über
 * HTTP, ActiveSync, Autodiscover) und lädt die Einstellungen mit `ReloadSettings` neu
 * (`Exchange` in `crates/registry/src/schema/structs.rs`, `ExchangeConfig::parse` in
 * `crates/common/src/config/exchange.rs`). Rechte: `sysExchangeGet`, `sysExchangeUpdate`,
 * `actionReloadSettings` (`server/stalwart-rights.ts`).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Result } from "./accounts";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

export type ExchangeView = { known: boolean; enabled: boolean };

const resultOf = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

export const createExchange = (request: Request) => {
  const set = async (method: string, args: Record<string, unknown>): Promise<Result<null>> => {
    try {
      return resultOf((await request([[method, args, "0"]]))[0]![1] as SetResult);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  /** `known: false`, wenn dem Server-Schlüssel die Rechte fehlen (Einrichtungsbefehl nicht erneut gelaufen). */
  const read = async (): Promise<ExchangeView> => {
    try {
      const [response] = await request([
        ["x:Exchange/get", { ids: ["singleton"], properties: ["enable"] }, "e"],
      ]);
      const settings = (response![1].list as { enable?: boolean }[])[0];
      if (!settings) return { known: false, enabled: false };
      return { known: true, enabled: Boolean(settings.enable) };
    } catch {
      return { known: false, enabled: false };
    }
  };

  /** Stalwart liest `x:Exchange` beim Start und bei `ReloadSettings` (`ExchangeConfig::parse`). */
  const setEnabled = async (enabled: boolean): Promise<Result<null>> => {
    const changed = await set("x:Exchange/set", { update: { singleton: { enable: enabled } } });
    if (!changed.ok) return changed;
    return set("x:Action/set", { create: { r: { "@type": "ReloadSettings" } } });
  };

  return { read, setEnabled };
};

export type Exchange = ReturnType<typeof createExchange>;

/** Liest den Exchange-Status für jeden angemeldeten Benutzer (für Einstellungen → Synchronisieren). */
export const readExchange = (deps: CompanyDeps) => async (raw: globalThis.Request) => {
  if (!(await deps.currentEmail(raw))) return null;
  return deps.exchange ? deps.exchange.read() : { known: false, enabled: false };
};

export const exchangeRoutes = (exchange: Exchange) => {
  const app = new Hono<Env>();
  app.put("/", async (c) => {
    const body = await bodyOf(c, z.object({ enabled: z.boolean() }));
    if (!body) return bad("Angaben unvollständig.");
    const result = await exchange.setEnabled(body.enabled);
    return result.ok ? c.json(await exchange.read()) : bad(result.error);
  });
  return app;
};
