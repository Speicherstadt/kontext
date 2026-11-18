import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Masked addresses against the e2e Stalwart, a Community edition without a license: since
 * Stalwart 1.1.1 every edition has x:MaskedEmail (src/jmap/masked-email.ts). Stalwart makes the
 * address from the prefix, a dot, an id and the account's domain
 * (crates/jmap/src/registry/mapping/masked_email.rs). The tests share the server, so each one
 * looks only at the address it made itself.
 */
const list = (page: Page) => page.getByRole("list", { name: "Maskierte Adressen" });

/** A prefix of its own per test and run, so that parallel or repeated runs do not meet. */
const prefixFor = (name: string) => `${name}${Date.now().toString(36)}`;

const createAddress = async (page: Page, description: string, prefix: string) => {
  await page.getByLabel("Wofür").fill(description);
  await page.getByLabel("Website (optional)").fill("https://www.baumarkt.de/konto");
  await page.getByLabel("Anfang der Adresse (optional)").fill(prefix);
  await page.getByLabel("Gültig").selectOption({ label: "1 Woche" });
  await page.getByRole("button", { name: "Adresse anlegen" }).click();
};

test.describe("Maskierte Adressen", () => {
  test("legt ohne Enterprise eine an, schaltet sie ab und löscht sie", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Maskierte Adressen" }).click();

    const prefix = prefixFor("baumarkt");
    await createAddress(page, "Baumarkt-Kundenkonto", prefix);
    await expect(page.getByText(`Adresse angelegt: ${prefix}.`)).toBeVisible();
    const row = list(page)
      .getByRole("listitem")
      .filter({ hasText: `${prefix}.` });
    await expect(row).toContainText(new RegExp(`${prefix}\\.[a-z0-9]+@weber-haustechnik\\.test`));
    await expect(row).toContainText("Baumarkt-Kundenkonto · baumarkt.de");
    await expect(row).toContainText("läuft ab");

    const toggle = row.getByRole("switch", { name: new RegExp(`Mails an ${prefix}\\.`) });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(row).toContainText("abgeschaltet");
    // Kept by Stalwart, not only on the page
    await page.reload();
    await expect(row).toContainText("abgeschaltet");

    await row.getByRole("button", { name: "Löschen" }).click();
    await row.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(row).toHaveCount(0);
  });

  test("nimmt einen Anfang mit Punkt nicht an", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=masked-email");
    await page.getByLabel("Anfang der Adresse (optional)").fill("shop.de");
    await expect(page.getByText("Nur Buchstaben, Ziffern und _")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adresse anlegen" })).toBeDisabled();
  });

  test("sagt bei einem älteren Stalwart ohne Lizenz, was fehlt", async ({ page }) => {
    // Stalwart before 1.1.1: x:MaskedEmail is an Enterprise object and refused with "forbidden"
    await page.route(/\/jmap/, async (route) => {
      const body = route.request().postData() ?? "";
      if (!body.includes('"x:MaskedEmail/')) return route.fallback();
      const forbidden = {
        type: "forbidden",
        description: "This feature is only available in the Enterprise edition.",
      };
      return route.fulfill({
        json: { methodResponses: [["error", forbidden, "0"]], sessionState: "s" },
      });
    });
    await login(page);
    await page.goto("/settings?section=masked-email");
    await expect(page.getByText("brauchen Stalwart 1.1.1 oder neuer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adresse anlegen" })).toHaveCount(0);
  });
});

test.describe("Maskierte Adressen am Handy @phone", () => {
  test("legt eine an, ohne seitliches Scrollen @phone", async ({ page }) => {
    await login(page, "anna");
    await page.goto("/settings");
    await page.getByRole("link", { name: "Maskierte Adressen" }).click();
    const prefix = prefixFor("newsletter");
    await createAddress(page, "Newsletter", prefix);
    const row = list(page)
      .getByRole("listitem")
      .filter({ hasText: `${prefix}.` });
    await expect(row).toContainText("@weber-haustechnik.test");
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await row.getByRole("button", { name: "Löschen" }).click();
    await row.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(row).toHaveCount(0);
  });
});
