/**
 * Writing as info@ from the own mailbox goes through info@'s account (src/lib/send-route.ts):
 * the draft moves into info@'s Drafts, the mail lands in info@'s Sent, signed with the person
 * and the mailbox – as if written in the shared mailbox. With „Gesendete Mails ablegen“ set to
 * both places (src/lib/sent-copy.ts), a copy lands in the own Sent too.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  address,
  choose,
  findMail,
  inboxMails,
  login,
  mailboxAccountId,
  removeMails,
  unique,
} from "./helpers";

/** A new mail from the own mailbox to Anna, with the subject and a line of text. */
const newMail = async (page: Page, subject: string) => {
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  const form = page.getByRole("form", { name: "Neue Mail" });
  await expect(form.getByLabel("Von")).toContainText(/jonas@/);
  await form.getByRole("combobox", { name: "An" }).fill("anna@weber-haustechnik.test");
  await page.keyboard.press("Enter");
  await form.getByLabel("Betreff").fill(subject);
  await form.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
  await page.keyboard.type("Wann passt Ihnen der Termin?");
  return form;
};

/** Picks info@ as the sender; the option says the name the customer will see. */
const fromInfo = async (page: Page) => {
  const form = page.getByRole("form", { name: "Neue Mail" });
  await form.getByLabel("Von").click();
  const info = page.getByRole("option").filter({ hasText: "info@" }).first();
  // The person and the mailbox's name, as Stalwart names info@ (its group's description).
  await expect(info).toContainText(/Jonas Weber \(.+\)/);
  await info.click();
  await expect(form.getByLabel("Von")).toContainText(/info@/);
};

const send = async (page: Page) => {
  const form = page.getByRole("form", { name: "Neue Mail" });
  await form.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Mail gesendet" }).or(page.getByRole("alert")),
  ).toBeVisible({ timeout: 15_000 });
  expect(await page.getByRole("alert").allTextContents()).toEqual([]);
};

const folderOf = (subject: string, mailbox = "jonas") =>
  expect.poll(async () => (await findMail("jonas", subject, mailbox))?.folder, {
    timeout: 15_000,
  });

const cleanUp = async (subject: string) => {
  await removeMails("jonas", "info", [subject]);
  await removeMails("jonas", "jonas", [subject]);
  await removeMails("anna", "anna", [subject]);
};

test("sendet aus dem eigenen Postfach als info@ über das gemeinsame Postfach", async ({ page }) => {
  const subject = unique("Rückfrage Wartung");
  await login(page);
  await newMail(page, subject);
  try {
    // Saved as jonas@ first: the draft is in the own Drafts.
    await folderOf(subject).toBe("drafts");
    // As info@, the draft moves to info@.
    await fromInfo(page);
    await folderOf(subject, "info").toBe("drafts");
    await expect.poll(() => findMail("jonas", subject)).toBeNull();

    await send(page);
    // In info@'s Sent, for the colleagues; nothing left in the own mailbox.
    await folderOf(subject, "info").toBe("sent");
    expect(await findMail("jonas", subject)).toBeNull();
    await expect
      .poll(async () => (await inboxMails("anna")).find((mail) => mail.subject === subject))
      .toMatchObject({
        from: address("info"),
        fromName: expect.stringMatching(/^Jonas Weber \(.+\)$/),
      });
  } finally {
    await cleanUp(subject);
  }
});

test("legt Gesendetes als info@ auch im eigenen Postfach ab, wenn die Firma das will", async ({
  page,
}) => {
  const subject = unique("Rückfrage Kopie");
  const info = await mailboxAccountId("jonas", "info");
  await login(page);
  try {
    // Jonas is in the Firmenverwaltung: info@ keeps its sent mails in both places.
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: /^info@/ }).click();
    const dialog = page.getByRole("dialog", { name: "Postfach bearbeiten" });
    await choose(dialog.getByLabel("Gesendete Mails ablegen"), /Im gemeinsamen Postfach und/);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto("/mail");
    await newMail(page, subject);
    await fromInfo(page);
    await folderOf(subject, "info").toBe("drafts");
    await send(page);
    // In info@'s Sent, and a copy (read) in Jonas' own Sent.
    await folderOf(subject, "info").toBe("sent");
    await folderOf(subject).toBe("sent");
    expect((await findMail("jonas", subject))?.keywords).toContain("$seen");
  } finally {
    await page.request.patch(`/api/company/mailboxes/${info}`, { data: { sentCopy: "group" } });
    await cleanUp(subject);
  }
});
