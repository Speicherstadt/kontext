/**
 * Writing as info@ from the own mailbox goes through info@'s account (src/lib/send-route.ts):
 * the draft moves into info@'s Drafts, the mail lands in info@'s Sent, signed with the person
 * and the mailbox – as if written in the shared mailbox.
 */
import { expect, test } from "@playwright/test";
import { address, findMail, inboxMails, login, removeMails, unique } from "./helpers";

test("sendet aus dem eigenen Postfach als info@ über das gemeinsame Postfach", async ({ page }) => {
  const subject = unique("Rückfrage Wartung");
  await login(page);
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  const form = page.getByRole("form", { name: "Neue Mail" });
  await expect(form.getByLabel("Von")).toContainText(/jonas@/);
  await form.getByRole("combobox", { name: "An" }).fill("anna@weber-haustechnik.test");
  await page.keyboard.press("Enter");
  await form.getByLabel("Betreff").fill(subject);
  await form.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
  await page.keyboard.type("Wann passt Ihnen der Termin?");
  try {
    // Saved as jonas@ first: the draft is in the own Drafts.
    await expect
      .poll(async () => (await findMail("jonas", subject))?.folder, { timeout: 15_000 })
      .toBe("drafts");

    // As info@, it shows the name the customer will see, and the draft moves to info@.
    await form.getByLabel("Von").click();
    const info = page.getByRole("option").filter({ hasText: "info@" }).first();
    // The person and the mailbox's name, as Stalwart names info@ (its group's description).
    await expect(info).toContainText(/Jonas Weber \(.+\)/);
    await info.click();
    await expect(form.getByLabel("Von")).toContainText(/info@/);
    await expect
      .poll(async () => (await findMail("jonas", subject, "info"))?.folder, { timeout: 15_000 })
      .toBe("drafts");
    await expect.poll(() => findMail("jonas", subject)).toBeNull();

    await form.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Mail gesendet" }).or(page.getByRole("alert")),
    ).toBeVisible({ timeout: 15_000 });
    expect(await page.getByRole("alert").allTextContents()).toEqual([]);

    // In info@'s Sent, for the colleagues; nothing left in the own mailbox.
    await expect
      .poll(async () => (await findMail("jonas", subject, "info"))?.folder, { timeout: 15_000 })
      .toBe("sent");
    expect(await findMail("jonas", subject)).toBeNull();
    await expect
      .poll(async () => (await inboxMails("anna")).find((mail) => mail.subject === subject))
      .toMatchObject({
        from: address("info"),
        fromName: expect.stringMatching(/^Jonas Weber \(.+\)$/),
      });
  } finally {
    await removeMails("jonas", "info", [subject]);
    await removeMails("jonas", "jonas", [subject]);
    await removeMails("anna", "anna", [subject]);
  }
});
