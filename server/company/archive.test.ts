// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createArchive, DAY_MS, type RawArchivedItem, toArchivedItem } from "./archive";
import type { Invocation } from "./management";

const mail: RawArchivedItem = {
  id: "a1",
  "@type": "Email",
  accountId: "u2",
  from: "Kunde <kunde@example.com>",
  subject: " Angebot Heizung ",
  receivedAt: "2026-11-01T09:00:00Z",
  size: 2048,
  archivedAt: "2026-11-10T08:00:00Z",
  archivedUntil: "2026-12-10T08:00:00Z",
};

/** A Stalwart that answers each method from the table and keeps the calls. */
const stalwart = (answers: Record<string, Record<string, unknown> | Error>) => {
  const calls: Invocation[] = [];
  const request = vi.fn(async (methodCalls: Invocation[]) =>
    methodCalls.map(([name, args, id]): Invocation => {
      calls.push([name, args, id]);
      const answer = answers[name];
      if (answer instanceof Error) throw answer;
      return [name, answer ?? {}, id];
    }),
  );
  return { archive: createArchive(request), calls };
};

describe("toArchivedItem", () => {
  it("reads a mail: subject, sender, when it came, restorable", () => {
    expect(toArchivedItem(mail)).toEqual({
      id: "a1",
      accountId: "u2",
      kind: "Email",
      title: "Angebot Heizung",
      from: "Kunde <kunde@example.com>",
      date: "2026-11-01T09:00:00Z",
      size: 2048,
      archivedAt: "2026-11-10T08:00:00Z",
      archivedUntil: "2026-12-10T08:00:00Z",
      restorable: true,
    });
  });

  it("reads the other kinds, which Stalwart 1.1.0 cannot restore", () => {
    const event = toArchivedItem({
      id: "a2",
      "@type": "CalendarEvent",
      accountId: "u2",
      title: "Baustelle",
      startTime: null,
      createdAt: "2026-10-01T00:00:00Z",
      archivedAt: "2026-11-10T08:00:00Z",
      archivedUntil: "2026-12-10T08:00:00Z",
    });
    expect(event).toMatchObject({
      kind: "CalendarEvent",
      title: "Baustelle",
      from: null,
      date: "2026-10-01T00:00:00Z",
      restorable: false,
    });
    const card = toArchivedItem({ ...event, "@type": "ContactCard", name: null } as never);
    expect(card).toMatchObject({ kind: "ContactCard", restorable: false });
  });
});

describe("createArchive", () => {
  it("lists one account's items, newest deletion first, and nothing of others", async () => {
    const older = { ...mail, id: "a0", archivedAt: "2026-11-02T08:00:00Z" };
    const foreign = { ...mail, id: "a9", accountId: "u3" };
    const { archive, calls } = stalwart({
      "x:ArchivedItem/query": { ids: ["a0", "a1", "a9"] },
      "x:ArchivedItem/get": { list: [older, mail, foreign] },
    });
    const result = await archive.list("u2");
    expect(result.ok && result.value.map((item) => item.id)).toEqual(["a1", "a0"]);
    expect(calls[0]).toEqual([
      "x:ArchivedItem/query",
      { filter: { accountId: "u2" }, sort: [{ property: "id", isAscending: false }], limit: 500 },
      "0",
    ]);
    expect(calls[1]![1]).toEqual({ ids: ["a0", "a1", "a9"] });
  });

  it("asks for nothing more when the account has no items", async () => {
    const { archive, calls } = stalwart({ "x:ArchivedItem/query": { ids: [] } });
    expect(await archive.list("u2")).toEqual({ ok: true, value: [] });
    expect(calls).toHaveLength(1);
  });

  it("turns Stalwart's refusal (Community, missing rights) into a value", async () => {
    const { archive } = stalwart({
      "x:ArchivedItem/query": new Error(
        "This feature is only available in the Enterprise edition.",
      ),
    });
    expect(await archive.list("u2")).toEqual({
      ok: false,
      error: "This feature is only available in the Enterprise edition.",
    });
  });

  it("restores with status requestRestore and destroys for good", async () => {
    const { archive, calls } = stalwart({ "x:ArchivedItem/set": { updated: { a1: null } } });
    expect(await archive.restore(["a1"])).toEqual({ ok: true, value: null });
    expect(calls[0]![1]).toEqual({ update: { a1: { status: "requestRestore" } } });
    await archive.destroy(["a1"]);
    expect(calls[1]![1]).toEqual({ destroy: ["a1"] });
  });

  it("says Stalwart's reason when an item is gone", async () => {
    const { archive } = stalwart({
      "x:ArchivedItem/set": { notUpdated: { a1: { type: "notFound", description: "Weg" } } },
    });
    expect(await archive.restore(["a1"])).toEqual({ ok: false, error: "Weg" });
  });

  it("reads and sets how long Stalwart keeps deleted items, then reloads the settings", async () => {
    const { archive, calls } = stalwart({
      "x:DataRetention/get": { list: [{ archiveDeletedItemsFor: 30 * DAY_MS }] },
      "x:DataRetention/set": { updated: { singleton: null } },
      "x:Action/set": { created: { r: { id: "x" } } },
    });
    expect(await archive.retention()).toEqual({ known: true, ms: 30 * DAY_MS });
    expect(await archive.setRetention(null)).toEqual({ ok: true, value: null });
    expect(calls.map(([name]) => name)).toEqual([
      "x:DataRetention/get",
      "x:DataRetention/set",
      "x:Action/set",
    ]);
    expect(calls[1]![1]).toEqual({ update: { singleton: { archiveDeletedItemsFor: null } } });
  });

  it("does not know the retention when the key may not read it", async () => {
    const { archive } = stalwart({ "x:DataRetention/get": new Error("forbidden") });
    expect(await archive.retention()).toEqual({ known: false, ms: null });
  });
});
