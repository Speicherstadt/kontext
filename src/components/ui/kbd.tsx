import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { isApple, type ShortcutAction, shortcutCaps } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages";

/** One key as a small cap, in the shortcuts help, behind a tooltip's text, in a search field. */
export const Kbd = ({ className, ...props }: ComponentProps<"kbd">) => (
  <kbd
    className={cn(
      "min-w-6 rounded-md border border-border bg-subtle px-1.5 py-0.5 text-center font-mono text-[12px]",
      className,
    )}
    {...props}
  />
);

const onApple = () => typeof navigator !== "undefined" && isApple(navigator.platform);

/** The caps of an action's shortcut on this device: [Strg] [Enter], on a Mac [⌘] [Enter]. */
export const deviceCaps = (action: ShortcutAction | undefined): string[] =>
  action ? shortcutCaps(action, { apple: onApple(), ctrl: m.shortcuts_key_ctrl() }) : [];

/** An action's keys, one cap each, in the look `className` gives them. */
export const ShortcutKeys = ({
  action,
  className,
}: {
  action: ShortcutAction;
  className?: string;
}) => {
  const caps = deviceCaps(action);
  return caps.length === 0 ? null : (
    <span className="flex gap-0.5">
      {caps.map((cap) => (
        <Kbd key={cap} className={className}>
          {cap}
        </Kbd>
      ))}
    </span>
  );
};
