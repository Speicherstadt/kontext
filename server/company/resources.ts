/**
 * Räume und Geräte in der Firmenverwaltung (neu in Stalwart 1.2): `x:Account` mit
 * `@type: "Resource"` (`ResourceAccount`, `ResourceBooking`, `AutomaticBooking` in
 * `crates/registry/src/schema/structs.rs`; `ResourceKind` als `"room"`/`"equipment"` in
 * `enums_impl.rs`; `Duration` in JMAP als Millisekunden `u64` in `types/duration.rs`).
 * Rechte: `sysAccountGet`, `sysAccountCreate`, `sysAccountUpdate`, `sysAccountDestroy` (bereits
 * in `KONTEXT_SERVER_RIGHTS`).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Domain, Result } from "./accounts";
import { bad, bodyOf, type Env } from "./context";
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export type ResourceKind = "room" | "equipment";

export type ResourceBooking =
  | {
      mode: "automatic";
      allowConflicts: boolean;
      allowRecurring: boolean;
      allowExternal: boolean;
      bookingWindowDays: number | null;
      maxDurationMinutes: number | null;
    }
  | { mode: "manual" };

export type Resource = {
  id: string;
  email: string;
  name: string;
  description: string;
  kind: ResourceKind;
  capacity: number | null;
  location: string;
  delegateIds: string[];
  booking: ResourceBooking;
};

type RawBooking =
  | {
      "@type": "Automatic";
      allowConflicts?: boolean;
      allowRecurring?: boolean;
      allowExternal?: boolean;
      bookingWindow?: number | null;
      maxDuration?: number | null;
    }
  | { "@type": "Manual" };

export type RawResourceAccount = {
  id: string;
  "@type": string;
  name: string;
  domainId: string;
  description?: string | null;
  emailAddress?: string;
  kind?: ResourceKind;
  capacity?: number | null;
  location?: string | null;
  delegateIds?: Record<string, boolean>;
  booking?: RawBooking;
};

const bookingSchema = z.union([
  z.object({
    mode: z.literal("automatic"),
    allowConflicts: z.boolean(),
    allowRecurring: z.boolean(),
    allowExternal: z.boolean(),
    bookingWindowDays: z.number().int().positive().max(3650).nullable(),
    maxDurationMinutes: z.number().int().positive().max(43_200).nullable(),
  }),
  z.object({ mode: z.literal("manual") }),
]);

export const resourceUpdateSchema = z.object({
  description: z.string().trim().min(1).max(120),
  kind: z.enum(["room", "equipment"]),
  capacity: z.number().int().positive().max(10_000).nullable(),
  location: z.string().trim().max(120),
  delegateIds: z.array(z.string().min(1)).max(100),
  booking: bookingSchema,
});

export const newResourceSchema = resourceUpdateSchema.extend({
  local: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9._-]+$/),
  domainId: z.string().min(1),
});

export type ResourceUpdate = z.infer<typeof resourceUpdateSchema>;
export type NewResource = z.infer<typeof newResourceSchema>;

const fromStalwartBooking = (booking: RawBooking | undefined): ResourceBooking => {
  if (booking?.["@type"] === "Manual") return { mode: "manual" };
  return {
    mode: "automatic",
    allowConflicts: Boolean(booking?.allowConflicts),
    allowRecurring: booking?.allowRecurring ?? true,
    allowExternal: Boolean(booking?.allowExternal),
    bookingWindowDays: booking?.bookingWindow
      ? Math.round(booking.bookingWindow / MS_PER_DAY)
      : null,
    maxDurationMinutes: booking?.maxDuration
      ? Math.round(booking.maxDuration / MS_PER_MINUTE)
      : null,
  };
};

/** Wandelt Stalwarts `ResourceAccount` in die Form für die Firmenverwaltung um. */
export const toResource = (raw: RawResourceAccount, domains: Domain[]): Resource => {
  const domain = domains.find((d) => d.id === raw.domainId)?.name ?? "";
  return {
    id: raw.id,
    email: raw.emailAddress ?? (domain ? `${raw.name}@${domain}` : raw.name),
    name: raw.name,
    description: raw.description ?? "",
    kind: raw.kind === "equipment" ? "equipment" : "room",
    capacity: raw.capacity ?? null,
    location: raw.location ?? "",
    delegateIds: Object.keys(raw.delegateIds ?? {}).filter((id) => raw.delegateIds?.[id]),
    booking: fromStalwartBooking(raw.booking),
  };
};

/** Wandelt die Buchungsregel in Stalwarts `ResourceBooking` (`Duration` in Millisekunden). */
export const toStalwartBooking = (booking: ResourceBooking): RawBooking =>
  booking.mode === "manual"
    ? { "@type": "Manual" }
    : {
        "@type": "Automatic",
        allowConflicts: booking.allowConflicts,
        allowRecurring: booking.allowRecurring,
        allowExternal: booking.allowExternal,
        bookingWindow: booking.bookingWindowDays ? booking.bookingWindowDays * MS_PER_DAY : null,
        maxDuration: booking.maxDurationMinutes ? booking.maxDurationMinutes * MS_PER_MINUTE : null,
      };

const delegateMap = (ids: string[]): Record<string, true> =>
  Object.fromEntries(ids.map((id) => [id, true]));

/** Baut das `x:Account`-Objekt mit `@type: "Resource"` für `x:Account/set` (`create`). */
export const createResourceObject = (input: NewResource) => ({
  "@type": "Resource",
  name: input.local,
  domainId: input.domainId,
  description: input.description,
  kind: input.kind,
  capacity: input.capacity,
  location: input.location || null,
  delegateIds: delegateMap(input.delegateIds),
  booking: toStalwartBooking(input.booking),
});

/** Baut den Patch für `x:Account/set` (`update`). */
export const updateResourcePatch = (input: ResourceUpdate) => ({
  description: input.description,
  kind: input.kind,
  capacity: input.capacity,
  location: input.location || null,
  delegateIds: delegateMap(input.delegateIds),
  booking: toStalwartBooking(input.booking),
});

const RESOURCE_PROPERTIES = [
  "@type",
  "name",
  "domainId",
  "description",
  "emailAddress",
  "kind",
  "capacity",
  "location",
  "delegateIds",
  "booking",
];

export const createResources = (request: Request) => {
  const list = async (domains: Domain[]): Promise<Resource[]> => {
    const [response] = await request([
      ["x:Account/get", { ids: null, properties: RESOURCE_PROPERTIES }, "r"],
    ]);
    const accounts = (response![1].list as RawResourceAccount[]) ?? [];
    return accounts
      .filter((account) => account["@type"] === "Resource")
      .map((account) => toResource(account, domains))
      .sort((a, b) => (a.description || a.email).localeCompare(b.description || b.email));
  };

  const create = async (input: NewResource): Promise<Result<{ id: string }>> => {
    const [response] = await request([
      ["x:Account/set", { create: { r: createResourceObject(input) } }, "0"],
    ]);
    const result = response![1] as SetResult & { created?: Record<string, { id: string }> };
    const error = firstError(result);
    if (error) return { ok: false, error };
    const id = result.created?.r?.id;
    return id ? { ok: true, value: { id } } : { ok: false, error: "Ressource nicht angelegt." };
  };

  const update = async (id: string, input: ResourceUpdate): Promise<Result<null>> => {
    const [response] = await request([
      ["x:Account/set", { update: { [id]: updateResourcePatch(input) } }, "0"],
    ]);
    const error = firstError(response![1] as SetResult);
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  const remove = async (id: string): Promise<Result<null>> => {
    const [response] = await request([["x:Account/set", { destroy: [id] }, "0"]]);
    const error = firstError(response![1] as SetResult);
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  return { list, create, update, remove };
};

export type Resources = ReturnType<typeof createResources>;

export const resourceRoutes = (resources: Resources) => {
  const app = new Hono<Env>();
  app.get("/", async (c) =>
    c.json({ resources: await resources.list(c.get("loaded").company.domains) }),
  );
  app.post("/", async (c) => {
    const body = await bodyOf(c, newResourceSchema);
    if (!body) return bad("Angaben unvollständig oder ungültig.");
    const result = await resources.create(body);
    return result.ok ? c.json(result.value, 201) : bad(result.error);
  });
  app.put("/:id", async (c) => {
    const body = await bodyOf(c, resourceUpdateSchema);
    if (!body) return bad("Angaben unvollständig oder ungültig.");
    const result = await resources.update(c.req.param("id"), body);
    return result.ok ? c.json({ ok: true }) : bad(result.error);
  });
  app.delete("/:id", async (c) => {
    const result = await resources.remove(c.req.param("id"));
    return result.ok ? c.json({ ok: true }) : bad(result.error);
  });
  return app;
};
