/** What the selection bar does with the picked mails, per mailbox they are in (selection-bar.tsx). */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { correspondent } from "@/lib/correspondent";
import { moveTargets } from "@/lib/move-targets";
import {
  groupsOf,
  marksFlagged,
  marksRead,
  type Picked,
  singleAccount,
  snoozeTargets,
} from "@/lib/selection";
import { mailLink, plainSubject } from "@/lib/tasks";
import type { MailMove } from "@/lib/undo-move";
import { useMailActions } from "@/mail-core/actions";
import { m } from "@/paraglide/messages";
import type { TaskStart } from "../tasks/task-dialog";
import { useAllMailboxes, useMailAccounts } from "./queries";
import { useOfferUndo } from "./undo";

type Input = { picked: Picked[]; folderId?: string; inJunk: boolean; onClear: () => void };

/** Runs for every group; a refusal (e.g. a mailbox only to read) is said once. */
const useRunAll = (onClear: () => void) => {
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const run = async <T>(action: () => Promise<T>[], clear: boolean) => {
    if (clear) onClear();
    const results = await Promise.allSettled(action());
    const failed = results.find((result) => result.status === "rejected");
    if (failed)
      toast.show(
        m.common_error({ message: String(failed.reason?.message ?? failed.reason) }),
        "error",
      );
    return results;
  };
  /** Moves the mails go through, then offers to take back what did move. */
  const runMoves = async (action: () => Promise<MailMove | undefined>[], text: string) => {
    const results = await run(action, true);
    offerUndo(
      text,
      results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
    );
  };
  return { run, runMoves };
};

/** Forwarding as files and making tasks: the picked mails taken elsewhere. */
const useTakeElsewhere = (picked: Picked[], onClear: () => void) => {
  const navigate = useNavigate();
  const accounts = useMailAccounts();
  const [tasks, setTasks] = useState<TaskStart[] | null>(null);
  /** All picked mails as .eml files in one new mail; the composer sends from their account. */
  const forwardAsFiles = (account: string) => {
    const emails = picked.map((entry) => entry.email.id).join(",");
    onClear();
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, compose: "forwardEml", emails, email: undefined, account }),
    });
  };
  const names = accounts.map((candidate) => candidate.name);
  /** One task per picked mail, linked to it and to its sender's card. */
  const makeTasks = () =>
    setTasks(
      picked.map(({ accountId: account, email }) => ({
        title: plainSubject(email.subject ?? ""),
        accountId: account,
        link: mailLink(account, email),
        person: correspondent(email, names)?.email,
      })),
    );
  return { tasks, setTasks, forwardAsFiles, makeTasks };
};

export const useSelectionActions = ({ picked, folderId, inJunk, onClear }: Input) => {
  const actions = useMailActions();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  const { run, runMoves } = useRunAll(onClear);
  const groups = groupsOf(picked, folderId);
  const accountId = singleAccount(picked);
  const read = marksRead(picked);
  const flag = marksFlagged(picked);
  const byAccount = [...new Set(picked.map((entry) => entry.accountId))].map((id) => ({
    id,
    ids: picked.filter((entry) => entry.accountId === id).map((entry) => entry.email.id),
  }));
  const ofGroups =
    <T>(each: (accountId: string, ids: string[], from: string) => Promise<T>) =>
    () =>
      groups.map((g) =>
        each(
          g.accountId,
          g.emails.map((e) => e.id),
          g.from,
        ),
      );
  const archiveAll = ofGroups(actions.archive);
  const targets =
    accountId && groups.length === 1
      ? moveTargets(accounts, mailboxes, { accountId, mailboxId: groups[0]!.from })
      : [];
  const spamText = inJunk ? m.mail_spam_unmarked() : m.mail_spam_marked();
  return {
    ...useTakeElsewhere(picked, onClear),
    accountId,
    read,
    flag,
    targets,
    toSnooze: snoozeTargets(groups, mailboxes),
    archive: () => void runMoves(archiveAll, m.mail_archived()),
    remove: () => void runMoves(ofGroups(actions.remove), m.mail_trashed()),
    toggleSpam: () =>
      void runMoves(
        ofGroups((account, ids, from) => actions.markSpam(account, ids, from, !inJunk)),
        spamText,
      ),
    markRead: () => void run(() => byAccount.map((a) => actions.setSeen(a.id, a.ids, read)), false),
    markFlag: () =>
      void run(() => byAccount.map((a) => actions.setFlagged(a.id, a.ids, flag)), false),
    setCategory: (account: string, keyword: string, on: boolean) =>
      void run(
        () => [
          actions.setCategory(
            account,
            picked.map((entry) => entry.email.id),
            keyword,
            on,
          ),
        ],
        false,
      ),
    moveTo: (target: { accountId: string; mailbox: { id: string }; label: string }) =>
      void runMoves(
        () => [
          actions.moveTo(accountId!, groups[0]!.emails, groups[0]!.from, {
            accountId: target.accountId,
            mailboxId: target.mailbox.id,
          }),
        ],
        m.mail_moved({ folder: target.label }),
      ),
    archiveAndClear: folderId ? () => run(archiveAll, true) : undefined,
  };
};
