/**
 * Above the list while mails are picked: what can be done with all of them at once. Mails of
 * several mailboxes ("Alle Posteingänge", search) are handled per mailbox; categories and moving
 * are offered when all are in one mailbox, as they belong to it.
 */

import {
  Archive,
  FolderInput,
  ListChecks,
  Mail,
  MailOpen,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { COLOR_STYLES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { categoryState, type Picked } from "@/lib/selection";
import { m } from "@/paraglide/messages";
import { useCategories } from "../categories/queries";
import { SnoozeMenu } from "../snooze/snooze-menu";
import { TaskDialog } from "../tasks/task-dialog";
import { useSelectionActions } from "./selection-actions";

const IconButton = ({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) => (
  <Button
    variant="ghost"
    size="iconSm"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);

type Actions = ReturnType<typeof useSelectionActions>;

/** The tick box for all, how many are picked, and "Auswahl aufheben". */
const PickHeader = ({
  picked,
  allPicked,
  onPickAll,
  onClear,
}: Pick<Props, "picked" | "allPicked" | "onPickAll" | "onClear">) => (
  <div className="flex items-center gap-1">
    <label className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-hover">
      <input
        type="checkbox"
        ref={(box) => {
          if (box) box.indeterminate = !allPicked && picked.length > 0;
        }}
        checked={allPicked}
        aria-label={m.mail_select_all()}
        onChange={allPicked ? onClear : onPickAll}
        className="size-4 cursor-pointer accent-[var(--primary)]"
      />
    </label>
    <span className="min-w-0 flex-1 truncate text-[14px] font-medium" aria-live="polite">
      {picked.length === 1 ? m.mail_selected_one() : m.mail_selected({ count: picked.length })}
    </span>
    <IconButton label={m.mail_selection_clear()} disabled={false} onClick={onClear}>
      <X size={16} />
    </IconButton>
  </div>
);

/** The categories of the one mailbox the picked mails are in, ticked where all or some have them. */
const CategoryMenu = ({
  accountId,
  picked,
  a,
  disabled,
}: {
  accountId: string;
  picked: Picked[];
  a: Actions;
  disabled: boolean;
}) => {
  const categories = useCategories(accountId);
  if (!categories.length) return null;
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={m.categories_menu()}
          title={m.categories_menu()}
          disabled={disabled}
        >
          <Tag size={16} />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {categories.map((category) => {
          const state = categoryState(picked, category);
          return (
            <MenuCheckboxItem
              key={category.keyword}
              checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
              onCheckedChange={() => a.setCategory(accountId, category.keyword, state !== "all")}
            >
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-full", COLOR_STYLES[category.color].dot)}
              />
              {category.name}
            </MenuCheckboxItem>
          );
        })}
      </MenuContent>
    </MenuRoot>
  );
};

/** The folders to move to, by mailbox. */
const MoveMenu = ({ a, disabled }: { a: Actions; disabled: boolean }) => (
  <MenuRoot>
    <MenuTrigger asChild>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.mail_move()}
        title={m.mail_move()}
        disabled={disabled}
      >
        <FolderInput size={16} />
      </Button>
    </MenuTrigger>
    <MenuContent>
      {a.targets.map((group, index) => (
        <Fragment key={group.account.id}>
          {index > 0 ? <MenuSeparator /> : null}
          {a.targets.length > 1 ? <MenuLabel>{group.account.name}</MenuLabel> : null}
          {group.targets.map((target) => (
            <MenuItem key={target.mailbox.id} onSelect={() => a.moveTo(target)}>
              {target.label}
            </MenuItem>
          ))}
        </Fragment>
      ))}
    </MenuContent>
  </MenuRoot>
);

/** The actions for all picked mails at once. */
const SelectionActions = ({
  a,
  picked,
  inJunk,
  onClear,
}: {
  a: Actions;
  picked: Picked[];
  inJunk: boolean;
  onClear: () => void;
}) => {
  const none = picked.length === 0;
  const { accountId, read, flag } = a;
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <IconButton label={m.mail_archive_action()} disabled={none} onClick={a.archive}>
        <Archive size={16} />
      </IconButton>
      <IconButton label={m.mail_delete()} disabled={none} onClick={a.remove}>
        <Trash2 size={16} />
      </IconButton>
      {a.toSnooze ? <SnoozeMenu targets={a.toSnooze} onLeave={onClear} small /> : null}
      <IconButton
        label={inJunk ? m.mail_spam_unmark() : m.mail_spam_mark()}
        disabled={none}
        onClick={a.toggleSpam}
      >
        {inJunk ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
      </IconButton>
      <IconButton
        label={read ? m.mail_mark_read() : m.mail_mark_unread()}
        disabled={none}
        onClick={a.markRead}
      >
        {read ? <MailOpen size={16} /> : <Mail size={16} />}
      </IconButton>
      <IconButton
        label={flag ? m.mail_flag() : m.mail_unflag()}
        disabled={none}
        onClick={a.markFlag}
      >
        <Star size={16} className={flag ? undefined : "fill-warn text-warn"} />
      </IconButton>
      <IconButton label={m.mail_tasks_action()} disabled={none} onClick={a.makeTasks}>
        <ListChecks size={16} />
      </IconButton>
      {accountId ? (
        <IconButton
          label={m.mail_forward_eml()}
          disabled={none}
          onClick={() => a.forwardAsFiles(accountId)}
        >
          <Paperclip size={16} />
        </IconButton>
      ) : null}
      {accountId ? (
        <CategoryMenu accountId={accountId} picked={picked} a={a} disabled={none} />
      ) : null}
      {a.targets.length ? <MoveMenu a={a} disabled={none} /> : null}
    </div>
  );
};

type Props = {
  picked: Picked[];
  allPicked: boolean;
  onPickAll: () => void;
  onClear: () => void;
  /** The open folder, where mails are taken out of; none in combined lists. */
  folderId?: string;
  inJunk: boolean;
};

export const SelectionBar = (props: Props) => {
  const { picked, folderId, inJunk, onClear } = props;
  const a = useSelectionActions({ picked, folderId, inJunk, onClear });
  return (
    <div className="flex flex-col gap-1">
      <PickHeader {...props} />
      <SelectionActions a={a} picked={picked} inJunk={inJunk} onClear={onClear} />
      {a.tasks ? (
        <TaskDialog
          starts={a.tasks}
          onClose={() => a.setTasks(null)}
          onArchive={a.archiveAndClear}
        />
      ) : null}
    </div>
  );
};
