/** What the reading pane's toolbar does with the open mail (message-toolbar.tsx). */
import { useNavigate } from "@tanstack/react-router";
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { isFlagged } from "@/jmap/mail";
import type { EmailDetail, EmailSummary, Mailbox } from "@/jmap/types";
import { emlName } from "@/lib/compose";
import { downloadBlob } from "@/lib/download";
import { domainOf, isExternal } from "@/lib/external-hint";
import { mailboxRights } from "@/lib/mailboxes";
import type { BlockScope } from "@/lib/rules";
import { useEmailActions } from "@/mail-core/actions";
import { useExternalHint } from "@/mail-core/external-hint";
import { useThreadView } from "@/mail-core/thread-view";
import { m } from "@/paraglide/messages";
import { useBlockSender } from "../rules/block-sender";
import { useThread } from "./conversation";
import type { ComposeMode } from "./message-more-menu";
import { usePrintMail } from "./print-mail";
import { useMailAccounts } from "./queries";
import { useRemoteImages } from "./remote-images";
import { useReportPhishing } from "./report-phishing";
import { useOfferUndo } from "./undo";

/** Closes the open mail (and its composer): back to the list. */
export const useCloseMail = () => {
  const navigate = useNavigate();
  return () =>
    navigate({ to: ".", search: (prev) => ({ ...prev, email: undefined, compose: undefined }) });
};

type Run = (action: () => Promise<unknown>, leave: boolean) => Promise<void>;

/** Runs an action, closing the mail first if `leave`; an error shows as a toast. */
const useRun = (): Run => {
  const toast = useToast();
  const close = useCloseMail();
  return async (action, leave) => {
    try {
      if (leave) await close();
      await action();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
};

/** Grouped as conversations: what one does to the line, one does to all of it in this folder. */
const useTargets = (accountId: string, mailbox: Mailbox, email: EmailDetail) => {
  const grouped = useThreadView();
  const thread = useThread(accountId, grouped ? email.threadId : undefined);
  const inFolder = (thread ?? []).filter((mail) => mail.mailboxIds[mailbox.id]);
  const targets: EmailSummary[] = grouped && inFolder.length ? inFolder : [email];
  return { targets, ids: targets.map((mail) => mail.id) };
};

/** Archive, delete, spam, unread, flag and move, each only where the mailbox's rights allow it. */
export const useMailActions = (accountId: string, mailbox: Mailbox, email: EmailDetail) => {
  const actions = useEmailActions(accountId);
  const offerUndo = useOfferUndo();
  const run = useRun();
  const { targets, ids } = useTargets(accountId, mailbox, email);
  const flagged = isFlagged(email);
  const { canRemove, canMarkSeen, canFlag } = mailboxRights(mailbox);
  // In Spam the same action takes a mail back out; own sent mail is no spam.
  const inJunk = mailbox.role === "junk";
  const removable = (action: () => Promise<unknown>) =>
    canRemove ? () => run(action, true) : undefined;
  const toggleSpam =
    canRemove && mailbox.role !== "sent"
      ? () =>
          void run(async () => {
            const move = await actions.markSpam(ids, mailbox.id, !inJunk);
            offerUndo(inJunk ? m.mail_spam_unmarked() : m.mail_spam_marked(), [move]);
          }, true)
      : undefined;
  const archive =
    mailbox.role !== "archive"
      ? removable(async () =>
          offerUndo(m.mail_archived(), [await actions.archive(ids, mailbox.id)]),
        )
      : undefined;
  const trash = removable(async () =>
    offerUndo(m.mail_trashed(), [await actions.remove(ids, mailbox.id)]),
  );
  const remove = trash ? () => void trash() : undefined;
  const markUnread = canMarkSeen
    ? () => void run(() => actions.setSeen(ids, false), true)
    : undefined;
  const toggleFlag = () => void run(() => actions.setFlagged([email.id], !flagged), false);
  const moveTo = (target: { accountId: string; mailbox: { id: string }; label: string }) =>
    void run(async () => {
      const where = { accountId: target.accountId, mailboxId: target.mailbox.id };
      const move = await actions.moveTo(targets, mailbox.id, where);
      offerUndo(m.mail_moved({ folder: target.label }), [move]);
    }, true);
  const markSpam = () => actions.markSpam(ids, mailbox.id, true);
  return {
    run,
    ids,
    flagged,
    canRemove,
    canFlag,
    inJunk,
    toggleSpam,
    archive,
    remove,
    markUnread,
    toggleFlag,
    moveTo,
    markSpam,
  };
};

type MailActions = ReturnType<typeof useMailActions>;

/**
 * "Absender blockieren", offered in the own mailbox for senders outside: colleagues and shared
 * mailboxes are not blocked (the company's domains and the mailboxes' own).
 */
export const useBlock = (
  accountId: string,
  sender: string | undefined,
  ownMailbox: boolean,
  mail: MailActions,
) => {
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const accounts = useMailAccounts();
  const blockSender = useBlockSender(accountId);
  const { data: company } = useExternalHint();
  const ownDomains = [
    ...(company?.domains ?? []),
    ...accounts.map((candidate) => domainOf(candidate.name)),
  ];
  if (!ownMailbox || !sender || !blockSender || !isExternal(sender, ownDomains)) return undefined;
  const { inJunk, toggleSpam } = mail;
  const run = (scope: BlockScope) =>
    void mail.run(
      async () => {
        await blockSender(sender, scope);
        const text = m.mail_sender_blocked({
          sender: scope === "address" ? sender : domainOf(sender),
        });
        if (inJunk || !toggleSpam) return toast.show(text, "info");
        offerUndo(text, [await mail.markSpam()]);
      },
      Boolean(toggleSpam && !inJunk),
    );
  return { address: sender, domain: domainOf(sender), run };
};

/** Reply, print, save as .eml and "Phishing melden". */
export const useMoreActions = (
  accountId: string,
  email: EmailDetail,
  mailbox: Mailbox,
  mail: MailActions,
) => {
  const navigate = useNavigate();
  const client = useClient();
  const report = useReportPhishing(accountId, email, mailbox.id);
  const reportPhishing =
    report && mail.toggleSpam && !mail.inJunk ? () => void mail.run(report, true) : undefined;
  const compose = (mode: ComposeMode) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, compose: mode }) });
  const printMail = usePrintMail();
  const { allowRemote } = useRemoteImages(email);
  const print = () => void mail.run(() => printMail(accountId, email, allowRemote), false);
  const saveEml = () =>
    void mail.run(async () => {
      const name = emlName(email.subject);
      downloadBlob(await client.download(accountId, email.blobId, name, "message/rfc822"), name);
    }, false);
  return { reportPhishing, compose, print, saveEml };
};
