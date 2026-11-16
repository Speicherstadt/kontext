import { expect, type Page, test } from "@playwright/test";
import type { ServerHealthView } from "../server/company/server-health-routes";
import { login } from "./helpers";

/**
 * The CI Stalwart is Community: the Serverzustand stays hidden there. Its Enterprise view is checked
 * with the server's answers given here – Stalwart says Enterprise, and its metrics and traces are
 * the ones below.
 */
const bucket = (hour: number, received: number, sent: number) => ({
  start: `2026-11-16T${String(hour).padStart(2, "0")}:00:00.000Z`,
  end: `2026-11-16T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
  received,
  spam: 1,
  sent,
  bounced: 0,
});

const health = (period: "day" | "week"): ServerHealthView => ({
  period,
  recording: { metrics: true, traces: true },
  metrics: {
    buckets: Array.from({ length: 24 }, (_, hour) => bucket(hour, hour % 5, hour % 3)),
    totals: {
      received: period === "day" ? 1234 : 8000,
      spam: 17,
      sent: 456,
      bounced: 2,
      signInFailed: 9,
      blocked: 1,
    },
    queue: 3,
    samples: 120,
  },
  problems: [
    {
      id: "t1/max@kunde.test",
      at: new Date().toISOString(),
      to: "max@kunde.test",
      reason: "550 5.1.1 User unknown",
      host: "mx.kunde.test",
      permanent: true,
    },
  ],
  storageBytes: 5 * 1024 ** 3,
});

/** Stalwart with a license, and the server's Serverzustand; the periods asked for are kept. */
const asEnterprise = async (page: Page) => {
  const periods: string[] = [];
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route(/\/api\/company\/server-health\?/, (route) => {
    const week = new URL(route.request().url()).searchParams.get("period") === "week";
    periods.push(week ? "week" : "day");
    return route.fulfill({ json: health(week ? "week" : "day") });
  });
  return periods;
};

test.describe("Serverzustand", () => {
  test("fehlt mit Stalwart Community", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=employees");
    await expect(page.getByTestId("stalwart-edition")).toHaveText("Community (kostenlos)");
    await expect(page.getByRole("link", { name: "Serverzustand" })).toHaveCount(0);
    await page.goto("/settings?section=company-health");
    await expect(page.getByText("braucht Stalwart Enterprise")).toBeVisible();
  });

  test("zeigt Mailverkehr und Zustellprobleme mit Stalwart Enterprise", async ({ page }) => {
    const periods = await asEnterprise(page);
    await login(page);
    await page.goto("/settings?section=employees");
    await page.getByRole("link", { name: "Serverzustand" }).click();
    const main = page.getByRole("main");
    await expect(main.getByText("1.234")).toBeVisible();
    await expect(main.getByText("Gesperrte Adressen: 1")).toBeVisible();
    await expect(main.getByText("5 GB")).toBeVisible();
    await expect(
      main.getByRole("list", { name: "Mails im Zeitraum" }).getByRole("listitem"),
    ).toHaveCount(24);
    const problems = main.getByRole("region", { name: "Zustellprobleme" });
    await expect(problems.getByText("max@kunde.test")).toBeVisible();
    await expect(problems.getByText("550 5.1.1 User unknown")).toBeVisible();
    await main.getByRole("button", { name: "7 Tage" }).click();
    await expect(main.getByText("8.000")).toBeVisible();
    expect(periods[0]).toBe("day");
    expect(periods).toContain("week");
  });
});

test.describe("Serverzustand am Handy @phone", () => {
  test("passt ohne seitliches Scrollen @phone", async ({ page }) => {
    await asEnterprise(page);
    await login(page);
    await page.goto("/settings?section=company-health");
    await expect(page.getByText("max@kunde.test")).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
});
