import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

/** Ein Donnerstag in der nächsten Woche, fernab der Testdaten. */
const thursday = () => {
  const date = new Date(Date.now() + 8 * 86_400_000);
  while (date.getUTCDay() !== 4) date.setUTCDate(date.getUTCDate() + 1);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);
};

test.describe("Räume und Geräte", () => {
  test("legt einen Raum an und lehnt eine Doppelbuchung automatisch ab", async ({ page }) => {
    const local = `raum-${Date.now().toString(36)}`;
    const roomEmail = `${local}@weber-haustechnik.test`;
    const roomName = unique("Besprechungsraum");
    const day = thursday();

    await login(page);
    await page.goto("/settings?section=resources");
    await page.getByRole("button", { name: "Raum oder Gerät anlegen" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("Name", { exact: true }).fill(roomName);
    await createDialog.getByLabel("Name vor dem @").fill(local);
    await createDialog.getByLabel("Ort").fill("1. OG");
    await createDialog.getByLabel("Plätze").fill("6");
    await createDialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(page.getByText(roomName)).toBeVisible();

    try {
      // Erster Termin bucht den Raum.
      const firstTitle = unique("Erste Buchung");
      await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
      const firstDialog = page.getByRole("dialog");
      await firstDialog.getByLabel("Titel").fill(firstTitle);
      const resourceInput = firstDialog.getByLabel("Raum oder Gerät");
      await resourceInput.fill(roomEmail);
      await resourceInput.press("Enter");
      await firstDialog.getByRole("button", { name: "Speichern" }).click();
      await expect(firstDialog).toBeHidden();

      // Zweiter Termin zur selben Zeit: Doppelbuchung wird von Stalwart abgelehnt.
      const secondTitle = unique("Doppelbuchung");
      await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
      const secondDialog = page.getByRole("dialog");
      await secondDialog.getByLabel("Titel").fill(secondTitle);
      const secondResource = secondDialog.getByLabel("Raum oder Gerät");
      await secondResource.fill(roomEmail);
      await secondResource.press("Enter");
      await secondDialog.getByRole("button", { name: "Speichern" }).click();
      await expect(secondDialog).toBeHidden();

      await page.goto(`/calendar?view=agenda&date=${day}`);
      await page.getByRole("link", { name: new RegExp(secondTitle) }).click();
      await expect(page.getByRole("dialog").getByText(/abgesagt/i)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      if (!page.isClosed()) {
        await page.goto("/settings?section=resources");
        const entry = page.getByRole("button", { name: new RegExp(roomName) });
        if (await entry.isVisible()) {
          await entry.click();
          const editDialog = page.getByRole("dialog");
          await editDialog.getByRole("button", { name: "Löschen" }).click();
          await editDialog
            .getByRole("button", { name: /Ja|Löschen/i })
            .last()
            .click();
          await expect(entry).toHaveCount(0);
        }
      }
    }
  });
});
