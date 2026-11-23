/**
 * A checkbox in the shadcn look: a rounded square with a border, filled with the primary colour
 * and a tick when checked, a dash when indeterminate. It stays a native <input type="checkbox">
 * (drawn with `appearance: none`), so labels, forms, refs, `indeterminate` and the keyboard work
 * as before. The tick comes from `--check-mark` in styles.css, drawn in each theme's onprimary.
 * `color` fills it with another colour (a calendar's), with a white tick.
 */
import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/cn";

const BOX = cn(
  "size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-muted/50 bg-bg",
  "bg-center bg-no-repeat bg-[length:12px_12px] shadow-xs transition-colors",
  "checked:border-[color:var(--checkbox-fill,var(--primary))]",
  "checked:bg-[color:var(--checkbox-fill,var(--primary))]",
  "checked:bg-[image:var(--checkbox-mark,var(--check-mark))]",
  "indeterminate:border-[color:var(--checkbox-fill,var(--primary))]",
  "indeterminate:bg-[color:var(--checkbox-fill,var(--primary))]",
  "indeterminate:bg-[image:var(--checkbox-dash,var(--check-dash))]",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const checkboxStyle = (color?: string, style?: CSSProperties): CSSProperties | undefined =>
  color
    ? ({
        ...style,
        "--checkbox-fill": color,
        "--checkbox-mark": "var(--check-mark-white)",
        "--checkbox-dash": "var(--check-dash-white)",
      } as CSSProperties)
    : style;

export const Checkbox = ({
  className,
  color,
  style,
  ...props
}: Omit<ComponentProps<"input">, "type" | "color"> & { color?: string }) => (
  <input
    type="checkbox"
    {...props}
    style={checkboxStyle(color, style)}
    className={cn(BOX, className)}
  />
);
