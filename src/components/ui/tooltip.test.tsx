import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "./menu";
import { TooltipProvider } from "./tooltip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const mouse = { pointerType: "mouse" };

/** The pill on the screen (Radix adds a hidden copy for screen readers inside it). */
const pill = () => document.querySelector("[data-radix-popper-content-wrapper]");

/** The text the pill shows, without the keys and the hidden copy. */
const shown = () =>
  [...document.querySelectorAll("[data-radix-popper-content-wrapper] > * > span:first-child")].map(
    (label) => label.textContent,
  );

const hover = (element: HTMLElement) => fireEvent.pointerMove(element, mouse);

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Tooltip", () => {
  it("turns a button's title into the hint, keeping the aria-label as its name", () => {
    render(
      <Button aria-label="Archivieren" title="Archivieren">
        A
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Archivieren" });
    expect(button.hasAttribute("title")).toBe(false);
  });

  it("shows after a moment on hover, with the shortcut as keys", async () => {
    render(
      <TooltipProvider>
        <Button aria-label="Archivieren" title="Archivieren" shortcut="archive">
          A
        </Button>
      </TooltipProvider>,
    );
    hover(screen.getByRole("button"));
    await wait(200);
    expect(pill()).toBeNull();
    await wait(400);
    expect(shown()).toEqual(["Archivieren"]);
    expect([...pill()!.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual(["E"]);
  });

  it("names Ctrl and Enter as two keys for sending, no dot between", async () => {
    render(
      <Button title="Senden" shortcut="send">
        Senden
      </Button>,
    );
    hover(screen.getByRole("button"));
    await wait(600);
    expect([...pill()!.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual([
      "Strg",
      "Enter",
    ]);
    expect(pill()?.textContent).not.toContain("·");
  });

  it("shows the neighbour at once when moved on quickly", async () => {
    render(
      <TooltipProvider>
        <Button aria-label="Archivieren" title="Archivieren">
          A
        </Button>
        <Button aria-label="Löschen" title="Löschen">
          L
        </Button>
      </TooltipProvider>,
    );
    const [archive, remove] = screen.getAllByRole("button");
    hover(archive!);
    await wait(600);
    fireEvent.pointerLeave(archive!, mouse);
    // Past the way to the pill (Radix's grace area), on to the next button.
    fireEvent.pointerMove(document, { ...mouse, clientX: 500, clientY: 500 });
    hover(remove!);
    await wait(0);
    expect(shown()).toContain("Löschen");
  });

  it("does not show on touch", async () => {
    render(<Button title="Archivieren">A</Button>);
    fireEvent.pointerMove(screen.getByRole("button"), { pointerType: "touch" });
    await wait(1000);
    expect(pill()).toBeNull();
  });

  it("shows on keyboard focus and goes with Esc", async () => {
    render(<Button title="Archivieren">A</Button>);
    act(() => screen.getByRole("button").focus());
    expect(shown()).toEqual(["Archivieren"]);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await wait(0);
    expect(pill()).toBeNull();
  });

  it("stays away when the focus comes back after a click, not after a key", async () => {
    render(
      <TooltipProvider>
        <Button title="Archivieren">A</Button>
        <Button title="Löschen">L</Button>
      </TooltipProvider>,
    );
    const [archive, remove] = screen.getAllByRole("button");
    // A menu chosen with the mouse gives the focus back to its button.
    fireEvent.pointerDown(document.body, mouse);
    act(() => archive!.focus());
    expect(pill()).toBeNull();
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => remove!.focus());
    expect(shown()).toEqual(["Löschen"]);
  });

  it("goes with a click", async () => {
    render(<Button title="Archivieren">A</Button>);
    const button = screen.getByRole("button");
    hover(button);
    await wait(600);
    fireEvent.click(button);
    await wait(0);
    expect(pill()).toBeNull();
  });

  it("stays away from a disabled button", async () => {
    render(
      <Button title="Senden" disabled>
        Senden
      </Button>,
    );
    act(() => screen.getByRole("button").focus());
    hover(screen.getByRole("button"));
    await wait(1000);
    expect(pill()).toBeNull();
  });

  it("does not read the name twice, only the keys", async () => {
    render(
      <Button aria-label="Archivieren" title="Archivieren" shortcut="archive">
        A
      </Button>,
    );
    const button = screen.getByRole("button");
    act(() => button.focus());
    const described = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(described?.textContent).toBe("E");
  });

  it("leaves a menu's state on its trigger", async () => {
    render(
      <MenuRoot>
        <MenuTrigger asChild>
          <Button aria-label="Weitere Aktionen" title="Weitere Aktionen">
            …
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => undefined}>Drucken</MenuItem>
        </MenuContent>
      </MenuRoot>,
    );
    const trigger = screen.getByRole("button", { name: "Weitere Aktionen" });
    expect(trigger.dataset.state).toBe("closed");
    fireEvent.pointerDown(trigger, { ...mouse, button: 0 });
    await wait(0);
    expect(trigger.dataset.state).toBe("open");
    expect(screen.getByRole("menuitem", { name: "Drucken" })).toBeTruthy();
  });
});
