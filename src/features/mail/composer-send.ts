/** Sending the mail: now (held for "Rückgängig"), later, encrypted, signed or through another mailbox. */
import type { QueryClient } from "@tanstack/react-query";
import type { useToast } from "@/components/ui/toast";
import { externalIdOf, sendThroughExternal } from "@/external-accounts/api";
import type { JmapClient } from "@/jmap/client";
import { type Hold, saveDraft, sendEmail } from "@/jmap/mail";
import { isRefusedError } from "@/jmap/refused";
import type { Identity, Mailbox } from "@/jmap/types";
import { attachmentMention, ownText } from "@/lib/attachment-reminder";
import type { ComposeMode } from "@/lib/compose";
import { withLegalFooter } from "@/lib/legal-footer";
import { holdUntil, sendTimeLabel } from "@/lib/schedule";
import type { useExternalQuestion } from "@/mail-core/external-question";
import { m } from "@/paraglide/messages";
import type { useLegalFooter } from "../company/legal-footer";
import type { OutgoingMail } from "./composer-files";
import { signatureOf } from "./composer-fill";
import type { ComposerState } from "./composer-state";
import { settleDraft } from "./draft-place";
import type { useTakeBack } from "./take-back";
import type { useEncryptedSend } from "./use-encrypted-send";

type Toast = ReturnType<typeof useToast>;

export type SendInput = {
  state: ComposerState;
  client: JmapClient;
  queryClient: QueryClient;
  toast: Toast;
  mode: ComposeMode;
  accountId: string;
  sendAccountId: string;
  sourceEmailId?: string;
  identity: Identity | undefined;
  drafts: Mailbox | undefined;
  sent: Mailbox | undefined;
  html: () => string;
  outgoing: () => OutgoingMail;
  released: (mail: OutgoingMail) => Promise<OutgoingMail>;
  legalFooter: ReturnType<typeof useLegalFooter>;
  pgp: ReturnType<typeof useEncryptedSend>;
  external: ReturnType<typeof useExternalQuestion>;
  undoSeconds: number;
  takeBack: ReturnType<typeof useTakeBack>;
  markSaved: () => void;
  leave: () => Promise<unknown>;
};

type Folders = { draftsId: string; sentId: string };

/**
 * Through another mailbox's server: saved as the draft, then sent by the Kontext server; the
 * draft stays the current one, so a failed send can simply be tried again. Returns the
 * recipients the provider turned down.
 */
const sendExternal = async (
  input: SendInput,
  externalId: string,
  mail: OutgoingMail,
  folders: Folders,
) => {
  const emailId = await saveDraft(input.client, mail, folders.draftsId);
  await settleDraft(input, mail.accountId, emailId);
  return (await sendThroughExternal(externalId, { emailId, ...folders })).refused;
};

/** How long the mail is held: until `later`, or for the seconds of "Rückgängig"; never through another mailbox. */
const holdOf = (
  externalId: string | null,
  later: Date | undefined,
  undoSeconds: number,
): Hold | undefined => {
  if (externalId) return undefined;
  if (later) return { until: holdUntil(later) };
  return undoSeconds > 0 ? { seconds: undoSeconds } : undefined;
};

/** Hands the mail over; returns what the server holds (to take back) and who was refused. */
const deliver = async (
  input: SendInput,
  externalId: string | null,
  hold: Hold | undefined,
  folders: Folders,
) => {
  const { state, pgp } = input;
  // The Pflichtangaben go with the mail sent, never into a draft (autosave uses `outgoing`).
  // Signed or encrypted, the mail is built here, with the files kept in the browser.
  const built = withLegalFooter(input.outgoing(), input.legalFooter);
  const mail = state.encrypt || state.sign ? built : await input.released(built);
  const refused = externalId ? await sendExternal(input, externalId, mail, folders) : [];
  const held = externalId
    ? null
    : state.encrypt
      ? await pgp.send(mail, folders, hold)
      : state.sign
        ? await pgp.sendSigned(mail, folders, hold)
        : await sendEmail(input.client, mail, folders, hold);
  // Sent through a shared mailbox: the draft written in the own account before goes.
  if (!externalId) await settleDraft(input, mail.accountId, null);
  // Links and other mailboxes go out at once: nothing to take back, nothing held.
  return { kept: held && !(state.encrypt && pgp.viaLink.length) ? held : null, refused };
};

/** RFC 8621: marks the original as answered; mailboxes shared only for reading may not allow it. */
const markAnswered = async ({ mode, sourceEmailId, client, accountId }: SendInput) => {
  if ((mode !== "reply" && mode !== "replyAll") || !sourceEmailId) return;
  await client
    .call("Email/set", { accountId, update: { [sourceEmailId]: { "keywords/$answered": true } } })
    .catch(() => undefined);
};

type Delivered = Awaited<ReturnType<typeof deliver>>;

/** The toast after sending, with "Rückgängig" or "Senden abbrechen" where the mail is held. */
const toastSent = (
  input: SendInput,
  sent: Delivered & { externalId: string | null; hold?: Hold },
  later?: Date,
) => {
  const { toast, sendAccountId, undoSeconds, takeBack, drafts } = input;
  const { kept, refused, externalId, hold } = sent;
  const back = {
    label: later ? m.mail_unsend() : m.mail_undo(),
    run: () => (kept && drafts ? takeBack(sendAccountId, kept, drafts.id) : Promise.resolve()),
  };
  if (!kept) {
    if (refused.length) toast.show(m.external_refused({ addresses: refused.join(", ") }), "error");
    else toast.show(externalId ? m.mail_sent_toast() : m.secure_sent_toast());
  } else if (later) {
    toast.show(m.mail_scheduled_toast({ when: sendTimeLabel(later) }), "info", {
      action: back,
      duration: 8000,
    });
  } else {
    toast.show(
      m.mail_sent_toast(),
      "info",
      hold ? { action: back, duration: undoSeconds * 1000 } : undefined,
    );
  }
};

/** Whether the mail may go now: recipients, no forgotten attachment, the question about outside. */
const mayGo = (
  input: SendInput,
  retry: () => void,
  later: Date | undefined,
  withoutAttachment: boolean,
  toOutside: boolean,
) => {
  const { state, toast, external } = input;
  const recipients = [...state.to, ...state.cc, ...state.bcc];
  if (recipients.length === 0) {
    toast.show(m.mail_recipients_missing(), "error");
    return false;
  }
  const word =
    withoutAttachment || state.attachments.length
      ? undefined
      : attachmentMention(state.subject, ownText(input.html(), signatureOf(input.identity)));
  if (word) {
    state.setForgotten({ word, later });
    return false;
  }
  const outside = toOutside ? [] : external.outside(recipients.map((a) => a.email));
  if (outside.length) {
    external.ask(outside, retry);
    return false;
  }
  return true;
};

/**
 * Now (held for the seconds of "Rückgängig"), or `later` at that time. Asks first when the own
 * text speaks of an attachment and none is there, unless `withoutAttachment`; then, unless
 * `toOutside`, when recipients are outside the company (Hinweis „Extern“).
 */
export const sendWith = (input: SendInput) => {
  const send = async (
    later?: Date,
    withoutAttachment = false,
    toOutside = false,
  ): Promise<void> => {
    const { state, toast, identity, drafts, sent, queryClient, accountId, sendAccountId } = input;
    if (!mayGo(input, () => void send(later, true, true), later, withoutAttachment, toOutside))
      return;
    if (!identity || !drafts || !sent) return;
    // Another mailbox sends at once through its own server: no holding back, no encrypting or
    // signing yet.
    const externalId = externalIdOf(identity);
    if (externalId && (later || state.encrypt || state.sign)) {
      toast.show(later ? m.external_no_later() : m.external_no_encrypt(), "error");
      return;
    }
    state.setSending(true);
    try {
      if (state.saving.current) await state.saving.current;
      const hold = holdOf(externalId, later, input.undoSeconds);
      const delivered = await deliver(input, externalId, hold, {
        draftsId: drafts.id,
        sentId: sent.id,
      });
      await markAnswered(input);
      input.markSaved();
      toastSent(input, { ...delivered, externalId, hold }, later);
      void queryClient.invalidateQueries({ queryKey: [accountId] });
      if (sendAccountId !== accountId)
        void queryClient.invalidateQueries({ queryKey: [sendAccountId] });
      await input.leave();
    } catch (error) {
      if (isRefusedError(error)) {
        // Back among the drafts (or, encrypted, only here in the form): the old draft is gone.
        await settleDraft(input, sendAccountId, error.draftId);
        toast.show(m.mail_refused({ reasons: error.message }), "error");
      } else toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      state.setSending(false);
    }
  };
  return send;
};
