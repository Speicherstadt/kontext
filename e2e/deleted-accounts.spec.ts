/**
 * Deleting people and Gelöschte Konten. The CI's Stalwart has no license (Community): there
 * deleting is final and the list stays hidden. Enterprise is stood in for by routing Kontext's own
 * /api/company answers (server/company/deleted-accounts.ts has the Vitest tests against Stalwart).
 */
import { expect, type Page, test } from "@playwright/test";
import { newEmployee, stamp } from "./company-helpers";
import { address, login } from "./helpers";

const DAY = 86_400_000;

/** Stalwart Enterprise with a retention of 30 days and one deleted person. */
const asEnterprise = async (page: Page) => {
  const restored: string[] = [];
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route("**/api/company/deleted-accounts", (route) =>
    route.fulfill({
      json: {
        retentionDays: 30,
        accounts: restored.length
          ? []
          : [
              {
                id: "t1",
                accountId: "a1",
                kind: "employee",
                email: address("praktikant"),
                deletedAt: new Date(Date.now() - DAY).toISOString(),
                purgeAt: new Date(Date.now() + 29 * DAY).toISOString(),
              },
            ],
      },
    }),
  );
  await page.route("**/api/company/deleted-accounts/t1/restore", (route) => {
    restored.push("t1");
    return route.fulfill({ json: { password: "abcd-efgh-ijkm-npqr" } });
  });
  return restored;
};

test.describe("Konten löschen", () => {
  test("löscht in Community endgültig, ohne Liste gelöschter Konten", async ({ page }) => {
    const local = `weg-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Tom Weg");
    await expect(page.getByRole("region", { name: "Gelöschte Konten" })).toHaveCount(0);

    await page.getByRole("button", { name: new RegExp(address(local)) }).click();
    await page
      .getByRole("dialog", { name: "Mitarbeiter bearbeiten" })
      .getByRole("button", { name: "Konto löschen" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Tom Weg löschen" });
    await expect(dialog.getByTestId("delete-notice")).toContainText("endgültig gelöscht");
    await dialog.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tom Weg gelöscht" })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(address(local)) })).toHaveCount(0);
  });

  test("sagt mit Enterprise, wie lange ein Konto wiederherstellbar bleibt", async ({ page }) => {
    await asEnterprise(page);
    await login(page, "jonas");
    await page.goto("/settings?section=employees");
    await page.getByRole("button", { name: new RegExp(address("anna")) }).click();
    await page
      .getByRole("dialog", { name: "Mitarbeiter bearbeiten" })
      .getByRole("button", { name: "Konto löschen" })
      .click();
    const dialog = page.getByRole("dialog", { name: /löschen$/ });
    await expect(dialog.getByTestId("delete-notice")).toContainText("30 Tage");
    await expect(dialog.getByRole("button", { name: "Konto löschen" })).toBeVisible();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("stellt mit Enterprise ein gelöschtes Konto wieder her @phone", async ({ page }) => {
    const restored = await asEnterprise(page);
    await login(page, "jonas");
    await page.goto("/settings?section=employees");
    const section = page.getByRole("region", { name: "Gelöschte Konten" });
    await expect(section.getByLabel("Aufbewahren für (Tage)")).toHaveValue("30");
    await expect(section.getByText(address("praktikant"))).toBeVisible();
    await section.getByRole("button", { name: "Wiederherstellen" }).click();
    await section.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(section.getByTestId("new-password")).toHaveText("abcd-efgh-ijkm-npqr");
    expect(restored).toEqual(["t1"]);
    await expect(section.getByText("Keine gelöschten Konten")).toBeVisible();
  });
});
