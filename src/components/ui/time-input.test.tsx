import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Label } from "./input";
import { TimeInput } from "./time-input";

afterEach(cleanup);

const Field = ({ initial, onChange }: { initial: string; onChange?: (value: string) => void }) => {
  const [value, setValue] = useState(initial);
  return (
    <Label>
      Uhrzeit
      <TimeInput
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </Label>
  );
};

const field = () => screen.getByRole("combobox", { name: "Uhrzeit" }) as HTMLInputElement;
const active = () => document.getElementById(field().getAttribute("aria-activedescendant") ?? "");

describe("TimeInput", () => {
  it("is named by the label around it and shows the time", () => {
    render(<Field initial="09:05" />);
    expect(field().value).toBe("09:05");
  });

  it("takes any typed time once its minutes are there, short forms on leaving", () => {
    const onChange = vi.fn();
    render(<Field initial="" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "14:3" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "14:37" } });
    expect(onChange).toHaveBeenLastCalledWith("14:37");
    fireEvent.change(field(), { target: { value: "930" } });
    fireEvent.blur(field());
    expect(onChange).toHaveBeenLastCalledWith("09:30");
    expect(field().value).toBe("09:30");
  });

  it("lists the quarter hours from the field's time; ↓ and Enter take the next", () => {
    const onChange = vi.fn();
    render(<Field initial="14:30" onChange={onChange} />);
    field().focus();
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "Uhrzeiten" });
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(96);
    expect(field().getAttribute("aria-expanded")).toBe("true");
    expect(active()?.textContent).toBe("14:30");
    expect(active()?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "PageDown" });
    expect(active()?.textContent).toBe("15:45");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("15:45");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("opens on a click and takes a clicked time", () => {
    const onChange = vi.fn();
    render(<Field initial="" onChange={onChange} />);
    fireEvent.click(field());
    fireEvent.click(screen.getByRole("option", { name: "08:15" }));
    expect(onChange).toHaveBeenLastCalledWith("08:15");
    expect(field().value).toBe("08:15");
  });

  it("closes the list with Escape", () => {
    render(<Field initial="" />);
    field().focus();
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().getAttribute("aria-expanded")).toBe("false");
  });
});
