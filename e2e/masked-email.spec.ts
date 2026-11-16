import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Masked addresses need Stalwart Enterprise (x:MaskedEmail, src/jmap/masked-email.ts); the e2e
 * Stalwart runs without a license. So the Community case is the real one, and for Enterprise this
 * page answers Kontext's edition and Stalwart's x:MaskedEmail calls itself, keeping the addresses
 * in memory the way Stalwart would (crates/jmap/src/registry/mapping/masked_email.rs makes the
 * address from the prefix, an id and the account's domain).
 */
type Entry = {
  id: string;
  email: string;
  enable: boolean;
  description?: string;
  forDomain?: string;
  createdAt: string;
  expiresAt?: string;
};

const asEnterprise = async (page: Page) => {
  const entries: Entry[] = [];
  let next = 1;
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route(/\/jmap/, async (route) => {
    const body = route.request().postData() ?? "";
    if (!body.includes('"x:MaskedEmail/')) return route.fallback();
    const [[name, args]] = JSON.parse(body).methodCalls as [[string, Record<string, unknown>]];
    const answer = (result: unknown) =>
      route.fulfill({ json: { methodResponses: [[name, result, "0"]], sessionState: "s" } });
    if (name === "x:MaskedEmail/get") return answer({ list: entries });
    const { create, update, destroy } = args as {
      create?: Record<string, Entry & { emailPrefix?: string }>;
      update?: Record<string, Partial<Entry>>;
      destroy?: string[];
    };
    const created: Record<string, { id: string; email: string }> = {};
    for (const [key, { emailPrefix, ...value }] of Object.entries(create ?? {})) {
      const id = `m${next++}`;
      const email = `${emailPrefix ?? "x7k2q"}.1bz9${id}@weber-haustechnik.test`;
      entries.push({ ...value, id, email, createdAt: new Date().toISOString() });
      created[key] = { id, email };
    }
    for (const [id, patch] of Object.entries(update ?? {})) {
      Object.assign(entries.find((entry) => entry.id === id)!, patch);
    }
    for (const id of destroy ?? [])
      entries.splice(
        entries.findIndex((e) => e.id === id),
        1,
      );
    return answer({ created, updated: update ?? null, destroyed: destroy ?? [] });
  });
};

const list = (page: Page) => page.getByRole("list", { name: "Maskierte Adressen" });

const createAddress = async (page: Page, description: string, prefix = "") => {
  await page.getByLabel("Wofür").fill(description);
  await page.getByLabel("Website (optional)").fill("https://www.baumarkt.de/konto");
  if (prefix) await page.getByLabel("Anfang der Adresse (optional)").fill(prefix);
  await page.getByLabel("Gültig").selectOption({ label: "1 Woche" });
  await page.getByRole("button", { name: "Adresse anlegen" }).click();
};

test.describe("Maskierte Adressen", () => {
  test("gibt es ohne Stalwart Enterprise nicht", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Darstellung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Maskierte Adressen" })).toHaveCount(0);
    await page.goto("/settings?section=masked-email");
    await expect(page.getByText("nur mit Stalwart Enterprise")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adresse anlegen" })).toHaveCount(0);
  });

  test("legt mit Enterprise eine an, schaltet sie ab und löscht sie", async ({ page }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Maskierte Adressen" }).click();
    await expect(page.getByText("Noch keine maskierten Adressen.")).toBeVisible();

    await createAddress(page, "Baumarkt-Kundenkonto", "baumarkt");
    await expect(page.getByText(/Adresse angelegt: baumarkt\./)).toBeVisible();
    const row = list(page).getByRole("listitem");
    await expect(row).toContainText("baumarkt.1bz9m1@weber-haustechnik.test");
    await expect(row).toContainText("Baumarkt-Kundenkonto · baumarkt.de");
    await expect(row).toContainText("läuft ab");

    const toggle = row.getByRole("switch", { name: /Mails an baumarkt\./ });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(row).toContainText("abgeschaltet");

    await row.getByRole("button", { name: "Löschen" }).click();
    await row.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByText("Noch keine maskierten Adressen.")).toBeVisible();
  });

  test("nimmt einen Anfang mit Punkt nicht an", async ({ page }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings?section=masked-email");
    await page.getByLabel("Anfang der Adresse (optional)").fill("shop.de");
    await expect(page.getByText("Nur Buchstaben, Ziffern und _")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adresse anlegen" })).toBeDisabled();
  });
});

test.describe("Maskierte Adressen am Handy @phone", () => {
  test("legt eine an, ohne seitliches Scrollen @phone", async ({ page }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Maskierte Adressen" }).click();
    await createAddress(page, "Newsletter");
    await expect(list(page).getByRole("listitem")).toContainText("@weber-haustechnik.test");
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
});
