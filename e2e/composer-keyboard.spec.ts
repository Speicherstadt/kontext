import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// With the keyboard open Android makes the page shorter (interactive-widget=resizes-content);
// the editor has to shrink with it instead of running over the send button.
test.describe("Neue Mail mit Tastatur am Handy @phone", () => {
  test("der Text bleibt über der Leiste mit Senden @phone", async ({ page }) => {
    await login(page);
    await page.goto("/compose");
    const form = page.getByRole("form", { name: "Neue Mail" });
    const text = form.getByRole("textbox", { name: "Ihre Nachricht …" });
    await text.click();
    await page.keyboard.type("Zeile\n".repeat(30));
    const size = page.viewportSize();
    if (size) await page.setViewportSize({ width: size.width, height: 420 });
    const send = form.getByRole("button", { name: "Senden", exact: true });
    await expect(send).toBeVisible();
    const editorBox = await form.locator(".editor-content").boundingBox();
    const sendBox = await send.boundingBox();
    expect(editorBox && sendBox && editorBox.y + editorBox.height <= sendBox.y).toBe(true);
  });
});
