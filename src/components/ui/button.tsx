import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Tooltip, type TooltipSide } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import type { ShortcutAction } from "@/lib/shortcuts";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-onprimary hover:opacity-90",
        outline: "border border-border bg-transparent hover:bg-hover",
        ghost: "bg-transparent text-muted hover:bg-hover hover:text-fg",
        subtle: "bg-subtle hover:bg-hover",
        danger: "border border-border bg-transparent text-danger hover:bg-hover",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-[13px]",
        lg: "h-11 px-4 text-[16px]",
        icon: "size-9",
        iconSm: "size-8",
        iconLg: "size-11",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

type ButtonProps = Omit<ComponentProps<"button">, "title"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shown as the tooltip (tooltip.tsx), not the browser's; the name stays the aria-label. */
    title?: string;
    /** The action whose keys the tooltip shows behind the title. */
    shortcut?: ShortcutAction;
    tooltipSide?: TooltipSide;
  };

export const Button = ({
  className,
  variant,
  size,
  asChild,
  type,
  title,
  shortcut,
  tooltipSide,
  ...props
}: ButtonProps) => {
  const Component = asChild ? Slot : "button";
  const button = (
    <Component
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
  return title ? (
    <Tooltip label={title} shortcut={shortcut} side={tooltipSide} disabled={props.disabled}>
      {button}
    </Tooltip>
  ) : (
    button
  );
};
