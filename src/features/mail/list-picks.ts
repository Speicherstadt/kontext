/** The list's picked mails, and moving through it with the keyboard (list-frame.tsx). */
import { useNavigate } from "@tanstack/react-router";
import type { Virtualizer } from "@tanstack/react-virtual";
import { type RefObject, useEffect, useState } from "react";
import { useShortcuts } from "@/components/use-shortcuts";
import type { MailSearch } from "@/features/mail/search-params";
import { addRange, keepListed, type Picked, pickKey, toggleKey } from "@/lib/selection";
import type { Row } from "./list-frame";
import type { SearchBoxHandle } from "./search-box";
import { useUndoShortcut } from "./undo";

/**
 * Picking rows: one by one, a range with Shift, or all; kept only while listed. Another folder or
 * search (`resetKey`) starts without a selection.
 */
export const useListPicks = (rows: Row[], accountOf: (row: Row) => string, resetKey: string) => {
  const order = rows.map((row) => pickKey(accountOf(row), row.email.id));
  const [picks, setPicks] = useState<{ keys: Set<string>; anchor?: string }>({ keys: new Set() });
  const [selecting, setSelecting] = useState(false);
  const selected = keepListed(picks.keys, order);
  const picked: Picked[] = rows
    .filter((row) => selected.has(pickKey(accountOf(row), row.email.id)))
    .map((row) => ({ accountId: accountOf(row), email: row.email }));
  const clear = () => {
    setPicks({ keys: new Set() });
    setSelecting(false);
  };
  const pick = (key: string, shift: boolean) =>
    setPicks((current) => ({
      keys: shift
        ? addRange(keepListed(current.keys, order), order, current.anchor, key)
        : toggleKey(keepListed(current.keys, order), key),
      anchor: key,
    }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the list's identity matters
  useEffect(() => {
    setPicks({ keys: new Set() });
    setSelecting(false);
  }, [resetKey]);
  const pickAll = () => setPicks({ keys: new Set(order) });
  return { selected, picked, clear, pick, pickAll, selecting, setSelecting };
};

/** Whether a row is the open mail. */
export const isOpen = (row: Row, search: MailSearch) =>
  row.email.id === search.email && (!row.account || row.account.id === search.account);

type Keys = {
  rows: Row[];
  search: MailSearch;
  isDraft: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  searchRef: RefObject<SearchBoxHandle | null>;
  pickOpen: (row: Row) => void;
};

/** c: a new mail, /: the search, j / k: the next or previous mail, x: the open mail into the selection. */
export const useListKeys = ({ rows, search, isDraft, virtualizer, searchRef, pickOpen }: Keys) => {
  const navigate = useNavigate();
  const step = (by: 1 | -1) => {
    const current = rows.findIndex((row) => isOpen(row, search));
    const next = rows[current === -1 ? 0 : current + by];
    if (!next) return;
    virtualizer.scrollToIndex(rows.indexOf(next), { align: "auto" });
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        email: next.email.id,
        account: next.account?.id,
        compose: isDraft ? "draft" : undefined,
      }),
    });
  };
  useShortcuts({
    c: () => void navigate({ to: ".", search: { compose: "new" } }),
    "/": () => searchRef.current?.focus(),
    j: () => step(1),
    k: () => step(-1),
    // x: the open mail into the selection, as in Gmail.
    x: () => {
      const open = rows.find((row) => isOpen(row, search));
      if (open) pickOpen(open);
    },
  });
  useUndoShortcut();
};
