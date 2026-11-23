/** Left column: new mail, standard folders, shared mailboxes, own folders, storage. */
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, SquarePen } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Mailbox } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { type FolderNode, flattenTree, folderTree } from "@/lib/mailboxes";
import { storageLevel } from "@/lib/storage";
import { m } from "@/paraglide/messages";
import { CategoryNav } from "../categories/category-nav";
import { ParentSelect } from "./folder-menu";
import { useMailDrop } from "./mail-drag";
import { FolderNav, InboxNav, MailboxesNav, navClass } from "./mail-sidebar-nav";
import { useCreateMailbox, useMailAccounts, useMailboxes, useQuota } from "./queries";

type Props = {
  accountId: string;
  mailbox: Mailbox | undefined;
  /** A list over all accounts is open: "Alle Posteingänge" or the search. */
  view?: "unified" | "search";
  /** The open search's text, to mark a category whose search it is. */
  query?: string;
};

export const MailSidebar = ({ accountId, mailbox, view, query }: Props) => {
  const unified = view !== undefined;
  const { data: mailboxes = [], isPending } = useMailboxes(accountId);
  const accounts = useMailAccounts();
  const account = accounts.find((candidate) => candidate.id === accountId);
  const dropTarget = useMailDrop();
  const [creating, setCreating] = useState(false);
  const tree = folderTree(mailboxes);
  const folders = { accountId, mailbox, mailboxes, dropTarget };
  const shared = account && !account.isPersonal && !unified;
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2">
        <Link
          to="/mail/$accountId/$mailboxId"
          params={{ accountId, mailboxId: mailbox?.id ?? "inbox" }}
          search={{}}
          aria-label={m.mail_back()}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-hover md:hidden"
        >
          <ChevronLeft size={20} />
        </Link>
        <Button
          asChild
          variant="primary"
          className="h-9 flex-1"
          title={m.mail_compose()}
          shortcut="compose"
        >
          <Link
            data-tour="compose"
            to="/mail/$accountId/$mailboxId"
            params={{ accountId, mailboxId: mailbox?.id ?? "inbox" }}
            search={{ compose: "new" }}
          >
            <SquarePen size={16} /> {m.mail_compose()}
          </Link>
        </Button>
      </div>
      <InboxNav view={view} isPending={isPending} {...folders} />
      <MailboxesNav accountId={accountId} unified={unified} dropTarget={dropTarget} />
      <FolderNav
        tree={tree}
        heading={shared ? m.mail_folders_of({ name: account.name }) : m.mail_folders()}
        onNewFolder={() => setCreating(true)}
        {...folders}
      />
      {account ? (
        <CategoryNav
          accountId={account.id}
          mailbox={account.name}
          activeQuery={view === "search" ? query : undefined}
          navClass={navClass}
        />
      ) : null}
      <div className="flex-1" />
      {/* The own mailbox's storage is the ring around the avatar (account-avatar.tsx). */}
      {shared ? <StorageBar accountId={accountId} /> : null}
      <NewFolderDialog
        open={creating}
        onOpenChange={setCreating}
        accountId={accountId}
        parents={flattenTree(tree)}
        defaultParentId={mailbox && !mailbox.role ? mailbox.id : null}
      />
    </div>
  );
};

const StorageBar = ({ accountId }: { accountId: string }) => {
  const { data: quota } = useQuota(accountId);
  if (!quota) return null;
  const level = storageLevel(quota.used, quota.limit);
  return (
    <div className="flex flex-col gap-2 px-2.5">
      {level ? (
        <div className="h-1 overflow-hidden rounded-full bg-subtle">
          <div
            className={cn(
              "h-full rounded-full",
              level.tone === "full" ? "bg-danger" : level.tone === "warn" ? "bg-warn" : "bg-muted",
            )}
            style={{ width: `${Math.max(level.percent, 1.5)}%` }}
          />
        </div>
      ) : null}
      <div className="text-[12px] text-muted">
        {quota.limit
          ? m.mail_storage({ used: formatSize(quota.used), total: formatSize(quota.limit) })
          : formatSize(quota.used)}
      </div>
    </div>
  );
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  parents: FolderNode[];
  defaultParentId: string | null;
};

const NewFolderDialog = ({
  open,
  onOpenChange,
  accountId,
  parents,
  defaultParentId,
}: DialogProps) => {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const create = useCreateMailbox(accountId);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), parentId: parentId || null });
      setName("");
      onOpenChange(false);
      void navigate({ to: ".", search: (prev) => ({ ...prev, folders: undefined }) });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setParentId(defaultParentId ?? "");
        onOpenChange(next);
      }}
      title={m.mail_new_folder()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.mail_new_folder_name()}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </Label>
        {parents.length > 0 ? (
          <ParentSelect value={parentId} onValueChange={setParentId} options={parents} />
        ) : null}
        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.contacts_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {m.mail_new_folder()}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
