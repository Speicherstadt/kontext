/**
 * /api/company/archive: Gelöschte Elemente wiederherstellen (archive.ts). Every signed-in user
 * sees the items of their own account and of the shared mailboxes they are a member of; the
 * admin of the Firmenverwaltung those of every employee and shared mailbox, and sets how long
 * Stalwart keeps them. Only with Stalwart Enterprise (edition.ts); otherwise 404.
 */
import { Hono } from "hono";
import { z } from "zod";
import { type Company, type Roles, toCompany } from "./accounts";
import { type Archive, type ArchivedItem, DAY_MS, type Retention } from "./archive";
import { bad, bodyOf, type CompanyDeps, type Ctx, type Env } from "./context";

/** An account whose deleted items the caller may see. */
export type ArchiveAccount = { id: string; email: string; name: string; kind: "own" | "mailbox" };

export type ArchiveView = { accounts: ArchiveAccount[]; retention: Retention; admin: boolean };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The caller's own account and their shared mailboxes; nothing for a locked account. Pure. */
export const ownArchiveAccounts = (
  company: Pick<Company, "employees" | "mailboxes">,
  email: string,
): ArchiveAccount[] => {
  const self = company.employees.find((e) => sameAddress(e.email, email));
  if (!self?.active) return [];
  return [
    { id: self.id, email: self.email, name: self.fullName, kind: "own" },
    ...company.mailboxes
      .filter((mailbox) => mailbox.memberIds.includes(self.id))
      .map((mailbox) => ({
        id: mailbox.id,
        email: mailbox.email,
        name: mailbox.description || mailbox.email,
        kind: "mailbox" as const,
      })),
  ];
};

/** The ids the caller may work with: their own, or every account of the company for the admin. */
export const allowedAccountIds = (
  company: Pick<Company, "employees" | "mailboxes">,
  email: string,
  admin: boolean,
): Set<string> =>
  new Set(
    admin
      ? [...company.employees, ...company.mailboxes].map((account) => account.id)
      : ownArchiveAccounts(company, email).map((account) => account.id),
  );

/** Whether every asked-for item is there, belongs to the account and can be restored. Pure. */
export const checkItems = (
  items: ArchivedItem[],
  ids: string[],
  accountId: string,
  restoring: boolean,
): string | null => {
  const found = new Map(items.map((item) => [item.id, item]));
  for (const id of ids) {
    const item = found.get(id);
    if (!item || item.accountId !== accountId) return "Nicht gefunden";
    if (restoring && !item.restorable)
      return "Stalwart kann diese Art noch nicht wiederherstellen.";
  }
  return null;
};

/** 0 or no days: Stalwart keeps nothing. Up to ten years. */
export const retentionSchema = z.object({ days: z.number().int().min(0).max(3650).nullable() });
const idsSchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500) });

type Caller = { email: string; company: Company; admin: boolean };

export const archiveRoutes = (deps: CompanyDeps & { archive?: Archive }) => {
  const app = new Hono<Env>();
  let roles: Roles | undefined;

  const callerOf = async (request: Request): Promise<Caller | null> => {
    const email = await deps.currentEmail(request);
    if (!email) return null;
    roles ??= await deps.management.loadRoles();
    const [accounts, domains] = await Promise.all([
      deps.management.listAccounts(),
      deps.management.listDomains(),
    ]);
    const company = toCompany(accounts, roles, domains);
    const self = company.employees.find((e) => sameAddress(e.email, email));
    return { email, company, admin: Boolean(self?.admin && self.active) };
  };

  /** Signed in, Enterprise, and the archive set up; else the answer to give. */
  const guard = async (
    request: Request,
  ): Promise<{ caller: Caller; archive: Archive } | Response> => {
    const caller = await callerOf(request);
    if (!caller) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    const enterprise = deps.edition ? (await deps.edition()) === "enterprise" : false;
    if (!enterprise || !deps.archive)
      return Response.json({ error: "Nur mit Stalwart Enterprise" }, { status: 404 });
    return { caller, archive: deps.archive };
  };

  app.get("/", async (c) => {
    const ready = await guard(c.req.raw);
    if (ready instanceof Response) return ready;
    const { caller, archive } = ready;
    const view: ArchiveView = {
      accounts: ownArchiveAccounts(caller.company, caller.email),
      retention: await archive.retention(),
      admin: caller.admin,
    };
    return c.json(view);
  });

  /** The account's items, when the caller may see them (404 alike for others: no probing). */
  const withAccount = async (request: Request, accountId: string) => {
    const ready = await guard(request);
    if (ready instanceof Response) return ready;
    const { caller } = ready;
    if (!allowedAccountIds(caller.company, caller.email, caller.admin).has(accountId))
      return Response.json({ error: "Nicht gefunden" }, { status: 404 });
    return ready;
  };

  const listAnswer = async (archive: Archive, accountId: string) => {
    const items = await archive.list(accountId);
    return items.ok ? Response.json({ items: items.value }) : bad(items.error);
  };

  app.get("/accounts/:id", async (c) => {
    const ready = await withAccount(c.req.raw, c.req.param("id"));
    if (ready instanceof Response) return ready;
    return listAnswer(ready.archive, c.req.param("id"));
  });

  const change = (restoring: boolean) => async (c: Ctx) => {
    const accountId = c.req.param("id") ?? "";
    const ready = await withAccount(c.req.raw, accountId);
    if (ready instanceof Response) return ready;
    const body = await bodyOf(c, idsSchema);
    if (!body) return bad("Keine Elemente gewählt.");
    const items = await ready.archive.get(body.ids);
    if (!items.ok) return bad(items.error);
    const problem = checkItems(items.value, body.ids, accountId, restoring);
    if (problem) return bad(problem);
    const done = restoring
      ? await ready.archive.restore(body.ids)
      : await ready.archive.destroy(body.ids);
    return done.ok ? listAnswer(ready.archive, accountId) : bad(done.error);
  };
  app.post("/accounts/:id/restore", change(true));
  app.post("/accounts/:id/destroy", change(false));

  /** Only the admin: how many days Stalwart keeps deleted items (0: none). */
  app.put("/retention", async (c) => {
    const ready = await guard(c.req.raw);
    if (ready instanceof Response) return ready;
    if (!ready.caller.admin) return c.json({ error: "Keine Berechtigung" }, 403);
    const body = await bodyOf(c, retentionSchema);
    if (!body) return bad("Angaben unvollständig.");
    const done = await ready.archive.setRetention(body.days ? body.days * DAY_MS : null);
    return done.ok ? c.json({ retention: await ready.archive.retention() }) : bad(done.error);
  });

  return app;
};
