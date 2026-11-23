import { expect, type Page, test } from "@playwright/test";
import { address, choose, jmapAs, login, mailboxAccountId, unique } from "./helpers";

/**
 * The CI's Stalwart is Community, so the Enterprise form is tried against Kontext's own answers
 * (/api/company/edition and /api/company/spam-ai routed in the page); what the server does with
 * them is tested in server/company/spam-ai.test.ts. The verdict in the mail is real: a mail with
 * Stalwart's X-Spam-AI header, put into the inbox with Email/import.
 */

const OFF = {
  known: true,
  enabled: false,
  provider: null,
  model: "",
  url: "",
  hasKey: false,
  mode: "automatic",
  external: false,
  assistantKey: true,
};

const asEnterprise = async (page: Page) => {
  const saved: unknown[] = [];
  await page.route("**/api/company/edition", (route) =>
    route.fulfill({ json: { edition: "enterprise" } }),
  );
  await page.route("**/api/company/spam-ai", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: OFF });
    saved.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        ...OFF,
        enabled: true,
        provider: "anthropic",
        model: "claude-haiku-5-5",
        hasKey: true,
        mode: "shadow",
      },
    });
  });
  return saved;
};

/** A mail from outside as Stalwart delivers it with the AI spam filter on (verdict.rs). */
const importJudged = async (subject: string, verdict: string) => {
  const client = jmapAs("jonas");
  const accountId = await mailboxAccountId("jonas", "jonas");
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  // Stalwart's block in its order (crates/smtp/src/inbound/data.rs), then a forged verdict the
  // sender sent along, which must not count.
  const raw = [
    "Received: from mail.bank-sicher.test (mail.bank-sicher.test [192.0.2.7])\r\n\tby mx.weber-haustechnik.test (Stalwart SMTP) with ESMTPS id 1; Mon, 16 Nov 2026 08:00:00 +0000",
    "Authentication-Results: mx.weber-haustechnik.test; spf=pass smtp.mailfrom=service@bank-sicher.test; dkim=none; dmarc=none",
    "X-Spam-Result: AI_TEST (0.00)",
    `X-Spam-AI: ${verdict}`,
    "X-Spam-Score: ham, score=1.20",
    "X-Spam-AI: legitimate; p=0.01; confidence=0.99; model=forged; tier=1",
    "From: Sparkasse <service@bank-sicher.test>",
    `To: <${address("jonas")}>`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${Date.now()}@bank-sicher.test>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Bitte bestätigen Sie Ihre Zugangsdaten über den Link.",
    "",
  ].join("\r\n");
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  const result = await client.call<{ created?: Record<string, { id: string }> }>("Email/import", {
    accountId,
    emails: { r: { blobId, mailboxIds: { [inbox]: true }, receivedAt: new Date().toISOString() } },
  });
  const id = result.created?.r?.id;
  if (!id) throw new Error(`Email/import: ${JSON.stringify(result)}`);
  return () => client.call("Email/set", { accountId, destroy: [id] });
};

const PHISHING =
  'phishing; p=0.93; confidence=0.88; model=claude-haiku-5-5; tier=1; reason="Gibt sich als Sparkasse aus, der Link führt woandershin"';

test.describe("KI-Spamfilter", () => {
  test("ohne Enterprise-Lizenz nur ein Hinweis", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-security");
    const card = page.getByRole("region", { name: "KI-Spamfilter" });
    await expect(card).toContainText("Braucht Stalwart Enterprise");
    await expect(card.getByRole("switch")).toHaveCount(0);
  });

  test("mit Enterprise richtet die Firmenverwaltung ihn mit dem Schlüssel des Assistenten ein", async ({
    page,
  }) => {
    const saved = await asEnterprise(page);
    await login(page);
    await page.goto("/settings?section=company-security");
    const card = page.getByRole("region", { name: "KI-Spamfilter" });
    await card.getByRole("switch", { name: "KI-Spamfilter einschalten" }).click();
    await expect(card.getByLabel("Modell")).toHaveValue("claude-haiku-5-5");
    await expect(card.getByRole("button", { name: "Speichern" })).toBeDisabled();
    await card.getByLabel("Schlüssel des Assistenten im Chat verwenden").check();
    await choose(card.getByLabel("Wirkung"), "Nur beobachten (Urteil steht nur in der Mail)");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Gespeichert");
    expect(saved).toEqual([
      {
        enabled: true,
        provider: "anthropic",
        model: "claude-haiku-5-5",
        url: "",
        mode: "shadow",
        useAssistantKey: true,
      },
    ]);
    await expect(card.getByLabel("API-Schlüssel")).toHaveAttribute(
      "placeholder",
      "Gespeichert – leer lassen, um ihn zu behalten",
    );
  });

  test("zeigt das Urteil beim Lesen und in den Details", async ({ page }) => {
    const subject = unique("Ihr Konto wird gesperrt");
    const remove = await importJudged(subject, PHISHING);
    try {
      await login(page);
      await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await expect(page.getByText("KI: Phishing")).toBeVisible();
      await page.getByRole("button", { name: "Details anzeigen" }).click();
      const details = page.getByRole("region", { name: "Details der Mail" });
      await expect(details).toContainText("KI-Spamfilter");
      await expect(details).toContainText("Phishing · 93 %");
      await expect(details).toContainText("Gibt sich als Sparkasse aus");
    } finally {
      await remove();
    }
  });
});

test.describe("KI-Spamfilter am Handy @phone", () => {
  test("zeigt „KI: unsicher“ beim Lesen @phone", async ({ page }) => {
    const subject = unique("Angebot nur heute");
    const remove = await importJudged(
      subject,
      "bulk_spam; p=0.55; confidence=0.20; model=claude-haiku-5-5; tier=1; uncertain",
    );
    try {
      await login(page);
      await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await expect(page.getByText("KI: unsicher")).toBeVisible();
    } finally {
      await remove();
    }
  });
});
