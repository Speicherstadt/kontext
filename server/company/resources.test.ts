// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env, Loaded } from "./context";
import type { Invocation } from "./management";
import {
  createResourceObject,
  createResources,
  resourceRoutes,
  toResource,
  toStalwartBooking,
  updateResourcePatch,
} from "./resources";

const domains = [{ id: "d1", name: "weber.test" }];

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

describe("toResource und Buchungsregeln", () => {
  it("wandelt ResourceAccount mit automatischer Buchung und Millisekunden-Dauern um", () => {
    const resource = toResource(
      {
        id: "r1",
        "@type": "Resource",
        name: "besprechungsraum",
        domainId: "d1",
        description: "Besprechungsraum 1",
        kind: "room",
        capacity: 8,
        location: "1. OG",
        delegateIds: { u1: true, u2: false },
        booking: {
          "@type": "Automatic",
          allowConflicts: false,
          allowRecurring: true,
          allowExternal: false,
          bookingWindow: 90 * 86_400_000,
          maxDuration: 120 * 60_000,
        },
      },
      domains,
    );
    expect(resource).toEqual({
      id: "r1",
      email: "besprechungsraum@weber.test",
      name: "besprechungsraum",
      description: "Besprechungsraum 1",
      kind: "room",
      capacity: 8,
      location: "1. OG",
      delegateIds: ["u1"],
      booking: {
        mode: "automatic",
        allowConflicts: false,
        allowRecurring: true,
        allowExternal: false,
        bookingWindowDays: 90,
        maxDurationMinutes: 120,
      },
    });
    expect(toStalwartBooking(resource.booking)).toEqual({
      "@type": "Automatic",
      allowConflicts: false,
      allowRecurring: true,
      allowExternal: false,
      bookingWindow: 90 * 86_400_000,
      maxDuration: 120 * 60_000,
    });
  });

  it("baut Create-Objekt und Update-Patch für manuelle Geräte", () => {
    const created = createResourceObject({
      local: "transporter",
      domainId: "d1",
      description: "Sprinter",
      kind: "equipment",
      capacity: null,
      location: "Hof",
      delegateIds: ["u1"],
      booking: { mode: "manual" },
    });
    expect(created).toEqual({
      "@type": "Resource",
      name: "transporter",
      domainId: "d1",
      description: "Sprinter",
      kind: "equipment",
      capacity: null,
      location: "Hof",
      delegateIds: { u1: true },
      booking: { "@type": "Manual" },
    });
    expect(
      updateResourcePatch({
        description: "Sprinter 2",
        kind: "equipment",
        capacity: null,
        location: "",
        delegateIds: [],
        booking: { mode: "manual" },
      }),
    ).toEqual({
      description: "Sprinter 2",
      kind: "equipment",
      capacity: null,
      location: null,
      delegateIds: {},
      booking: { "@type": "Manual" },
    });
  });
});

describe("createResources", () => {
  it("filtert nur Resource-Konten und unterstützt Anlegen, Ändern und Löschen", async () => {
    const { request, calls } = fake({
      "x:Account/get": () => ({
        list: [
          { id: "u1", "@type": "User", name: "jonas", domainId: "d1" },
          {
            id: "r1",
            "@type": "Resource",
            name: "raum1",
            domainId: "d1",
            description: "Raum 1",
            kind: "room",
          },
        ],
      }),
      "x:Account/set": (args) =>
        args.create
          ? { created: { r: { id: "r2" } } }
          : args.update
            ? { updated: { r1: null } }
            : { destroyed: ["r1"] },
    });
    const service = createResources(request);
    const list = await service.list(domains);
    expect(list.map((r) => r.id)).toEqual(["r1"]);

    expect(
      await service.create({
        local: "beamer",
        domainId: "d1",
        description: "Beamer",
        kind: "equipment",
        capacity: null,
        location: "",
        delegateIds: [],
        booking: { mode: "manual" },
      }),
    ).toEqual({ ok: true, value: { id: "r2" } });

    expect(
      await service.update("r1", {
        description: "Raum 1 neu",
        kind: "room",
        capacity: 10,
        location: "EG",
        delegateIds: ["u1"],
        booking: { mode: "manual" },
      }),
    ).toEqual({ ok: true, value: null });

    expect(await service.remove("r1")).toEqual({ ok: true, value: null });
    expect(calls.map(([method]) => method)).toEqual([
      "x:Account/get",
      "x:Account/set",
      "x:Account/set",
      "x:Account/set",
    ]);
  });
});

describe("resourceRoutes Absicherung", () => {
  const loaded = {
    company: { domains, employees: [], mailboxes: [] },
    accounts: [
      {
        id: "u1",
        "@type": "User",
        name: "jonas",
        domainId: "d1",
        roles: { "@type": "Custom", roleIds: { userRole: true } },
      },
      { id: "g1", "@type": "Group", name: "info", domainId: "d1" },
      { id: "r1", "@type": "Resource" as never, name: "raum1", domainId: "d1" },
    ],
    folders: {},
    roles: { userRoleIds: ["userRole"], companyRoleId: "companyRole" },
    selfId: "u1",
  } as unknown as Loaded;

  const validUpdate = {
    description: "Raum 1",
    kind: "room",
    capacity: 6,
    location: "1. OG",
    delegateIds: ["u1"],
    booking: { mode: "manual" },
  };

  const makeApp = () => {
    const { request, calls } = fake({
      "x:Account/set": () => ({ created: { r: { id: "r2" } }, updated: {}, destroyed: [] }),
    });
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
      c.set("loaded", loaded);
      await next();
    });
    app.route("/", resourceRoutes(createResources(request)));
    return { app, calls };
  };

  it("lehnt Ändern und Löschen von Nicht-Ressourcen-Konten (User/Group) mit 404 ab", async () => {
    const { app, calls } = makeApp();
    const delRes = await app.request("/u1", { method: "DELETE" });
    expect(delRes.status).toBe(404);
    const putRes = await app.request("/g1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validUpdate),
    });
    expect(putRes.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("lehnt unbekannte domainId und unbekannte delegateIds mit 400 ab", async () => {
    const { app, calls } = makeApp();
    const badDomain = await app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validUpdate, local: "raum2", domainId: "fremd" }),
    });
    expect(badDomain.status).toBe(400);

    const badDelegateCreate = await app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...validUpdate,
        local: "raum2",
        domainId: "d1",
        delegateIds: ["unbekannt"],
      }),
    });
    expect(badDelegateCreate.status).toBe(400);

    const badDelegateUpdate = await app.request("/r1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validUpdate, delegateIds: ["unbekannt"] }),
    });
    expect(badDelegateUpdate.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
