import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Exchange und ActiveSync", () => {
  test("Schalter in der Firmenverwaltung blendet die Anleitung unter Synchronisieren ein und aus", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings?section=sync");
    await expect(page.getByText("Outlook und Handy-Apps (Exchange, Beta)")).toHaveCount(0);

    await page.goto("/settings?section=company-security");
    const toggle = page.getByRole("switch", {
      name: "Exchange und ActiveSync freischalten (Beta)",
    });
    await expect(toggle).toBeVisible();
    try {
      await toggle.click();
      await expect(toggle).toBeChecked();

      await page.goto("/settings?section=sync");
      await expect(page.getByText("Outlook und Handy-Apps (Exchange, Beta)")).toBeVisible();
      await expect(page.getByText("Outlook (Windows und Mac)")).toBeVisible();
    } finally {
      await page.goto("/settings?section=company-security");
      if (await toggle.isChecked()) {
        await toggle.click();
        await expect(toggle).not.toBeChecked();
      }
    }
  });
});
