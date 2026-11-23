/**
 * The reading pane's toolbar: the actions used on almost every mail (archive, delete, spam,
 * snooze, flag, assign), all alike (toolbar-button.tsx), then reply and everything else under
 * "Weitere Aktionen" (message-more-menu.tsx); the shortcuts for all of them.
 */
import { Link } from "@tanstack/react-router";
import { Archive, ChevronLeft, Reply, ShieldAlert, ShieldCheck, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { usePersonalAccountId } from "@/account/queries";
import { Button } from "@/components/ui/button";
import { usePrintKey } from "@/components/use-print-key";
import { useShortcuts } from "@/components/use-shortcuts";
import type { EmailDetail, Mailbox } from "@/jmap/types";
import { correspondent } from "@/lib/correspondent";
import { canAssignIn } from "@/lib/mailboxes";
import { moveTargets } from "@/lib/move-targets";
import { type Rule, ruleFromSender } from "@/lib/rules";
import { mailLink, plainSubject } from "@/lib/tasks";
import { ToolbarButton } from "@/mail-core/toolbar-button";
import { m } from "@/paraglide/messages";
import { CategoryDialog } from "../categories/category-dialog";
import { CategorySubmenu } from "../categories/category-menu";
import { DiscussDialog } from "../chat/discuss-dialog";
import { OwnRuleDialog } from "../rules/rule-dialog";
import { SnoozeMenu } from "../snooze/snooze-menu";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { AssignMenu } from "./assignment";
import { MoreMenu } from "./message-more-menu";
import { useBlock, useCloseMail, useMailActions, useMoreActions } from "./message-toolbar-actions";
import { useAllMailboxes, useMailAccounts } from "./queries";

export { useCloseMail } from "./message-toolbar-actions";

type Props = { accountId: string; mailbox: Mailbox; email: EmailDetail };
type Mail = ReturnType<typeof useMailActions>;

/** The actions used on almost every mail, as buttons that show their names where there is room. */
const QuickActions = ({
  accountId,
  mailbox,
  email,
  mail,
  close,
  assign,
}: Props & { mail: Mail; close: () => unknown; assign: boolean }) => (
  <div className="flex min-w-0 flex-1 items-center gap-1">
    {mail.archive ? (
      <ToolbarButton
        label={m.mail_archive_action()}
        shortcut="archive"
        onClick={mail.archive}
        icon={<Archive size={16} />}
      />
    ) : null}
    {mail.remove ? (
      <ToolbarButton
        label={m.mail_delete()}
        shortcut="delete"
        onClick={mail.remove}
        icon={<Trash2 size={16} />}
      />
    ) : null}
    {mail.toggleSpam ? (
      <ToolbarButton
        label={mail.inJunk ? m.mail_spam_unmark() : m.mail_spam_mark()}
        shortcut="spam"
        onClick={mail.toggleSpam}
        icon={mail.inJunk ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
      />
    ) : null}
    {mail.canRemove && mailbox.role !== "drafts" && mailbox.role !== "sent" ? (
      <SnoozeMenu
        targets={[{ accountId, ids: mail.ids, from: mailbox.id }]}
        onLeave={mailbox.role === "snoozed" ? undefined : close}
        shortcut
        labelled
      />
    ) : null}
    {mail.canFlag ? (
      <ToolbarButton
        label={mail.flagged ? m.mail_unflag() : m.mail_flag()}
        shortcut="flag"
        aria-pressed={mail.flagged}
        onClick={mail.toggleFlag}
        icon={<Star size={16} className={mail.flagged ? "fill-warn text-warn" : undefined} />}
      />
    ) : null}
    {assign ? <AssignMenu accountId={accountId} email={email} /> : null}
  </div>
);

/** The dialogs the toolbar opens: a rule, the categories, a discussion, a task. */
type Dialogs = {
  rule: Rule | null;
  setRule: (rule: Rule | null) => void;
  editingCategories: boolean;
  setEditingCategories: (on: boolean) => void;
  discussing: boolean;
  setDiscussing: (on: boolean) => void;
  task: TaskStart | null;
  setTask: (task: TaskStart | null) => void;
};

const useDialogs = (): Dialogs => {
  const [rule, setRule] = useState<Rule | null>(null);
  const [task, setTask] = useState<TaskStart | null>(null);
  const [discussing, setDiscussing] = useState(false);
  // Outside the menu: the menu and all in it go away when the dialog opens.
  const [editingCategories, setEditingCategories] = useState(false);
  return {
    rule,
    setRule,
    task,
    setTask,
    discussing,
    setDiscussing,
    editingCategories,
    setEditingCategories,
  };
};

const ToolbarDialogs = ({
  accountId,
  email,
  d,
  mailboxLabel,
  onArchive,
}: {
  accountId: string;
  email: EmailDetail;
  d: Dialogs;
  mailboxLabel: string;
  onArchive: Mail["archive"];
}) => (
  <>
    {d.rule ? <OwnRuleDialog initial={d.rule} onClose={() => d.setRule(null)} /> : null}
    {d.editingCategories ? (
      <CategoryDialog
        accountId={accountId}
        mailbox={mailboxLabel}
        onClose={() => d.setEditingCategories(false)}
      />
    ) : null}
    {d.discussing ? (
      <DiscussDialog accountId={accountId} email={email} onClose={() => d.setDiscussing(false)} />
    ) : null}
    {d.task ? (
      <TaskDialog starts={[d.task]} onClose={() => d.setTask(null)} onArchive={onArchive} />
    ) : null}
  </>
);

/** The shortcuts of the toolbar's actions, and the print key. */
const useToolbarKeys = (
  mail: Mail,
  more: ReturnType<typeof useMoreActions>,
  newTask: () => void,
  discuss: () => void,
) => {
  useShortcuts({
    r: () => more.compose("reply"),
    a: () => more.compose("replyAll"),
    f: () => more.compose("forward"),
    e: mail.archive,
    "#": mail.remove,
    s: mail.canFlag ? mail.toggleFlag : undefined,
    U: mail.markUnread,
    "!": mail.toggleSpam,
    p: more.print,
    t: newTask,
    b: discuss,
  });
  usePrintKey(more.print);
};

export const Toolbar = ({ accountId, mailbox, email }: Props) => {
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  // Rules run on the own mailbox only, so they are offered for its mails.
  const ownMailbox = usePersonalAccountId() === accountId;
  const sender = email.from?.[0]?.email;
  const d = useDialogs();
  const close = useCloseMail();
  const mail = useMailActions(accountId, mailbox, email);
  const block = useBlock(accountId, sender, ownMailbox, mail);
  const more = useMoreActions(accountId, email, mailbox, mail);
  const people = accounts.map((account) => account.name);
  const newTask = () =>
    d.setTask({
      title: plainSubject(email.subject ?? ""),
      accountId,
      link: mailLink(accountId, email),
      person: correspondent(email, people)?.email,
    });
  useToolbarKeys(mail, more, newTask, () => d.setDiscussing(true));
  const account = accounts.find((candidate) => candidate.id === accountId);
  const groups = moveTargets(accounts, mailboxes, { accountId, mailboxId: mailbox.id });
  const assign = Boolean(canAssignIn(mailbox) && account && !account.isPersonal);
  return (
    // A container: the names show where the pane is wide enough, whatever the screen's width.
    <div className="@container flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_back()}
        className="md:hidden"
        onClick={() => close()}
      >
        <ChevronLeft size={20} />
      </Button>
      <QuickActions
        accountId={accountId}
        mailbox={mailbox}
        email={email}
        mail={mail}
        close={close}
        assign={assign}
      />
      <Button
        asChild
        variant="outline"
        size="sm"
        className="hidden shrink-0 sm:inline-flex"
        title={m.mail_reply()}
        shortcut="reply"
      >
        <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
          <Reply size={16} /> {m.mail_reply()}
        </Link>
      </Button>
      <MoreMenu
        compose={more.compose}
        print={more.print}
        saveEml={more.saveEml}
        markUnread={mail.markUnread}
        reportPhishing={more.reportPhishing}
        block={block}
        move={mail.canRemove ? { groups, onPick: mail.moveTo } : undefined}
        categories={
          mail.canFlag ? (
            <CategorySubmenu
              accountId={accountId}
              email={email}
              onEdit={() => d.setEditingCategories(true)}
            />
          ) : undefined
        }
        newTask={newTask}
        discuss={() => d.setDiscussing(true)}
        newRule={
          ownMailbox && sender
            ? () => d.setRule(ruleFromSender(crypto.randomUUID(), sender))
            : undefined
        }
      />
      <ToolbarDialogs
        accountId={accountId}
        email={email}
        d={d}
        mailboxLabel={account?.name ?? ""}
        onArchive={mail.archive}
      />
    </div>
  );
};
