/**
 * What the date and time fields share: the popover in the look of the menus, and whether a phone
 * gets the system's own picker instead.
 */
import * as Popover from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { useMediaQuery } from "@/components/use-media-query";
import { cn } from "@/lib/cn";

/**
 * Touch first (phones, tablets): the system's picker. Its wheels and calendar sheets are made for
 * fingers and come up without the keyboard covering half the screen; a typed field with a popover
 * is the better tool for a mouse and a keyboard. The value is the same string either way.
 */
export const useNativePicker = (): boolean => useMediaQuery("(pointer: coarse)");

/**
 * A modal dialog (Radix, react-remove-scroll) blocks the wheel outside itself, and the portal is
 * outside it: the wheel stops at the popover, so the popover's list still scrolls.
 */
const keepWheel = (node: HTMLDivElement | null) => {
  if (!node) return;
  const stop = (event: Event) => event.stopPropagation();
  node.addEventListener("wheel", stop);
  return () => node.removeEventListener("wheel", stop);
};

/** The popover's content in the look of the menus, portalled above dialogs. */
export const FieldPopoverContent = ({
  className,
  ...props
}: ComponentProps<typeof Popover.Content>) => (
  <Popover.Portal>
    <Popover.Content
      ref={keepWheel}
      align="start"
      sideOffset={6}
      collisionPadding={8}
      className={cn(
        "z-[60] rounded-xl border border-border bg-bg text-[14px] text-fg shadow-lg outline-none",
        className,
      )}
      {...props}
    />
  </Popover.Portal>
);
