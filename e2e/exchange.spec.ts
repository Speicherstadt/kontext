import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

const SWITCH = "Exchange und ActiveSync freischalten (Beta)";

const switchOff = (page: Page) =>
  page.evaluate(async () => {
    await fetch("/api/company/exchange", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });

test.describe("Exchange und ActiveSync", () => {
  test("Schalter in der Firmenverwaltung blendet die Anleitung unter Synchronisieren ein und aus", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings?section=sync");
    await expect(page.getByText("Outlook und Handy-Apps (Exchange, Beta)")).toHaveCount(0);

    await page.goto("/settings?section=company-security");
    const toggle = page.getByRole("switch", { name: SWITCH });
    await expect(toggle).toBeVisible();
    try {
      await toggle.click();
      await expect(toggle).toBeChecked();

      await page.goto("/settings?section=sync");
      await expect(page.getByText("Outlook und Handy-Apps (Exchange, Beta)")).toBeVisible();
      await expect(page.getByText("Outlook (Windows und Mac)")).toBeVisible();
    } finally {
      await switchOff(page);
    }
  });
});

test.describe("Exchange und ActiveSync am Handy @phone", () => {
  test("zeigt den Schalter ohne seitliches Scrollen @phone", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-security");
    await expect(page.getByRole("switch", { name: SWITCH })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
