import { describe, expect, it } from "vitest";
import { CALENDAR_TEMPLATE_KINDS, templateProblem } from "./calendar-template";
import { defaultTemplate } from "./calendar-template-defaults";
import { previewTemplate, previewValues } from "./calendar-template-preview";

const LOGO = "data:image/png;base64,iVBORw0KGgo=";

describe("Kontext's default templates", () => {
  it.each(
    CALENDAR_TEMPLATE_KINDS.flatMap((kind) => [
      [kind, "de"],
      [kind, "en"],
    ]) as [(typeof CALENDAR_TEMPLATE_KINDS)[number], "de" | "en"][],
  )("%s (%s) is a template Stalwart reads", (kind, language) => {
    expect(templateProblem(defaultTemplate(kind, language))).toBeNull();
  });

  it("puts the alarm footer in the chosen language instead of Stalwart's portal text", () => {
    const de = previewTemplate(defaultTemplate("alarm", "de"), "alarm", "de", LOGO);
    const en = previewTemplate(defaultTemplate("alarm", "en"), "alarm", "en", LOGO);
    expect(de.ok && de.html).toContain("Erinnerung per E-Mail eingestellt");
    expect(en.ok && en.html).toContain("this event has a reminder by email");
    expect(de.ok && de.html).not.toContain("Self-Service-Portal");
  });
});

describe("previewTemplate", () => {
  it("fills the alarm mail with the logo, the details and the button", () => {
    const preview = previewTemplate(defaultTemplate("alarm", "de"), "alarm", "de", LOGO);
    expect(preview.ok).toBe(true);
    const html = preview.ok ? preview.html : "";
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toContain('lang="de-DE"');
    expect(html).toContain("Sie haben einen bevorstehenden Termin");
    expect(html).toContain("Baubesprechung Neubau Kirchstraße");
    expect(html).toContain('href="https://meet.weber-haustechnik.test/baubesprechung"');
    expect(html).toContain("Termin anzeigen");
    expect(html).not.toContain("{{");
  });

  it("shows the invitation as a change, with Stalwart's footer lines", () => {
    const preview = previewTemplate(defaultTemplate("invitation", "en"), "invitation", "en", LOGO);
    const html = preview.ok ? preview.html : "";
    expect(html).toContain("tone-info");
    expect(html).toContain("This event has been updated");
    expect(html).toContain("Changed");
    expect(html).toContain("11/17/26, 2:00 PM – 3:00 PM");
    expect(html).toContain("Jonas Weber - Organizer");
    expect(html).toContain("listed as a participant");
    // No answer buttons: Kontext keeps Stalwart's answer page off.
    expect(html).not.toContain("action_url");
  });

  it("gives Stalwart's reason for a broken template", () => {
    expect(previewTemplate("{{#if header}}", "alarm", "de", LOGO)).toEqual({
      ok: false,
      error: "Unmatched {: header",
    });
  });

  it("uses the logo given for logo_cid", () => {
    expect(previewValues("invitation", "de", LOGO).logo_cid).toBe(LOGO);
  });
});
