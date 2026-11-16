import { describe, expect, it } from "vitest";
import { brandingRoutes, createBranding } from "./branding";
import type { Edition } from "./edition";
import type { Invocation } from "./management";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString(
  "base64",
);

/** A Stalwart that keeps the calls and answers the gets; `denied` like a key without the rights. */
const fakeStalwart = ({
  denied = false,
  edition = "enterprise" as Edition,
  refuse = false,
} = {}) => {
  const calls: Invocation[] = [];
  const request = async (methodCalls: Invocation[]): Promise<Invocation[]> => {
    if (denied) throw new Error("forbidden");
    calls.push(...methodCalls);
    return methodCalls.map(([name, , id]): Invocation => {
      if (name === "x:Enterprise/get")
        return [name, { list: [{ logo: `data:image/png;base64,${PNG}` }] }, id];
      if (name === "x:CalendarAlarm/get")
        return [name, { list: [{ template: "<p>{{header}}</p>" }] }, id];
      if (name === "x:CalendarScheduling/get")
        return [name, { list: [{ emailTemplate: null }] }, id];
      if (refuse && name.endsWith("/set") && name !== "x:Action/set")
        return [
          name,
          { notUpdated: { singleton: { type: "invalidPatch", description: "Nein" } } },
          id,
        ];
      return [name, {}, id];
    });
  };
  const app = brandingRoutes(createBranding(request), { edition: async () => edition });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { calls, send };
};

describe("Firmenlogo und Vorlagen", () => {
  it("reads the logo and the templates from Stalwart, null for Stalwart's own", async () => {
    const { calls, send } = fakeStalwart();
    expect(await (await send("GET", "/")).json()).toEqual({
      known: true,
      logo: `data:image/png;base64,${PNG}`,
      templates: { alarm: "<p>{{header}}</p>", invitation: null },
    });
    // Only the logo of x:Enterprise, never the license or API key.
    expect(calls[0]).toEqual([
      "x:Enterprise/get",
      { ids: ["singleton"], properties: ["logo"] },
      "e",
    ]);
  });

  it("says so when Kontext's key may not read them", async () => {
    const { send } = fakeStalwart({ denied: true });
    expect((await (await send("GET", "/")).json()).known).toBe(false);
  });

  it("refuses everything without Stalwart Enterprise", async () => {
    for (const edition of ["community", "unknown"] as Edition[]) {
      const { calls, send } = fakeStalwart({ edition });
      expect((await send("GET", "/")).status).toBe(403);
      expect((await send("PUT", "/logo", { logo: null })).status).toBe(403);
      expect(calls).toEqual([]);
    }
  });

  it("stores a checked logo, then Stalwart reloads and forgets its cached logos", async () => {
    const { calls, send } = fakeStalwart();
    const response = await send("PUT", "/logo", { logo: `data:image/jpeg;base64,${PNG}` });
    expect(response.status).toBe(200);
    expect(calls.slice(0, 2)).toEqual([
      [
        "x:Enterprise/set",
        { update: { singleton: { logo: `data:image/png;base64,${PNG}` } } },
        "u",
      ],
      [
        "x:Action/set",
        { create: { r0: { "@type": "ReloadSettings" }, r1: { "@type": "InvalidateCaches" } } },
        "r",
      ],
    ]);
  });

  it("removes the logo with null and refuses what is no image", async () => {
    const { calls, send } = fakeStalwart();
    expect((await send("PUT", "/logo", { logo: null })).status).toBe(200);
    expect(calls[0]![1]).toEqual({ update: { singleton: { logo: null } } });
    const pdf = Buffer.from("%PDF-1.7").toString("base64");
    const refused = await send("PUT", "/logo", { logo: `data:application/pdf;base64,${pdf}` });
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain("PNG");
  });

  it("stores a template where Stalwart keeps it, or null for its own", async () => {
    const { calls, send } = fakeStalwart();
    await send("PUT", "/templates/invitation", { template: "<p>{{event_title}}</p>" });
    await send("PUT", "/templates/alarm", { template: null });
    const sets = calls.filter(([name]) => name !== "x:Action/set" && name.endsWith("/set"));
    expect(sets).toEqual([
      [
        "x:CalendarScheduling/set",
        { update: { singleton: { emailTemplate: "<p>{{event_title}}</p>" } } },
        "u",
      ],
      ["x:CalendarAlarm/set", { update: { singleton: { template: null } } }, "u"],
    ]);
  });

  it("refuses a template Stalwart could not read, and an unknown kind", async () => {
    const { calls, send } = fakeStalwart();
    const broken = await send("PUT", "/templates/alarm", { template: "{{#if header}}" });
    expect(broken.status).toBe(400);
    expect((await broken.json()).error).toBe(
      "Stalwart kann die Vorlage nicht lesen: Unmatched {: header",
    );
    expect((await send("PUT", "/templates/alarm", { template: " " })).status).toBe(400);
    expect((await send("PUT", "/templates/web", { template: "<p></p>" })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("passes on Stalwart's refusal", async () => {
    const { send } = fakeStalwart({ refuse: true });
    const response = await send("PUT", "/templates/alarm", { template: "<p></p>" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Nein");
  });
});
