/**
 * Gelöschte Elemente wiederherstellen needs Stalwart Enterprise; the e2e Stalwart is Community.
 * So the first test checks that nothing of it shows, and the others stand in for Kontext's own
 * /api/company/archive (server/company/archive-routes.ts, tested with Vitest) with `page.route`.
 */
import { expect, type Page, test } from "@playwright/test";
import { address, login, personalAccountId } from "./helpers";

type Item = {
  id: string;
  accountId: string;
  kind: string;
  title: string;
  from: string | null;
  date: string | null;
  size: number | null;
  archivedAt: string;
  archivedUntil: string;
  restorable: boolean;
};

const item = (id: string, accountId: string, title: string, kind = "Email"): Item => ({
  id,
  accountId,
  kind,
  title,
  from: kind === "Email" ? "Kunde <kunde@example.test>" : null,
  date: "2026-11-01T09:00:00Z",
  size: 2048,
  archivedAt: "2026-11-10T08:00:00Z",
  archivedUntil: "2026-12-10T08:00:00Z",
  restorable: kind === "Email",
});

/** Kontext's answers as with a licensed Stalwart: a list per account that restoring shortens. */
const enterprise = async (page: Page, { admin = false, ownId = "own" } = {}) => {
  const items: Item[] = [
    item("a1", ownId, "Angebot Wärmepumpe"),
    item("a2", ownId, "Baustellentermin", "CalendarEvent"),
  ];
  const sent: { path: string; body: unknown }[] = [];
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route("**/api/company/archive", (route) =>
    route.fulfill({
      json: {
        admin,
        retention: { known: true, ms: 30 * 24 * 60 * 60_000 },
        accounts: [
          { id: ownId, email: address("jonas"), name: "Jonas Weber", kind: "own" },
          { id: "info", email: "info@weber-haustechnik.test", name: "Info", kind: "mailbox" },
        ],
      },
    }),
  );
  await page.route("**/api/company/archive/accounts/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      const { ids } = request.postDataJSON() as { ids: string[] };
      sent.push({ path, body: { ids } });
      for (const id of ids)
        items.splice(
          items.findIndex((i) => i.id === id),
          1,
        );
    }
    await route.fulfill({ json: { items } });
  });
  await page.route("**/api/company/archive/retention", async (route) => {
    sent.push({ path: "/retention", body: route.request().postDataJSON() });
    await route.fulfill({ json: { retention: { known: true, ms: 7 * 24 * 60 * 60_000 } } });
  });
  return sent;
};

const restoreAndDelete = async (page: Page) => {
  const list = page.getByRole("list", { name: "Gelöschte Elemente" });
  await expect(list.getByText("Angebot Wärmepumpe")).toBeVisible();
  await expect(
    list.getByText("Stalwart kann diese Art noch nicht wiederherstellen."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wiederherstellen: Angebot Wärmepumpe" }).click();
  await expect(page.getByRole("status")).toContainText("Wird wiederhergestellt");
  await expect(list.getByText("Angebot Wärmepumpe")).toHaveCount(0);
  await page.getByRole("button", { name: "Endgültig löschen: Baustellentermin" }).click();
  await page
    .getByRole("dialog", { name: "Endgültig löschen?" })
    .getByRole("button", { name: "Endgültig löschen" })
    .click();
  await expect(page.getByText("Keine gelöschten Elemente.")).toBeVisible();
};

test.describe("Gelöschte Elemente", () => {
  test("ohne Enterprise-Lizenz gibt es sie nicht", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Darstellung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Gelöschte Elemente" })).toHaveCount(0);
    await page.goto("/settings?section=deleted");
    await expect(page.getByText("nur mit Stalwart Enterprise")).toBeVisible();
    await page.goto(`/mail/${await personalAccountId("jonas")}/trash`);
    await expect(page.getByRole("list", { name: "Papierkorb" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Endgültig Gelöschtes" })).toHaveCount(0);
  });

  test("vom Papierkorb aus wiederherstellen und endgültig löschen", async ({ page }) => {
    const ownId = await personalAccountId("jonas");
    const sent = await enterprise(page, { ownId });
    await login(page);
    await page.goto(`/mail/${ownId}/trash`);
    await page.getByRole("link", { name: "Endgültig Gelöschtes" }).click();
    await expect(page.getByRole("heading", { name: "Gelöschte Elemente" })).toBeVisible();
    await expect(page.getByTestId("deleted-retention")).toHaveText(
      "Stalwart hebt Gelöschtes 30 Tage auf.",
    );
    await expect(page.getByLabel("Postfach")).toContainText("Gemeinsam: info@");
    await restoreAndDelete(page);
    expect(sent.map((s) => s.path)).toEqual([
      `/api/company/archive/accounts/${ownId}/restore`,
      `/api/company/archive/accounts/${ownId}/destroy`,
    ]);
  });

  test("die Firmenverwaltung sieht die eines Mitarbeiters und stellt die Aufbewahrung ein", async ({
    page,
  }) => {
    const sent = await enterprise(page, { admin: true, ownId: "x" });
    await login(page);
    await page.goto("/settings?section=employees");
    await page.getByRole("button", { name: /Anna Weber/ }).click();
    await page.getByRole("button", { name: "Gelöschte Elemente von Anna Weber" }).click();
    const dialog = page.getByRole("dialog", { name: "Gelöschte Elemente von Anna Weber" });
    await expect(dialog.getByText("Angebot Wärmepumpe")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/settings?section=company-backup");
    await expect(page.getByTestId("deleted-retention")).toHaveText(
      "Stalwart hebt Gelöschtes 30 Tage auf.",
    );
    await page.getByLabel("Tage", { exact: true }).fill("7");
    await page
      .getByRole("region", { name: "Gelöschte Elemente aufbewahren" })
      .getByRole("button", { name: "Speichern" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Gespeichert");
    expect(sent.at(-1)).toEqual({ path: "/retention", body: { days: 7 } });
  });
});

test.describe("Gelöschte Elemente am Handy @phone", () => {
  test("in den Einstellungen wiederherstellen @phone", async ({ page }) => {
    await enterprise(page, { ownId: await personalAccountId("jonas") });
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Gelöschte Elemente" }).click();
    await restoreAndDelete(page);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
