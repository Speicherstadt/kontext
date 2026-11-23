/**
 * A choice from a list, in the look of the menus (Radix Select): keyboard, typeahead and screen
 * readers as with a native `<select>`, but the list is ours instead of the system's. Options can
 * carry an icon, a hint (an address, a provider) and a badge, and they can stand in groups.
 */
import * as Primitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/cn";

export type SelectOption<T extends string = string> = {
  value: T;
  /** What the option is called; also what typeahead matches. */
  label: string;
  /** A second, quieter line: an address, a provider, what the choice means. */
  hint?: string;
  /** A short tag after the label, such as "Alias" or "Gruppe". */
  badge?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SelectGroup<T extends string = string> = {
  label: string;
  options: SelectOption<T>[];
};

export type SelectEntry<T extends string = string> = SelectOption<T> | SelectGroup<T>;

const isGroup = <T extends string>(entry: SelectEntry<T>): entry is SelectGroup<T> =>
  "options" in entry;

/** Every option, groups flattened. */
export const optionsOf = <T extends string>(entries: SelectEntry<T>[]): SelectOption<T>[] =>
  entries.flatMap((entry) => (isGroup(entry) ? entry.options : [entry]));

/**
 * Radix reserves the empty string for "nothing chosen", but "" is a common value here ("Keine",
 * "Alle"); it stands in for it inside Radix only.
 */
const EMPTY = "\u0000empty";
const toRadix = (value: string) => (value === "" ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? "" : value);

const triggerVariants = cva(
  "inline-flex w-full min-w-0 items-center gap-2 text-left text-fg outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted [&>span:first-child]:min-w-0 [&>span:first-child]:flex-auto [&>span:first-child]:truncate",
  {
    variants: {
      variant: {
        field: "rounded-lg border border-border bg-bg focus-visible:border-muted",
        ghost: "rounded-md bg-transparent hover:bg-hover focus-visible:bg-hover",
      },
      size: {
        md: "h-10 px-3 text-[14px]",
        sm: "h-8 px-2.5 text-[13px]",
      },
    },
    defaultVariants: { variant: "field", size: "md" },
  },
);

type SelectProps<T extends string> = VariantProps<typeof triggerVariants> & {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectEntry<T>[];
  id?: string;
  name?: string;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Show the hint of the chosen option in the field too, not only in the list. */
  showHint?: boolean;
};

const Badge = ({ children }: { children: string }) => (
  <span className="shrink-0 rounded-md bg-subtle px-1.5 py-px text-[11px] font-medium text-muted">
    {children}
  </span>
);

/** The chosen option in the closed field: icon, label, and the hint when asked for. */
const Chosen = ({ option, showHint }: { option: SelectOption; showHint: boolean }) => (
  <span className="flex min-w-0 items-center gap-2">
    {option.icon ? <span className="flex shrink-0 text-muted">{option.icon}</span> : null}
    {/* The label keeps its room; a long hint is cut first. */}
    <span className={cn("truncate", showHint && option.hint && "max-w-[70%] shrink-0")}>
      {option.label}
    </span>
    {showHint && option.hint ? (
      <span className="min-w-0 truncate text-muted">{option.hint}</span>
    ) : null}
    {showHint && option.badge ? <Badge>{option.badge}</Badge> : null}
  </span>
);

/** The option's name is its label (typeahead, tests); badge and hint are read as its description. */
const Item = ({ option }: { option: SelectOption }) => {
  const describedBy = useId();
  const described = Boolean(option.badge || option.hint);
  return (
    <Primitive.Item
      value={toRadix(option.value)}
      aria-describedby={described ? describedBy : undefined}
      disabled={option.disabled}
      textValue={option.label}
      className={cn(
        "relative flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg py-1.5 pr-8 pl-2.5 outline-none",
        "data-[highlighted]:bg-hover data-[disabled]:cursor-default data-[disabled]:opacity-50",
      )}
    >
      {option.icon ? <span className="flex shrink-0 text-muted">{option.icon}</span> : null}
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Primitive.ItemText>
            <span className="truncate">{option.label}</span>
          </Primitive.ItemText>
          {option.badge ? <Badge>{option.badge}</Badge> : null}
        </span>
        {option.hint ? (
          <span className="truncate text-[12px] text-muted">{option.hint}</span>
        ) : null}
      </span>
      {described ? (
        <span id={describedBy} className="sr-only">
          {[option.badge, option.hint].filter(Boolean).join(", ")}
        </span>
      ) : null}
      <Primitive.ItemIndicator className="absolute right-2.5 flex text-fg">
        <Check size={16} />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
};

export const Select = <T extends string>({
  value,
  onValueChange,
  options,
  variant,
  size,
  className,
  placeholder,
  showHint = false,
  disabled,
  required,
  name,
  ...trigger
}: SelectProps<T>) => {
  const chosen = optionsOf(options).find((option) => option.value === value);
  // A required field on "" ("Bitte wählen") counts as empty for the form, as a native one did:
  // Radix's "" is nothing chosen, its hidden <select> then fails `required`.
  const unset = !chosen || (required && value === "");
  return (
    <Primitive.Root
      value={unset ? "" : toRadix(value)}
      onValueChange={(next) => onValueChange(fromRadix(next) as T)}
      disabled={disabled}
      required={required}
      name={name}
    >
      <Primitive.Trigger className={cn(triggerVariants({ variant, size }), className)} {...trigger}>
        <Primitive.Value placeholder={chosen?.label ?? placeholder}>
          {chosen ? <Chosen option={chosen} showHint={showHint} /> : null}
        </Primitive.Value>
        <Primitive.Icon className="ml-auto flex shrink-0 text-muted">
          <ChevronDown size={16} />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-h-[min(70dvh,var(--radix-select-content-available-height))] min-w-[max(var(--radix-select-trigger-width),12rem)] max-w-[calc(100vw-16px)]",
            "overflow-hidden rounded-xl border border-border bg-bg text-[14px] text-fg shadow-lg",
          )}
        >
          <Primitive.Viewport className="p-1">
            {options.map((entry, index) =>
              isGroup(entry) ? (
                <Primitive.Group key={entry.label}>
                  {index > 0 ? <Primitive.Separator className="my-1 h-px bg-border" /> : null}
                  <Primitive.Label className="px-2.5 pt-2 pb-1 text-[12px] font-medium text-muted">
                    {entry.label}
                  </Primitive.Label>
                  {entry.options.map((option) => (
                    <Item key={option.value} option={option} />
                  ))}
                </Primitive.Group>
              ) : (
                <Item key={entry.value} option={entry} />
              ),
            )}
          </Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
};
