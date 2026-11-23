import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Label } from "./input";
import { optionsOf, Select, type SelectEntry } from "./select";

afterEach(cleanup);

// jsdom has neither; Radix Select calls them when the list opens.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => undefined;

const entries: SelectEntry[] = [
  { value: "", label: "Keine" },
  {
    label: "Mein Postfach",
    options: [
      { value: "a", label: "Jonas Weber", hint: "jonas@weber.test" },
      { value: "b", label: "Buchhaltung", hint: "buchhaltung@weber.test", badge: "Alias" },
    ],
  },
];

const Field = ({ initial, onChange }: { initial: string; onChange?: (v: string) => void }) => {
  const [value, setValue] = useState(initial);
  return (
    <Label>
      Absender
      <Select
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        options={entries}
        showHint
      />
    </Label>
  );
};

const open = () =>
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Absender" }), { key: "Enter" });

describe("Select", () => {
  it("is named by the label around it and shows the chosen option with its hint", () => {
    render(<Field initial="b" />);
    const field = screen.getByRole("combobox", { name: "Absender" });
    expect(field.textContent).toContain("Buchhaltung");
    expect(field.textContent).toContain("buchhaltung@weber.test");
    expect(field.textContent).toContain("Alias");
  });

  it("shows the empty value as its option, not as nothing chosen", () => {
    render(<Field initial="" />);
    expect(screen.getByRole("combobox", { name: "Absender" }).textContent).toContain("Keine");
  });

  it("passes the empty value back when it is picked", () => {
    const onChange = vi.fn();
    render(<Field initial="a" onChange={onChange} />);
    open();
    fireEvent.click(screen.getByRole("option", { name: "Keine" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("names an option by its label only, not by its hint or badge", () => {
    render(<Field initial="a" />);
    open();
    expect(screen.getByRole("option", { name: "Buchhaltung" })).toBeTruthy();
  });
});

describe("optionsOf", () => {
  it("flattens the groups", () => {
    expect(optionsOf(entries).map((option) => option.value)).toEqual(["", "a", "b"]);
  });
});
