import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VacationTemplate } from "@/lib/vacation-template";
import { VacationForm } from "./vacation-form";

const templates: { current: VacationTemplate[] } = { current: [] };
vi.mock("@/features/company/vacation-templates", () => ({
  useVacationTemplates: () => templates.current,
}));

afterEach(cleanup);

// jsdom has neither; Radix Select calls them when the list opens.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => undefined;

const colleagues = [
  { id: "anna", name: "Anna Weber", email: "anna@weber-haustechnik.test" },
  { id: "max", name: "Max Brandt", email: "max@weber-haustechnik.test" },
];

const renderForm = () =>
  render(
    <VacationForm
      initial={{ isEnabled: true, from: "", to: "2030-12-18", subject: "", text: "" }}
      onSave={() => {}}
      saving={false}
      name="Jonas Weber"
      colleagues={colleagues}
    />,
  );

const message = () => screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
const choose = (field: string, option: string) => {
  fireEvent.keyDown(screen.getByRole("combobox", { name: field }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: option }));
};

describe("VacationForm", () => {
  it("names the deputy also with a Vorlage that has no {Vertretung}", () => {
    templates.current = [{ title: "Krank", text: "{Name} ist bis {Bis} krank." }];
    renderForm();
    choose("Vorlage", "Krank");
    choose("Vertretung", "Anna Weber");
    expect(message().value).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });

  it("keeps the deputy picked before a Vorlage without {Vertretung}", () => {
    templates.current = [{ title: "Krank", text: "{Name} ist bis {Bis} krank." }];
    renderForm();
    choose("Vertretung", "Anna Weber");
    choose("Vorlage", "Krank");
    expect(message().value).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });

  it("names only the new deputy after the filled Vorlage was edited", () => {
    templates.current = [{ title: "Urlaub", text: "{Name} ist weg. Vertretung: {Vertretung}." }];
    renderForm();
    choose("Vertretung", "Anna Weber");
    choose("Vorlage", "Urlaub");
    fireEvent.change(message(), { target: { value: `${message().value}\nDanke!` } });
    choose("Vertretung", "Max Brandt");
    expect(message().value).toContain("Max Brandt (max@weber-haustechnik.test)");
    expect(message().value).not.toContain("Anna Weber");
  });
});
