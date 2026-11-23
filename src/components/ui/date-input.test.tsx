import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "./date-input";
import { DateTimeInput } from "./date-time-input";
import { Label } from "./input";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  // Today is fixed, so the month that opens and the year filled in are known.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T10:00:00+01:00"));
});

const Field = ({
  initial,
  onChange,
  min,
}: {
  initial: string;
  onChange?: (value: string) => void;
  min?: string;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <Label>
      Fällig
      <DateInput
        value={value}
        min={min}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </Label>
  );
};

const field = () => screen.getByRole("combobox", { name: "Fällig" }) as HTMLInputElement;

describe("DateInput", () => {
  it("is named by the label around it and shows the day in German", () => {
    render(<Field initial="2026-12-18" />);
    expect(field().value).toBe("18.12.2026");
  });

  it("takes a typed day once it is complete, in German or ISO form", () => {
    const onChange = vi.fn();
    render(<Field initial="" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "1.12.20" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "1.12.2030" } });
    expect(onChange).toHaveBeenLastCalledWith("2030-12-01");
    fireEvent.change(field(), { target: { value: "2030-12-18" } });
    expect(onChange).toHaveBeenLastCalledWith("2030-12-18");
    fireEvent.blur(field());
    expect(field().value).toBe("18.12.2030");
  });

  it("fills in the year on leaving the field, and drops text that is no day", () => {
    const onChange = vi.fn();
    render(<Field initial="2026-12-18" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "24.12." } });
    fireEvent.blur(field());
    expect(onChange).toHaveBeenLastCalledWith("2026-12-24");
    expect(field().value).toBe("24.12.2026");
    fireEvent.change(field(), { target: { value: "irgendwann" } });
    fireEvent.blur(field());
    expect(field().value).toBe("24.12.2026");
  });

  it("is empty when the text is cleared", () => {
    const onChange = vi.fn();
    render(<Field initial="2026-12-18" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("opens a month from Monday with today marked, and picks a day with the keys", async () => {
    const onChange = vi.fn();
    render(<Field initial="2026-11-27" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Kalender öffnen" }));
    const dialog = screen.getByRole("dialog", { name: "Datum wählen" });
    const grid = screen.getByRole("grid", { name: "November 2026" });
    expect(dialog.contains(grid)).toBe(true);
    expect(screen.getAllByRole("columnheader").map((head) => head.textContent)).toEqual([
      "Mo",
      "Di",
      "Mi",
      "Do",
      "Fr",
      "Sa",
      "So",
    ]);
    expect(screen.getByRole("button", { name: "Montag, 23. November 2026" })).toHaveProperty(
      "ariaCurrent",
      "date",
    );
    // Opens on the chosen day; → a day, ↓ a week, Page Down a month.
    const chosen = screen.getByRole("button", { name: "Freitag, 27. November 2026" });
    expect(document.activeElement).toBe(chosen);
    fireEvent.keyDown(chosen, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Dienstag, 5. Januar 2027");
    expect(screen.getByRole("grid", { name: "Januar 2027" })).toBeTruthy();
    fireEvent.click(document.activeElement!);
    expect(onChange).toHaveBeenLastCalledWith("2027-01-05");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(field().value).toBe("05.01.2027");
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it("opens with ↓ in the field and closes with Escape, back in the field", async () => {
    render(<Field initial="" />);
    field().focus();
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    // Without a day, the month of today.
    expect(screen.getByRole("grid", { name: "November 2026" })).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Montag, 23. November 2026");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // Radix hands the focus back after a tick.
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });

  it("refuses days before min, in the month and for the form", () => {
    const onChange = vi.fn();
    render(<Field initial="2026-11-20" min="2026-11-23" onChange={onChange} />);
    expect(field().validationMessage).toBe("Frühestens am 23.11.2026");
    fireEvent.click(screen.getByRole("button", { name: "Kalender öffnen" }));
    fireEvent.click(screen.getByRole("button", { name: "Sonntag, 22. November 2026" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dienstag, 24. November 2026" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-24");
    expect(field().validationMessage).toBe("");
  });
});

const When = ({ onChange }: { onChange: (value: string) => void }) => {
  const [value, setValue] = useState("");
  return (
    <DateTimeInput
      aria-label="Senden am"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

describe("DateTimeInput", () => {
  it("is a group of a day and a time, and has a value once both are there", () => {
    const onChange = vi.fn();
    render(<When onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Senden am" });
    const day = group.querySelector<HTMLInputElement>('[aria-label="Datum"]')!;
    const time = group.querySelector<HTMLInputElement>('[aria-label="Uhrzeit"]')!;
    act(() => {
      fireEvent.change(day, { target: { value: "24.11.2026" } });
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(day.value).toBe("24.11.2026");
    fireEvent.change(time, { target: { value: "08:00" } });
    expect(onChange).toHaveBeenLastCalledWith("2026-11-24T08:00");
  });
});
