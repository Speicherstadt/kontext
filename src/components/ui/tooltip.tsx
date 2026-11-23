/**
 * Hints in the app's look instead of the browser's `title`: a small pill with the name and, behind
 * it, the shortcut as keys. It waits a moment on the first hover; moved on to a neighbour soon
 * after, the next one shows at once. It shows on keyboard focus too, not on touch, and goes with
 * Esc or a click. The name stays the element's aria-label; a hint that only repeats it is not
 * read out a second time.
 */
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  type ComponentProps,
  createContext,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { deviceCaps, ShortcutKeys } from "@/components/ui/kbd";
import type { ShortcutAction } from "@/lib/shortcuts";

/**
 * Half a second on the first hover; within 300 ms after one closes, the next opens at once. The
 * pill itself is not for the mouse: on the way to the next button, often across the pill, Radix
 * would otherwise keep the first one open.
 */
const TIMING = { delayDuration: 500, skipDelayDuration: 300, disableHoverableContent: true };

type Input = "keyboard" | "pointer";

/**
 * The shared provider's record of the last input, or null where there is none (a test, a lone
 * page): such a tooltip brings its own Radix provider and takes every focus as the keyboard's.
 */
const LastInput = createContext<RefObject<Input> | null>(null);

/** Once around the app: the delay, "neighbours show at once" and the last input are shared. */
export const TooltipProvider = ({ children }: { children: ReactNode }) => {
  const lastInput = useRef<Input>("keyboard");
  useEffect(() => {
    const keyboard = () => {
      lastInput.current = "keyboard";
    };
    const pointer = () => {
      lastInput.current = "pointer";
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  return (
    <TooltipPrimitive.Provider {...TIMING}>
      <LastInput.Provider value={lastInput}>{children}</LastInput.Provider>
    </TooltipPrimitive.Provider>
  );
};

export type TooltipSide = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  /** The hint; without one the element shows none. */
  label?: ReactNode;
  /** The action whose keys stand behind the label (lib/shortcuts.ts). */
  shortcut?: ShortcutAction;
  /** Where it opens; Radix turns it round at the screen's edge. Bars at the bottom say "top". */
  side?: TooltipSide;
  /** A disabled control shows no hint; taken from the element when not given. */
  disabled?: boolean;
  /** One element that takes a ref and the trigger's props: a button, a link, a Radix trigger. */
  children: ReactElement;
};

/**
 * Focus after a click (a menu or dialog giving it back after a choice with the mouse) is no
 * reason for a hint; focus after a key is. `:focus-visible` does not tell them apart there: the
 * menu's items had the focus by script. Radix skips opening when the event is prevented.
 */
const onlyKeyboardFocus =
  (lastInput: RefObject<Input> | null) => (event: FocusEvent<HTMLElement>) => {
    if (lastInput?.current === "pointer") event.preventDefault();
  };

/**
 * What a screen reader hears as the description while the hint shows. Radix describes the trigger
 * by the hint's text; when that only repeats the element's name, just the keys are left, or a
 * blank (an empty label would make Radix fall back to the text).
 */
const spokenHint = (label: ReactNode, name: unknown, shortcut?: ShortcutAction) =>
  label === name ? deviceCaps(shortcut).join(" ") || " " : undefined;

const TooltipBody = ({
  label,
  shortcut,
  side,
  spoken,
}: Pick<TooltipProps, "label" | "shortcut" | "side"> & { spoken?: string }) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      side={side}
      sideOffset={6}
      collisionPadding={8}
      aria-label={spoken}
      className="z-50 flex max-w-72 items-center gap-2 rounded-md bg-primary px-2 py-1 text-[12px] leading-4 text-onprimary shadow-md"
    >
      <span>{label}</span>
      {shortcut ? (
        <ShortcutKeys
          action={shortcut}
          className="min-w-5 border-onprimary/25 bg-onprimary/10 px-1 py-0 text-[11px] text-onprimary"
        />
      ) : null}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
);

/**
 * Props beyond its own (and a ref) go on to the element: inside another Radix trigger with
 * `asChild` (a menu's, a select's), that trigger's `data-state` and handlers win over the
 * tooltip's, so "open" stays the menu's.
 */
export const Tooltip = ({
  label,
  shortcut,
  side = "bottom",
  disabled,
  children,
  onFocus,
  ...forwarded
}: TooltipProps &
  Omit<ComponentProps<typeof TooltipPrimitive.Trigger>, "children" | "asChild">) => {
  const lastInput = useContext(LastInput);
  const [open, setOpen] = useState(false);
  const own = children.props as { disabled?: boolean; "aria-label"?: string };
  // A disabled button may still get pointer events in some browsers; its hint stays away.
  const off = disabled ?? own.disabled;
  const name = own["aria-label"] ?? forwarded["aria-label"];
  const tooltip = (
    <TooltipPrimitive.Root open={open && !off && Boolean(label)} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger
        asChild
        disabled={disabled}
        {...forwarded}
        onFocus={(event) => {
          onFocus?.(event);
          onlyKeyboardFocus(lastInput)(event);
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      {label ? (
        <TooltipBody
          label={label}
          shortcut={shortcut}
          side={side}
          spoken={spokenHint(label, name, shortcut)}
        />
      ) : null}
    </TooltipPrimitive.Root>
  );
  return lastInput ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider {...TIMING}>{tooltip}</TooltipPrimitive.Provider>
  );
};
