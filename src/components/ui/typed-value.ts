/**
 * The text of a field whose value is typed in another form than it is kept (a date as
 * "18.12.2026", kept as "2026-12-18"). While typing, a value counts as soon as it is complete;
 * on leaving the field (or Enter) a looser reading fills in the rest, and text that is no value
 * gives way to the value again.
 */
import { useState } from "react";

export type Reading = {
  /** The value as text, for a value that is not being typed. */
  format: (value: string) => string;
  /** The value of text being typed, or null while it is not complete. */
  complete: (text: string) => string | null;
  /** The value of text when the field is left, or null if it is none. */
  loose: (text: string) => string | null;
};

export const useTypedValue = (
  value: string,
  onChange: (value: string) => void,
  { format, complete, loose }: Reading,
) => {
  // null: not typing, the field shows the value.
  const [draft, setDraft] = useState<string | null>(null);
  const emit = (next: string) => {
    if (next !== value) onChange(next);
  };
  return {
    text: draft ?? format(value),
    /** Whether the field holds typed text that is not settled yet. */
    typing: draft !== null,
    type: (text: string) => {
      setDraft(text);
      if (!text.trim()) return emit("");
      const next = complete(text);
      if (next !== null) emit(next);
    },
    settle: () => {
      if (draft === null) return;
      const next = draft.trim() ? loose(draft) : "";
      if (next !== null) emit(next);
      setDraft(null);
    },
    /** A value chosen another way (the calendar, the list): the field shows it. */
    choose: (next: string) => {
      emit(next);
      setDraft(null);
    },
  };
};
