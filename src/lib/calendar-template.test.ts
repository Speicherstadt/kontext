import { describe, expect, it } from "vitest";
import {
  parseTemplate,
  renderTemplate,
  TEMPLATE_MAX,
  type TemplateValues,
  templateProblem,
} from "./calendar-template";

const render = (template: string, values: TemplateValues) => {
  const parsed = parseTemplate(template);
  if (!parsed.ok) throw new Error(parsed.error);
  return renderTemplate(parsed.value, values);
};

describe("parseTemplate, as Template::parse in crates/utils/src/template.rs", () => {
  it.each([
    ["{{event_title", "Unmatched {{"],
    ["{{nonsense}}", "Invalid variable: nonsense"],
    ["{{!nonsense}}", "Invalid variable: nonsense"],
    ["{{#while header}}{{/while header}}", "Invalid block start: while header"],
    ["{{#if nonsense}}{{/if nonsense}}", "Invalid variable: nonsense"],
    ["{{#if header}}", "Unmatched {: header"],
    ["{{#if header}}{{/if footer}}", "Block end does not match start: expected header, got footer"],
    ["{{#if header}}{{/each header}}", "Block end does not match start type for header"],
    ["{{#if header}}{{/unless header}}", "Invalid block end: unless header"],
  ])("refuses %s with Stalwart's words", (template, error) => {
    expect(parseTemplate(template)).toEqual({ ok: false, error });
  });

  it("ignores an end with no open block, as Stalwart does", () => {
    expect(parseTemplate("a{{/if header}}b").ok).toBe(true);
  });

  it("allows blanks inside the braces", () => {
    expect(render("{{ event_title }}{{# if header }}!{{/ if header }}", { event_title: "A" })).toBe(
      "A",
    );
  });
});

describe("renderTemplate, as Template::eval", () => {
  it("escapes {{name}} and leaves {{!name}} as it is", () => {
    const values = { event_title: `<b>"Tom" & 'Jerry'</b>` };
    expect(render("{{event_title}}", values)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
    expect(render("{{!event_title}}", values)).toBe(values.event_title);
  });

  it("writes nothing for a missing value and skips an if without one", () => {
    expect(render("[{{header}}]{{#if header}}H{{/if header}}.", {})).toBe("[].");
    expect(render("{{#if header}}H{{header}}{{/if header}}.", { header: "x" })).toBe("Hx.");
  });

  it("repeats each with the entry's own values and its ifs", () => {
    const template =
      "{{#each event_details}}<{{key}}{{#if link}}@{{link}}{{/if link}}={{value}}|{{header}}>{{/each event_details}}!";
    expect(
      render(template, {
        header: "global, not in the entry",
        event_details: [
          { key: "Ort", value: "Freiburg" },
          { key: "Link", value: "Meet", link: "https://m" },
        ],
      }),
    ).toBe("<Ort=Freiburg|><Link@https://m=Meet|>!");
  });

  it("writes nothing for a list used as a text, or a text used as a list", () => {
    expect(render("{{footer}}", { footer: [{ key: "a" }] })).toBe("");
    expect(render("{{#each footer}}{{key}}{{/each footer}}.", { footer: "a" })).toBe(".");
  });
});

describe("templateProblem", () => {
  it("names what Stalwart would refuse, or nothing", () => {
    expect(templateProblem("   ")).toBe("empty");
    expect(templateProblem("x".repeat(TEMPLATE_MAX + 1))).toBe("too long");
    expect(templateProblem("{{oops}}")).toBe("Invalid variable: oops");
    expect(templateProblem("<p>{{event_title}}</p>")).toBeNull();
  });
});
