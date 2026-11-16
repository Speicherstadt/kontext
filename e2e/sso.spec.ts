/**
 * Anmeldung über Firmenkonto (SSO) and SCIM. The CI's Stalwart has no license (Community), so the
 * section must stay hidden there; the Enterprise view is checked with Kontext's own answers
 * (/api/company/edition, /api/company/sso) given in the page.
 */
import { expect, type Page, test } from "@playwright/test";
import { DEV_DOMAIN } from "../dev/config";
import { login } from "./helpers";

const ENTRY = "Anmeldung über Firmenkonto (SSO)";

const view = {
  enterprise: true,
  known: true,
  directory: {
    issuerUrl: "https://login.microsoftonline.com/tenant-1/v2.0",
    claimUsername: "preferred_username",
    usernameDomain: "",
    claimName: "name",
    claimGroups: "",
    audience: "kontext-app",
    tokenCheck: "jwt",
  },
  client: { clientId: "kontext-app", scopes: "openid email offline_access", hasSecret: true },
  domains: [{ id: "d1", name: DEV_DOMAIN, sso: true, otherDirectory: false, scim: true }],
  redirectUri: "https://kontext.example/api/auth/sso/callback",
  scimUrl: "https://kontext.example/scim/v2",
  scimKey: null,
};

/** Kontext answers as if Stalwart had a license and the provider were set up. */
const asEnterprise = async (page: Page) => {
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route("**/api/company/sso", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: view }) : route.fallback(),
  );
  await page.route("**/api/company/sso/scim-token", (route) =>
    route.fulfill({ json: { secret: "API_scim_einmal", canDelete: false } }),
  );
};

test.describe("Anmeldung über Firmenkonto", () => {
  test("bleibt ohne Stalwart Enterprise verborgen", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Mitarbeiter" })).toBeVisible();
    await expect(page.getByRole("link", { name: ENTRY })).toHaveCount(0);
    await page.goto("/settings?section=company-sso");
    await expect(page.getByTestId("sso-enterprise-only")).toBeVisible();
    await page.goto("/settings?section=employees");
    await expect(page.getByText("SCIM", { exact: true })).toHaveCount(0);
  });

  test("mit Enterprise: Anbieter, Domains, SCIM-Token und markierte Mitarbeiter", async ({
    page,
  }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: ENTRY }).click();
    await expect(page.getByTestId("sso-redirect")).toHaveText(view.redirectUri);
    await expect(page.getByLabel("Aussteller-URL (Issuer)")).toHaveValue(view.directory.issuerUrl);
    await expect(page.getByLabel("Client-ID")).toHaveValue("kontext-app");
    await expect(page.getByLabel(`${DEV_DOMAIN}: Anmeldung über Firmenkonto`)).toBeChecked();
    await expect(page.getByLabel(`${DEV_DOMAIN}: Konten über SCIM`)).toBeChecked();
    await expect(page.getByTestId("scim-url")).toHaveText(view.scimUrl);
    await page.getByRole("button", { name: "Token erzeugen" }).click();
    await expect(page.getByTestId("scim-token")).toHaveText("API_scim_einmal");

    await page.goto("/settings?section=employees");
    const list = page.getByRole("list").filter({ hasText: `anna@${DEV_DOMAIN}` });
    await expect(list.getByText("SCIM", { exact: true }).first()).toBeVisible();
    await list.getByText(`anna@${DEV_DOMAIN}`).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("verwaltet dieses Konto über SCIM")).toBeVisible();
    await expect(dialog.getByLabel("Name", { exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Passwort zurücksetzen" })).toHaveCount(0);
  });

  test("die Anmeldeseite führt zum Firmenkonto statt nach dem Passwort zu fragen", async ({
    page,
  }) => {
    await page.route("**/api/auth/sign-in/sso/check", (route) =>
      route.fulfill({ json: { sso: true } }),
    );
    await page.goto("/login");
    await page.getByLabel("E-Mail-Adresse").fill(`anna@${DEV_DOMAIN}`);
    await page.getByLabel("E-Mail-Adresse").blur();
    await expect(page.getByTestId("login-sso")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Weiter mit Firmenkonto" })).toBeVisible();
  });

  test("sagt nach dem Rückweg, was nicht geklappt hat", async ({ page }) => {
    await page.goto("/login?sso=failed");
    await expect(page.getByRole("alert")).toContainText("Firmenkonto hat nicht geklappt");
  });
});

test.describe("Anmeldung über Firmenkonto am Handy @phone", () => {
  test("zeigt Anbieter und SCIM ohne seitliches Scrollen @phone", async ({ page }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings?section=company-sso");
    await expect(page.getByRole("region", { name: "Anbieter" })).toBeVisible();
    await expect(page.getByTestId("scim-url")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
