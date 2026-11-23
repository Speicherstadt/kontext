/** The left column's lists (mail-sidebar.tsx): the inbox and standard folders, the mailboxes, own folders. */
import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Archive,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  Inbox,
  Layers,
  LockKeyhole,
  type LucideIcon,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { PlaceholderNav } from "@/components/ui/placeholder";
import { Tooltip } from "@/components/ui/tooltip";
import type { Mailbox } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { mailboxNotice } from "@/lib/mail-accounts";
import { type FolderNode, mailboxName, systemMailboxes } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { useSecureMessages } from "../secure/queries";
import { FolderRow } from "./folder-menu";
import type { useMailDrop } from "./mail-drag";
import { useInboxes, useMailAccounts } from "./queries";

const ROLE_ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  flagged: Star,
  snoozed: AlarmClock,
  drafts: File,
  sent: Send,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
};

export const navClass = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] no-underline hover:bg-hover",
    // A mail dragged over it (mail-drag.ts).
    "data-[drop-over]:bg-hover data-[drop-over]:text-fg data-[drop-over]:ring-1 data-[drop-over]:ring-accent",
    active ? "bg-subtle font-medium text-fg" : "text-muted",
  );

const Count = ({ value }: { value: number }) =>
  value > 0 ? <span className="ml-auto font-mono text-[12px] text-muted">{value}</span> : null;

type Folders = {
  accountId: string;
  mailbox: Mailbox | undefined;
  mailboxes: Mailbox[];
  /** One for the whole column: it knows which entry a mail is dragged over. */
  dropTarget: ReturnType<typeof useMailDrop>;
};

/** A standard folder; drafts, flagged and Wiedervorlage take no dropped mails. */
const SystemFolder = ({
  box,
  accountId,
  mailbox,
  mailboxes,
  dropTarget,
}: Folders & { box: Mailbox }) => {
  const Icon = ROLE_ICONS[box.role ?? ""] ?? Folder;
  const takesNoMails = box.role === "drafts" || box.role === "flagged" || box.role === "snoozed";
  return (
    <FolderRow accountId={accountId} mailbox={box} mailboxes={mailboxes} activeId={mailbox?.id}>
      <Link
        to="/mail/$accountId/$mailboxId"
        params={{ accountId, mailboxId: box.id }}
        {...(takesNoMails ? {} : dropTarget({ accountId, mailboxId: box.id }, mailboxName(box)))}
        className={cn(navClass(box.id === mailbox?.id), "flex-1")}
      >
        <Icon size={16} />
        <span>{mailboxName(box)}</span>
        {box.role === "inbox" || box.role === "junk" ? <Count value={box.unreadEmails} /> : null}
        {box.role === "drafts" || box.role === "snoozed" ? <Count value={box.totalEmails} /> : null}
      </Link>
    </FolderRow>
  );
};

/** "Alle Posteingänge", the standard folders and the encrypted messages. */
export const InboxNav = ({
  view,
  isPending,
  ...folders
}: Folders & { view?: string; isPending: boolean }) => {
  const secure = useSecureMessages();
  const inboxes = useInboxes();
  return (
    <nav aria-label={m.mail_inbox()} className="flex flex-col gap-px">
      {inboxes.length > 1 ? (
        <Link
          to="/mail/$accountId/$mailboxId"
          params={{ accountId: "all", mailboxId: "inbox" }}
          search={{}}
          aria-current={view === "unified" ? "page" : undefined}
          className={navClass(view === "unified")}
        >
          <Layers size={16} />
          <span>{m.mail_all_inboxes()}</span>
          <Count value={inboxes.reduce((sum, inbox) => sum + inbox.mailbox.unreadEmails, 0)} />
        </Link>
      ) : null}
      {/* Bars only: the list's placeholder says "Lädt …" once for the page. */}
      {isPending ? <PlaceholderNav count={7} /> : null}
      {systemMailboxes(folders.mailboxes).map((box) => (
        <SystemFolder key={box.id} box={box} {...folders} />
      ))}
      {secure.length ? (
        <Link to="/secure" search={{}} className={navClass(false)}>
          <LockKeyhole size={16} />
          <span>{m.secure_list_link()}</span>
          <Count value={secure.reduce((sum, message) => sum + message.unreadReplies, 0)} />
        </Link>
      ) : null}
    </nav>
  );
};

/** The own and the shared mailboxes, each to its inbox; a mail dropped on one goes to its inbox. */
export const MailboxesNav = ({
  accountId,
  unified,
  dropTarget,
}: Pick<Folders, "accountId" | "dropTarget"> & { unified: boolean }) => {
  const accounts = useMailAccounts();
  const inboxes = useInboxes();
  if (accounts.length <= 1) return null;
  return (
    <nav aria-label={m.mail_mailboxes()} className="flex flex-col gap-px">
      <div className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">{m.mail_mailboxes()}</div>
      {accounts.map((entry) => {
        const inbox = inboxes.find((candidate) => candidate.account.id === entry.id)?.mailbox;
        // The full address, like everywhere else: a bare "info@" means nothing to most people.
        const label = entry.name;
        return (
          <Tooltip key={entry.id} label={mailboxNotice(entry)} side="right">
            <Link
              to="/mail/$accountId/$mailboxId"
              params={{ accountId: entry.id, mailboxId: "inbox" }}
              data-tour={entry.kind === "shared" ? "shared" : undefined}
              {...(inbox ? dropTarget({ accountId: entry.id, mailboxId: inbox.id }, label) : {})}
              className={navClass(!unified && entry.id === accountId)}
            >
              {entry.isPersonal ? (
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
              ) : (
                <Users size={16} />
              )}
              <span className="truncate">{label}</span>
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
};

type Tree = Folders & { collapsed: Set<string>; toggle: (id: string) => void };

/** An own folder with its subfolders, which fold in and out. */
const FolderItem = ({ node, ...tree }: Tree & { node: FolderNode }) => {
  const { accountId, mailbox, mailboxes, collapsed, toggle, dropTarget } = tree;
  const hasChildren = node.children.length > 0;
  const open = !collapsed.has(node.mailbox.id);
  return (
    <li>
      <FolderRow
        accountId={accountId}
        mailbox={node.mailbox}
        mailboxes={mailboxes}
        activeId={mailbox?.id}
      >
        <Link
          to="/mail/$accountId/$mailboxId"
          params={{ accountId, mailboxId: node.mailbox.id }}
          {...dropTarget({ accountId, mailboxId: node.mailbox.id }, node.mailbox.name)}
          className={cn(navClass(node.mailbox.id === mailbox?.id), "h-8 flex-1")}
          style={{ paddingLeft: 10 + node.depth * 18 }}
        >
          <Folder size={16} />
          <span className="truncate">{node.mailbox.name}</span>
          <Count value={node.mailbox.unreadEmails} />
        </Link>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={node.mailbox.name}
            onClick={() => toggle(node.mailbox.id)}
            className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : null}
      </FolderRow>
      {hasChildren && open ? (
        <ul className="m-0 list-none p-0">
          {node.children.map((child) => (
            <FolderItem key={child.mailbox.id} node={child} {...tree} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

/** The own folders as a tree, with "Neuer Ordner". */
export const FolderNav = ({
  tree,
  heading,
  onNewFolder,
  ...folders
}: Folders & { tree: FolderNode[]; heading: string; onNewFolder: () => void }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <nav aria-label={m.mail_folders()} className="flex flex-col gap-px">
      <div className="flex items-center pr-1 pb-1.5 pl-2.5">
        <span className="flex-1 truncate text-[12px] font-medium text-muted">{heading}</span>
        <Tooltip label={m.mail_new_folder()}>
          <button
            type="button"
            aria-label={m.mail_new_folder()}
            onClick={onNewFolder}
            className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
          >
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>
      <ul className="m-0 list-none p-0">
        {tree.map((node) => (
          <FolderItem
            key={node.mailbox.id}
            node={node}
            collapsed={collapsed}
            toggle={toggle}
            {...folders}
          />
        ))}
      </ul>
    </nav>
  );
};
