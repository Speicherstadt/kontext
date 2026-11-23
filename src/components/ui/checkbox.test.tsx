import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox, checkboxStyle } from "./checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("stays a native checkbox that a label toggles", () => {
    const onChange = vi.fn();
    render(
      <label>
        <Checkbox checked={false} onChange={onChange} />
        Ganztägig
      </label>,
    );
    fireEvent.click(screen.getByText("Ganztägig"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByRole("checkbox", { name: "Ganztägig" })).toHaveProperty("type", "checkbox");
  });

  it("fills with a given colour and a white tick", () => {
    expect(checkboxStyle("#ff0000")).toMatchObject({
      "--checkbox-fill": "#ff0000",
      "--checkbox-mark": "var(--check-mark-white)",
    });
    expect(checkboxStyle(undefined, { margin: 0 })).toEqual({ margin: 0 });
  });
});
