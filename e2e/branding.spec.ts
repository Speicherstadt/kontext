import { expect, type Page, test } from "@playwright/test";
import type { BrandingView } from "../server/company/branding";
import { login } from "./helpers";

const ENTRY = "Logo und Vorlagen";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * The CI's Stalwart has no license, so Enterprise is played here: the edition and the branding
 * routes are answered in the page, and what the app sends is kept.
 */
const asEnterprise = async (page: Page) => {
  const saved: { path: string; body: unknown }[] = [];
  let view: BrandingView = {
    known: true,
    logo: PNG,
    templates: { alarm: null, invitation: null },
  };
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route("**/api/company/branding**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      const path = new URL(request.url()).pathname;
      const body = request.postDataJSON() as { template?: string | null };
      saved.push({ path, body });
      if (path.endsWith("/templates/alarm"))
        view = { ...view, templates: { ...view.templates, alarm: body.template ?? null } };
    }
    await route.fulfill({ json: view });
  });
  return saved;
};

test.describe("Firmenverwaltung: Logo und Vorlagen", () => {
  test("bleibt in Stalwart Community verborgen", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=employees");
    await expect(page.getByTestId("stalwart-edition")).toHaveText("Community (kostenlos)");
    await expect(page.getByRole("link", { name: ENTRY })).toHaveCount(0);
    await page.goto("/settings?section=company-branding");
    await expect(page.getByText("nur mit einer Lizenz für Stalwart Enterprise")).toBeVisible();
  });

  test("zeigt mit Enterprise Logo, Vorlage und Vorschau und speichert die Vorlage", async ({
    page,
  }) => {
    const saved = await asEnterprise(page);
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: ENTRY }).click();

    const logo = page.getByRole("region", { name: "Firmenlogo" });
    await expect(logo.getByRole("img", { name: "Aktuelles Firmenlogo" })).toBeVisible();

    const templates = page.getByRole("region", { name: "Vorlagen für Kalender-Mails" });
    await expect(page.getByTestId("branding-template-state")).toContainText("eingebaute Vorlage");
    const preview = templates.frameLocator("iframe[title='Vorschau mit einem Beispieltermin']");
    await expect(preview.getByText("Sie haben einen bevorstehenden Termin")).toBeVisible();

    const editor = templates.getByLabel("Vorlage (HTML)");
    await editor.fill("<p>{{#if header}}{{header}}</p>");
    await expect(templates.getByRole("alert")).toContainText("Unmatched {: header");
    await expect(templates.getByRole("button", { name: "Speichern" })).toBeDisabled();

    await editor.fill("<p>{{header}} – Weber Haustechnik</p>");
    await expect(preview.getByText("Sie haben einen bevorstehenden Termin – Weber")).toBeVisible();
    await templates.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByTestId("branding-template-state")).toContainText("eigene Vorlage");
    expect(saved.at(-1)).toEqual({
      path: "/api/company/branding/templates/alarm",
      body: { template: "<p>{{header}} – Weber Haustechnik</p>" },
    });

    page.once("dialog", (dialog) => void dialog.accept());
    await templates.getByRole("button", { name: "Stalwarts Vorlage verwenden" }).click();
    await expect(page.getByTestId("branding-template-state")).toContainText("eingebaute Vorlage");
    expect(saved.at(-1)?.body).toEqual({ template: null });
  });
});

test.describe("Logo und Vorlagen am Handy @phone", () => {
  test("verborgen in Community, mit Enterprise ohne seitliches Scrollen @phone", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Mitarbeiter" })).toBeVisible();
    await expect(page.getByRole("link", { name: ENTRY })).toHaveCount(0);

    await asEnterprise(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: ENTRY }).click();
    await expect(page.getByRole("region", { name: "Vorlagen für Kalender-Mails" })).toBeVisible();
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(scrolls).toBe(false);
  });
});
