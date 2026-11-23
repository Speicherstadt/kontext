/**
 * Addresses as chips, with suggestions while typing: To/Cc/Bcc/Reply-To in the composer (label in the
 * line) and the attendees of an appointment (a boxed field under its label, like the others).
 */
import { X } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import type { EmailAddress } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/format";
import type { Suggestion } from "@/lib/groups";
import { m } from "@/paraglide/messages";

type Props = {
  label: string;
  value: EmailAddress[];
  onChange: (value: EmailAddress[]) => void;
  /** Colleagues, contacts, and groups that add all their members. */
  suggestions: Suggestion[];
  autoFocus?: boolean;
  boxed?: boolean;
  /** Shown while there are no chips. */
  placeholder?: string;
};

/** Escape closes the list until the text changes; up and down pick a suggestion. */
const matchesOf = (
  text: string,
  suggestions: Suggestion[],
  value: EmailAddress[],
  dismissed: boolean,
) => {
  const needle = text.trim().toLowerCase();
  if (needle.length < 1 || dismissed) return [];
  const taken = new Set(value.map((a) => a.email.toLowerCase()));
  return suggestions
    .filter((a) => !taken.has(a.email.toLowerCase()))
    .filter(
      (a) =>
        a.email.toLowerCase().includes(needle) || (a.name ?? "").toLowerCase().includes(needle),
    )
    .slice(0, 6);
};

/** The typed text, its suggestions, and turning it into chips. */
const useRecipientInput = ({
  value,
  onChange,
  suggestions,
}: Pick<Props, "value" | "onChange" | "suggestions">) => {
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Escape closes the list until the text changes.
  const [dismissed, setDismissed] = useState(false);
  const matches = useMemo(
    () => matchesOf(text, suggestions, value, dismissed),
    [text, suggestions, value, dismissed],
  );
  const add = (addresses: EmailAddress[]) => {
    const known = new Set(value.map((a) => a.email.toLowerCase()));
    onChange([...value, ...addresses.filter((a) => !known.has(a.email.toLowerCase()))]);
    setText("");
    setHighlight(0);
  };
  /** A group stands for its members. */
  const pick = (suggestion: Suggestion) => add(suggestion.members ?? [suggestion]);
  /** Turns what was typed into chips; keeps text that is not an address yet. */
  const commit = (): boolean => {
    const { addresses, invalid } = parseAddresses(text);
    if (addresses.length === 0) return false;
    add(addresses);
    setText(invalid.join(", "));
    return true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (matches.length > 0 && event.key === "Escape") {
      setDismissed(true);
    } else if (matches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setHighlight(
        (h) => (h + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length,
      );
    } else if (
      event.key === "Enter" ||
      event.key === "," ||
      event.key === ";" ||
      event.key === "Tab"
    ) {
      if (matches.length > 0 && event.key !== ",") {
        event.preventDefault();
        pick(matches[highlight] ?? matches[0]!);
      } else if (text.trim()) {
        // Half-typed text never submits the form around the field.
        if (commit() || event.key === "Enter") event.preventDefault();
      }
    } else if (event.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };
  const type = (next: string) => {
    setText(next);
    setHighlight(0);
    setDismissed(false);
  };
  return { text, type, highlight, matches, pick, commit, onKeyDown };
};

/** The addresses as chips, each with its "entfernen". */
const Chips = ({ value, onChange }: Pick<Props, "value" | "onChange">) => (
  <>
    {value.map((address) => (
      <span
        key={address.email}
        title={address.email}
        className="inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-full border border-border pr-1 pl-2.5 text-[13px]"
      >
        {/* One line: a long address is cut short (the whole one is in the title), not wrapped
            out of the chip. */}
        <span className="min-w-0 truncate">{displayName(address)}</span>
        <button
          type="button"
          aria-label={`${address.email} entfernen`}
          onClick={() => onChange(value.filter((a) => a !== address))}
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
        >
          <X size={12} />
        </button>
      </span>
    ))}
  </>
);

/** The suggestions below the field; a click picks without the field losing the focus. */
const SuggestionList = ({
  id,
  boxed,
  input,
}: {
  id: string;
  boxed?: boolean;
  input: ReturnType<typeof useRecipientInput>;
}) => (
  <div
    id={id}
    role="listbox"
    className={cn(
      "absolute top-full z-20 m-0 mt-1 list-none rounded-xl border border-border bg-bg p-1 shadow-lg",
      boxed ? "left-0 w-[min(360px,100%)]" : "left-9 w-[min(360px,calc(100%-36px))]",
    )}
  >
    {input.matches.map((address, index) => (
      <div
        key={address.email}
        role="option"
        tabIndex={-1}
        aria-selected={index === input.highlight}
        onMouseDown={(event) => {
          event.preventDefault();
          input.pick(address);
        }}
        className={cn(
          "flex cursor-pointer flex-col rounded-lg px-2.5 py-1.5",
          index === input.highlight && "bg-hover",
        )}
      >
        <span className="text-[14px]">{address.name ?? address.email}</span>
        {address.members ? (
          <span className="text-[12px] text-muted">
            {m.contacts_group_count({ count: address.members.length })}
          </span>
        ) : address.name ? (
          <span className="text-[12px] text-muted">{address.email}</span>
        ) : null}
      </div>
    ))}
  </div>
);

export const RecipientField = ({
  label,
  value,
  onChange,
  suggestions,
  autoFocus,
  boxed,
  placeholder,
}: Props) => {
  const input = useRecipientInput({ value, onChange, suggestions });
  const listId = useId();
  const open = input.matches.length > 0;
  const entry = (
    <>
      <Chips value={value} onChange={onChange} />
      <input
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoFocus={autoFocus}
        placeholder={value.length ? undefined : placeholder}
        value={input.text}
        onChange={(e) => input.type(e.target.value)}
        onKeyDown={input.onKeyDown}
        onBlur={() => {
          if (input.text.trim()) input.commit();
        }}
        className={cn(
          "h-7 min-w-16 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted",
          boxed && "px-1",
        )}
      />
      {open ? <SuggestionList id={listId} boxed={boxed} input={input} /> : null}
    </>
  );
  // The label keeps its place on the left; only the chips and the input wrap beside it.
  const field = boxed ? (
    <div className="relative flex min-h-10 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1 focus-within:border-muted">
      {entry}
    </div>
  ) : (
    <div className="relative flex min-h-9 min-w-0 flex-1 items-start gap-1.5 py-1">
      <span className="min-w-9 shrink-0 whitespace-nowrap text-[13px] leading-7 text-muted">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{entry}</div>
    </div>
  );
  return boxed ? (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {field}
    </div>
  ) : (
    field
  );
};
