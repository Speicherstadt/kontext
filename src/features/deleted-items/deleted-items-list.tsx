/**
 * One account's deleted items as Stalwart Enterprise keeps them: what it was, when it was deleted
 * and how long it stays, with Wiederherstellen (mails, into the inbox) and Endgültig löschen.
 * Used in the own settings and by the admin for an employee or shared mailbox.
 */
import {
  CalendarDays,
  Contact,
  FileText,
  ListFilter,
  type LucideIcon,
  Mail,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatSize } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import type { ArchivedItem, ArchivedKind } from "./api";
import { useArchiveChange, useArchivedItems } from "./queries";

const KINDS: Record<ArchivedKind, { icon: LucideIcon; label: () => string }> = {
  Email: { icon: Mail, label: m.deleted_kind_email },
  FileNode: { icon: FileText, label: m.deleted_kind_file },
  CalendarEvent: { icon: CalendarDays, label: m.deleted_kind_event },
  ContactCard: { icon: Contact, label: m.deleted_kind_contact },
  SieveScript: { icon: ListFilter, label: m.deleted_kind_script },
};

const day = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });
const formatDay = (iso: string) => day.format(new Date(iso));

const titleOf = (item: ArchivedItem) =>
  item.title || (item.kind === "Email" ? m.deleted_no_subject() : m.deleted_untitled());

export const DeletedItemsList = ({ accountId }: { accountId: string }) => {
  const { data: items, error, isPending } = useArchivedItems(accountId);
  const [asking, setAsking] = useState<ArchivedItem | null>(null);
  if (isPending) return <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>;
  if (error)
    return (
      <p role="alert" className="m-0 text-[14px] text-danger">
        {m.common_error({ message: error.message })}
      </p>
    );
  if (!items.length) return <p className="m-0 text-[14px] text-muted">{m.deleted_empty()}</p>;
  return (
    <>
      <ul
        aria-label={m.deleted_title()}
        className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0"
      >
        {items.map((item) => (
          <ItemRow key={item.id} accountId={accountId} item={item} onDestroy={setAsking} />
        ))}
      </ul>
      {asking ? (
        <DestroyDialog accountId={accountId} item={asking} onClose={() => setAsking(null)} />
      ) : null}
    </>
  );
};

const ItemRow = ({
  accountId,
  item,
  onDestroy,
}: {
  accountId: string;
  item: ArchivedItem;
  onDestroy: (item: ArchivedItem) => void;
}) => {
  const toast = useToast();
  const restore = useArchiveChange(accountId, false);
  const { icon: Icon, label } = KINDS[item.kind];
  const title = titleOf(item);
  const run = () =>
    restore.mutate([item.id], {
      onSuccess: () => toast.show(m.deleted_restored()),
      onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    });
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:gap-3 md:px-4">
      <span className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-muted"
          title={label()}
        >
          <Icon size={16} aria-label={label()} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-medium">{title}</span>
          {item.from ? <span className="truncate text-[13px] text-muted">{item.from}</span> : null}
          <span className="text-[12px] text-muted">
            {m.deleted_meta({
              deleted: formatDay(item.archivedAt),
              until: formatDay(item.archivedUntil),
            })}
            {item.size ? ` · ${formatSize(item.size)}` : ""}
          </span>
          {item.restorable ? null : (
            <span className="text-[12px] text-muted">{m.deleted_not_restorable()}</span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 gap-2 pl-11 md:pl-0">
        {item.restorable ? (
          <Button
            size="sm"
            disabled={restore.isPending}
            aria-label={`${m.deleted_restore()}: ${title}`}
            onClick={run}
          >
            <RotateCcw size={14} /> {m.deleted_restore()}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${m.deleted_destroy()}: ${title}`}
          onClick={() => onDestroy(item)}
        >
          <Trash2 size={14} />
        </Button>
      </span>
    </li>
  );
};

const DestroyDialog = ({
  accountId,
  item,
  onClose,
}: {
  accountId: string;
  item: ArchivedItem;
  onClose: () => void;
}) => {
  const toast = useToast();
  const destroy = useArchiveChange(accountId, true);
  const run = () =>
    destroy.mutate([item.id], {
      onSuccess: () => {
        toast.show(m.deleted_destroyed());
        onClose();
      },
      onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${m.deleted_destroy()}?`}
      description={m.deleted_destroy_confirm({ title: titleOf(item) })}
    >
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {m.mail_later_cancel()}
        </Button>
        <Button variant="danger" disabled={destroy.isPending} onClick={run}>
          {m.deleted_destroy()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
