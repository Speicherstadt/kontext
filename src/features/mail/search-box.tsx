/**
 * The search field above every mail list. Enter searches all mail (`/mail/all/search?q=…`);
 * while typing it suggests contacts, folders, operators and the last searches.
 */
import { useNavigate } from "@tanstack/react-router";
import { Clock, Folder, Search, SlidersHorizontal, User, X } from "lucide-react";
import {
  forwardRef,
  type KeyboardEvent,
  type RefObject,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ShortcutKeys } from "@/components/ui/kbd";
import { useContacts } from "@/contacts-core/queries";
import { cn } from "@/lib/cn";
import { contactAddresses } from "@/lib/jscontact";
import { mailboxPath } from "@/lib/mailboxes";
import {
  readRecent,
  rememberSearch,
  type SearchSuggestion,
  suggest,
} from "@/lib/search-suggestions";
import { m } from "@/paraglide/messages";
import { useAllMailboxes, useMailAccounts } from "./queries";

const ICONS = { contact: User, folder: Folder, operator: SlidersHorizontal, recent: Clock };

/** All folders by path, and the shared mailboxes ("info@"), for `in:`. */
const useFolderNames = (): string[] => {
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  return useMemo(() => {
    const names = new Set<string>();
    for (const account of accounts) {
      if (!account.isPersonal) names.add(account.name.replace(/@.*/, "@"));
      const list = mailboxes[account.id] ?? [];
      for (const mailbox of list) if (!mailbox.role) names.add(mailboxPath(mailbox, list));
    }
    return ["Posteingang", "Gesendet", "Entwürfe", "Archiv", "Papierkorb", "Spam", ...names];
  }, [accounts, mailboxes]);
};

export type SearchBoxHandle = { focus: () => void };

/** The text, the suggestions while it has the focus, and searching. */
const useSearchInput = (initial: string | undefined, input: RefObject<HTMLInputElement | null>) => {
  const navigate = useNavigate();
  const [text, setText] = useState(initial ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const { data: cards } = useContacts();
  const contacts = useMemo(() => contactAddresses(cards), [cards]);
  const folders = useFolderNames();
  const suggestions = useMemo(
    () => (open ? suggest(text, { contacts, folders, recent: readRecent() }) : []),
    [open, text, contacts, folders],
  );
  const submit = (query: string) => {
    const q = query.trim();
    setOpen(false);
    setHighlight(-1);
    if (!q) return;
    rememberSearch(q);
    input.current?.blur();
    void navigate({
      to: "/mail/$accountId/$mailboxId",
      params: { accountId: "all", mailboxId: "search" },
      search: { q },
    });
  };
  const pick = (suggestion: SearchSuggestion) => {
    setText(suggestion.value);
    setHighlight(-1);
    // Operators and people only start a search; a recent search runs at once.
    if (suggestion.kind === "recent") submit(suggestion.value);
    else input.current?.focus();
  };
  const type = (next: string) => {
    setText(next);
    setOpen(true);
    setHighlight(-1);
  };
  return { text, setText, open, setOpen, highlight, setHighlight, suggestions, submit, pick, type };
};

type Input = ReturnType<typeof useSearchInput>;

/** Up and down through the suggestions (and back to the text), Enter, Escape. */
const keysOf =
  (box: Input, input: RefObject<HTMLInputElement | null>) =>
  (event: KeyboardEvent<HTMLInputElement>) => {
    const { suggestions, highlight } = box;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 is the text itself; the arrows wrap around through it.
      box.setHighlight((h) => {
        const next = h + step;
        return next < -1 ? suggestions.length - 1 : next >= suggestions.length ? -1 : next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = suggestions[highlight];
      if (chosen) box.pick(chosen);
      else box.submit(box.text);
    } else if (event.key === "Escape") {
      if (box.open && suggestions.length) box.setOpen(false);
      else {
        box.setText("");
        input.current?.blur();
      }
    }
  };

/** The suggestions below the field; a click picks without the field losing the focus. */
const SuggestionList = ({ id, box }: { id: string; box: Input }) => (
  <div
    id={id}
    role="listbox"
    aria-label={m.search_title()}
    className="absolute inset-x-0 top-full z-30 mt-1 flex flex-col rounded-xl border border-border bg-bg p-1 shadow-lg"
  >
    {box.suggestions.map((suggestion, index) => {
      const Icon = ICONS[suggestion.kind];
      return (
        <div
          key={`${suggestion.kind}-${suggestion.value}`}
          role="option"
          tabIndex={-1}
          aria-selected={index === box.highlight}
          onMouseDown={(e) => {
            e.preventDefault();
            box.pick(suggestion);
          }}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px]",
            index === box.highlight && "bg-hover",
          )}
        >
          <Icon size={14} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">
            {suggestion.kind === "operator" ? (
              <code className="font-mono text-[13px]">{suggestion.label}</code>
            ) : (
              suggestion.label
            )}
          </span>
          {suggestion.detail ? (
            <span className="truncate text-[12px] text-muted">{suggestion.detail}</span>
          ) : null}
        </div>
      );
    })}
  </div>
);

export const SearchBox = forwardRef<SearchBoxHandle, { initial?: string }>(({ initial }, ref) => {
  const input = useRef<HTMLInputElement>(null);
  const box = useSearchInput(initial, input);
  const listId = useId();
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));
  return (
    <div className="relative">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-subtle px-3 text-muted md:h-9 md:rounded-lg md:border md:border-border md:bg-transparent">
        <Search size={16} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={m.mail_search()}
          aria-expanded={box.suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={m.search_placeholder()}
          value={box.text}
          onChange={(e) => box.type(e.target.value)}
          onFocus={() => box.setOpen(true)}
          onBlur={() => setTimeout(() => box.setOpen(false), 120)}
          onKeyDown={keysOf(box, input)}
          className="peer min-w-0 flex-1 border-0 bg-transparent text-[16px] text-fg outline-none md:text-[14px] [&::-webkit-search-cancel-button]:hidden"
        />
        {/* Its key, beside the field rather than in a tooltip; gone while typing. */}
        {box.text ? null : (
          <span aria-hidden="true" className="hidden md:flex peer-focus:hidden">
            <ShortcutKeys action="search" className="min-w-5 px-1 py-0 text-[11px] text-muted" />
          </span>
        )}
        {box.text ? (
          <button
            type="button"
            aria-label={m.search_clear()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              box.setText("");
              input.current?.focus();
            }}
            className="flex size-6 items-center justify-center rounded-md hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
      {box.suggestions.length > 0 ? <SuggestionList id={listId} box={box} /> : null}
    </div>
  );
});
SearchBox.displayName = "SearchBox";
