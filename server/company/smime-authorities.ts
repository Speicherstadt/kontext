/**
 * The S/MIME authorities the company trusts beyond Mozilla's list, as the Firmenverwaltung edits them
 * (the list and its checks are in smime/authorities.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  type AuthorityStore,
  MAX_AUTHORITIES,
  parseAuthority,
  refusal,
} from "../smime/authorities";
import type { Env } from "./context";

type Store = Pick<AuthorityStore, "list" | "add" | "remove">;

/** The Firmenverwaltung's list, behind its check (company/routes.ts). */
export const authorityRoutes = (store: Store, now: () => Date = () => new Date()) => {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ authorities: await store.list() }));
  app.post("/", async (c) => {
    const parsed = z
      .object({ certificate: z.string().min(100).max(50_000) })
      .safeParse(await c.req.json().catch(() => null));
    const cert = parsed.success ? parseAuthority(parsed.data.certificate) : null;
    if (!cert) return c.json({ error: "Kein Zertifikat (PEM oder DER)." }, 400);
    const why = refusal(cert, now());
    if (why) return c.json({ error: why }, 400);
    const kept = await store.list();
    if (kept.some((entry) => entry.fingerprint === cert.fingerprint256)) {
      return c.json({ error: "Diese Stelle ist schon eingetragen." }, 409);
    }
    if (kept.length >= MAX_AUTHORITIES) {
      return c.json({ error: `Höchstens ${MAX_AUTHORITIES} Stellen.` }, 400);
    }
    const { company, selfId } = c.get("loaded");
    const self = company.employees.find((employee) => employee.id === selfId);
    const authority = await store.add(cert, self?.email ?? selfId, now());
    return c.json({ authority, authorities: await store.list() }, 201);
  });
  app.delete("/:fingerprint", async (c) => {
    await store.remove(c.req.param("fingerprint"));
    return c.json({ authorities: await store.list() });
  });
  return app;
};
