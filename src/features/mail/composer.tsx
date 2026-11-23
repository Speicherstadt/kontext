/** Writing a mail: sender, recipients, subject, formatted text, attachments. */
import { EditorContent } from "@tiptap/react";
import { ChevronLeft, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { usePrincipals } from "@/directory/queries";
import { AttachFromDocuments } from "@/features/documents/document-actions";
import { EditorToolbar } from "@/mail-core/editor-toolbar";
import { m } from "@/paraglide/messages";
import { SnippetMenu } from "../snippets/snippet-menu";
import { ComposerActions } from "./composer-actions";
import { AttachmentList, ComposerFields } from "./composer-fields";
import { InsertImageButton } from "./composer-images";
import { ForgottenAttachment } from "./forgotten-attachment";
import { LegalFooterPreview } from "./legal-footer-preview";
import { senderOptions } from "./sender-options";
import { type ComposerProps, type Composing, useComposer } from "./use-composer";

/** What a new mail starts with from outside: a contact, a mailto: link, a share. */
export type ComposePrefill = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  files?: File[];
};

type View = { c: Composing; mode: ComposerProps["mode"] };

/** Strg+Enter (Cmd+Enter on a Mac) sends, as in Gmail and Outlook; only when "Senden" could. */
const sendOnCtrlEnter = (event: KeyboardEvent<HTMLFormElement>) => {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
  // Not from a dialog in a portal ("Später senden"): React passes its keys up to here too.
  if (!event.currentTarget.contains(event.target as Node)) return;
  const submit = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit || submit.disabled) return;
  event.preventDefault();
  submit.click();
};

/** The subject as the title, with "Zurück" on a phone and "Schließen" on a desktop. */
const ComposerHeader = ({ c, mode }: View) => (
  <div className="flex items-center gap-2">
    <Button
      variant="ghost"
      size="icon"
      aria-label={m.mail_back()}
      className="md:hidden"
      onClick={() => c.draft.close()}
    >
      <ChevronLeft size={20} />
    </Button>
    <h2 className="m-0 flex-1 truncate text-[18px] font-semibold">
      {c.state.subject || (mode === "new" ? m.mail_compose() : m.mail_no_subject())}
    </h2>
    <Button
      variant="ghost"
      size="icon"
      aria-label={m.common_close()}
      className="hidden md:inline-flex"
      onClick={() => c.draft.close()}
    >
      <X size={16} />
    </Button>
  </div>
);

/** Whom one can send as, with what each address is (alias, shared mailbox, other mailbox). */
const useSenders = ({ sender, login }: Composing) => {
  const { data: principals = [] } = usePrincipals();
  const groups = principals.flatMap((p) => (p.type === "group" && p.email ? [p.email] : []));
  return senderOptions(sender.identities, {
    login,
    groups,
    shared:
      sender.sendAccountId !== sender.own?.id
        ? { mailbox: sender.account?.name ?? "", person: sender.myName }
        : null,
    texts: {
      own: m.mail_from_own(),
      other: m.mail_from_other(),
      alias: m.mail_from_alias(),
      group: m.mail_from_group(),
      appearsAs: (name) => m.mail_from_appears_as({ name }),
    },
  });
};

/** The addresses and the subject. */
const ComposerAddresses = ({ c, mode }: View) => {
  const { state } = c;
  const senders = useSenders(c);
  return (
    <ComposerFields
      senders={senders}
      identityId={state.identityId}
      onIdentity={c.pickIdentity}
      to={state.to}
      onTo={state.setTo}
      cc={state.cc}
      onCc={state.setCc}
      bcc={state.bcc}
      onBcc={state.setBcc}
      showCopies={state.showCopies}
      onShowCopies={() => state.setShowCopies(true)}
      replyTo={state.replyTo}
      onReplyTo={state.setReplyTo}
      showReplyTo={state.showReplyTo}
      onShowReplyTo={() => state.setShowReplyTo(true)}
      subject={state.subject}
      onSubject={state.setSubject}
      suggestions={c.suggestions}
      autoFocusTo={mode === "new" || mode === "forward" || c.asEml}
    />
  );
};

/** The text with its toolbar, the Pflichtangaben below it, and the attachments. */
const ComposerText = ({ c }: { c: Composing }) => {
  const { editor, state } = c;
  return (
    <>
      {editor ? (
        <EditorToolbar
          editor={editor}
          extra={
            <>
              <InsertImageButton onFiles={(files) => void c.pics.insert(files)} />
              <SnippetMenu
                editor={editor}
                accountId={c.sender.sendAccountId}
                recipient={state.to[0]}
                sender={c.sender.myName}
              />
            </>
          }
        />
      ) : null}
      <EditorContent
        editor={editor}
        className="editor-content min-h-[160px] flex-1 overflow-y-auto"
      />
      <LegalFooterPreview footer={c.legalFooter} />
      <AttachmentList
        attachments={state.attachments}
        uploading={state.uploading}
        onRemove={(file) => state.setAttachments((current) => current.filter((a) => a !== file))}
      />
    </>
  );
};

/** Sending, saving, attaching and the options of the mail. */
const ComposerFooter = ({ c }: { c: Composing }) => {
  const { state, pgp, files } = c;
  return (
    <ComposerActions
      sending={state.sending}
      onSendLater={(at) => void c.send(at)}
      canSend={state.uploading === 0 && Boolean(c.identity && c.drafts && c.sent)}
      savedAt={state.savedAt}
      onAttach={(picked) => void files.upload(picked)}
      attachMore={
        <AttachFromDocuments
          accountId={c.sender.sendAccountId}
          inBrowser={state.encrypt}
          onFile={(file) => void files.upload([file])}
          onAttached={(attachment) => state.setAttachments((current) => [...current, attachment])}
          onBusy={(change) => state.setUploading((n) => n + change)}
        />
      }
      onSaveDraft={() => void c.draft.store()}
      receipt={state.receipt}
      onReceipt={state.setReceipt}
      delivery={state.delivery}
      onDelivery={state.setDelivery}
      encrypt={state.encrypt}
      onEncrypt={(on) => void files.switchEncrypt(on)}
      encryptBlocked={pgp.reason}
      encryptNote={pgp.note}
      sign={state.sign}
      onSign={state.setSign}
      signWith={pgp.signWith}
      linkDays={pgp.viaLink.length ? pgp.linkDays : null}
      onLinkDays={pgp.setLinkDays}
      onDiscard={() => void c.draft.discard()}
    />
  );
};

export const Composer = (props: ComposerProps) => {
  const c = useComposer(props);
  const { forgotten, setForgotten } = c.state;
  return (
    <form
      aria-label={m.mail_compose()}
      onSubmit={(event) => {
        event.preventDefault();
        void c.send();
      }}
      onKeyDown={sendOnCtrlEnter}
      className="flex h-full min-h-0 flex-col gap-2.5 px-3 pt-2 pb-3 md:px-[18px] md:pt-3.5 md:pb-4"
    >
      <ComposerHeader c={c} mode={props.mode} />
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border shadow-sm">
        <ComposerAddresses c={c} mode={props.mode} />
        <ComposerText c={c} />
      </div>
      <ComposerFooter c={c} />
      {c.pgp.dialog}
      {c.external.dialog}
      <ForgottenAttachment
        word={forgotten?.word ?? null}
        onAttach={(files) => void c.files.upload(files)}
        onSendAnyway={() => {
          const later = forgotten?.later;
          setForgotten(null);
          void c.send(later, true);
        }}
        onClose={() => setForgotten(null)}
      />
    </form>
  );
};
