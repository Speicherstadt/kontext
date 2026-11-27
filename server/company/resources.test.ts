// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Invocation } from "./management";
import {
  createResourceObject,
  createResources,
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
