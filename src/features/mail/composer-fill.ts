/** Filling the form once: from the original (reply, forward, draft), the prefill and the sender. */
import type { Editor } from "@tiptap/react";
import { useEffect } from "react";
import { replyingExternal } from "@/external-accounts/api";
import { displayBody, type OutgoingAttachment } from "@/jmap/mail";
import type { EmailAddress, EmailDetail, Identity } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import {
  type ComposeMode,
  type EmlOriginal,
  startCompose,
  startEmlForward,
  startReplyTo,
} from "@/lib/compose";
import { sanitizeMailHtml, textToHtml } from "@/lib/html";
import { markCids } from "@/lib/inline-images";
import { withoutLegalFooter } from "@/lib/legal-footer";
import { pgpKind } from "@/lib/pgp-mail";
import { signedOverEncrypted, smimeKind } from "@/lib/smime";
import { type OpenedMail, openedMail, shownSubject } from "@/mail-core/opened-mails";
import type { ComposePrefill } from "./composer";
import type { useComposerImages } from "./composer-images";
import type { ComposerState } from "./composer-state";
import type { HeldFiles } from "./use-held-files";

/** The identity to send from: in a shared mailbox its address, else the login address. */
const defaultIdentity = (identities: Identity[], preferred: string): Identity | undefined =>
  identities.find((identity) => identity.email.toLowerCase() === preferred.toLowerCase()) ??
  identities[0];

/** The sender's signature as HTML, as the composer puts it below the text. */
export const signatureOf = (identity: Identity | undefined): string =>
  identity?.htmlSignature || (identity?.textSignature ? textToHtml(identity.textSignature) : "");

type Quoted = { html: string; encrypted: boolean; opened?: OpenedMail; closedForward: boolean };

const plain = (text: string) =>
  sanitizeMailHtml(textToHtml(text), { allowRemote: false, cidUrls: {} }).html;

/** The original's text to quote, and whether it was encrypted (then as opened here, opened-mails.ts). */
const quotedOriginal = (
  source: EmailDetail,
  mode: ComposeMode,
  cidUrls: Record<string, string>,
  allowRemote: boolean,
): Quoted => {
  const body = displayBody(source);
  // An encrypted original is quoted (and forwarded with its files) only as it was opened here,
  // never as cipher text; the answer goes encrypted too.
  if (
    pgpKind(source.contentType, body.value) === "encrypted" ||
    smimeKind(source.contentType) === "encrypted" ||
    signedOverEncrypted(source)
  ) {
    const opened = openedMail(source.id);
    const html = opened
      ? sanitizeMailHtml(opened.html ?? textToHtml(opened.text), {
          allowRemote: false,
          cidUrls: {},
        }).html
      : "";
    return { html, encrypted: true, opened, closedForward: !opened && mode === "forward" };
  }
  if (body.kind !== "html")
    return { html: plain(body.value), encrypted: false, closedForward: false };
  // Pictures come along: shown from local URLs, marked with their Content-ID. A mail
  // taken back was sent with the Pflichtangaben; they go on again when it is sent.
  const draft = mode === "draft";
  const html = sanitizeMailHtml(markCids(draft ? withoutLegalFooter(body.value) : body.value), {
    allowRemote: !draft && allowRemote,
    cidUrls,
  }).html;
  return { html, encrypted: false, closedForward: false };
};

/** The files that go along: an encrypted original's real ones, kept in the browser; else the start's. */
const startingAttachments = (
  quoted: Quoted | null,
  mode: ComposeMode,
  start: { attachments: OutgoingAttachment[] },
  held: HeldFiles,
): OutgoingAttachment[] => {
  if (!quoted?.encrypted) return start.attachments;
  if (!quoted.opened || mode !== "forward") return [];
  return quoted.opened.attachments.map((file) =>
    held.hold(new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, { type: file.type })),
  );
};

/** What the user typed while the identities were loading wins over the prefill. */
const keep =
  <T>(prefill: T[]) =>
  (current: T[]) =>
    current.length ? current : prefill;

export type FillInput = {
  state: ComposerState;
  editor: Editor | null;
  mode: ComposeMode;
  accountId: string;
  sourceEmailId?: string;
  prefill?: ComposePrefill;
  source?: EmailDetail | null;
  eml: { data?: EmlOriginal[] };
  asEml: boolean;
  identities: Identity[];
  sendersReady: boolean;
  sendAccountId: string;
  account?: { isPersonal: boolean; name: string } | null;
  username: string | undefined;
  myAddresses: string[];
  originalImages: { done: boolean; urls: Record<string, string> };
  originalRemote: boolean;
  held: HeldFiles;
  pics: ReturnType<typeof useComposerImages>;
  onClosedForward: () => void;
};

/** The form's fields from the start, the prefill and the sender's identity. */
const fillFields = (
  input: FillInput,
  start: ReturnType<typeof startCompose>,
  identity?: Identity,
) => {
  const { state, prefill, mode } = input;
  state.setTo(keep(prefill?.to ? parseAddresses(prefill.to).addresses : start.to));
  state.setCc(keep(prefill?.cc ? parseAddresses(prefill.cc).addresses : start.cc));
  state.setBcc(keep(start.bcc));
  if (start.cc.length || start.bcc.length || prefill?.cc) state.setShowCopies(true);
  const startingReplyTo: EmailAddress[] = startReplyTo(mode, start, identity);
  state.setReplyTo(startingReplyTo);
  if (startingReplyTo.length) state.setShowReplyTo(true);
  state.setSubject((current) => current || prefill?.subject || start.subject);
  state.setThreading({ inReplyTo: start.inReplyTo, references: start.references });
};

/** The text: the prefill, the sender's signature (not in a draft, which has it), the quote. */
const fillText = (input: FillInput, html: string, identity?: Identity) => {
  const { editor, mode, prefill } = input;
  if (!editor) return;
  const signature = mode === "draft" ? "" : signatureOf(identity);
  const text = prefill?.body ? textToHtml(prefill.body) : "";
  editor.commands.setContent(`${text}${signature ? `<p></p>${signature}` : ""}${html}`);
  // Into the text – unless one is already typing elsewhere (e.g. the recipient).
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  if (!typing) editor.commands.focus(mode === "draft" ? "end" : "start");
};

/** Whether everything the form starts from is loaded. */
const ready = (input: FillInput) => {
  const { state, editor, identities, sendersReady, asEml, eml, sourceEmailId, source } = input;
  if (state.initialized.current || !editor || editor.isDestroyed || identities.length === 0)
    return false;
  if (!sendersReady) return false;
  if (asEml ? !eml.data : sourceEmailId && !source) return false;
  return input.originalImages.done;
};

const fill = (input: FillInput) => {
  const { state, mode, source, identities } = input;
  const quoted = source
    ? quotedOriginal(source, mode, input.originalImages.urls, input.originalRemote)
    : null;
  if (quoted?.encrypted) state.setEncrypt(true);
  if (quoted?.closedForward) input.onClosedForward();
  // An encrypted original: "Re:" to its real subject, where it was opened (not to the stand-in).
  const original = source ? { ...source, subject: shownSubject(source) } : source;
  const start =
    mode === "forwardEml"
      ? startEmlForward(input.eml.data ?? [])
      : startCompose(mode, original, quoted?.html ?? "", input.myAddresses);
  const answering = (mode === "reply" || mode === "replyAll") && source;
  const identity =
    (answering ? replyingExternal(identities, source) : null) ??
    defaultIdentity(
      identities,
      start.from ??
        (input.sendAccountId !== input.accountId || input.account?.isPersonal
          ? (input.username ?? "")
          : (input.account?.name ?? "")),
    );
  if (identity) state.setIdentityId(identity.id);
  fillFields(input, start, identity);
  // The parts of an encrypted original are cipher text; its real files go along instead, kept in
  // the browser like every file of a mail to be encrypted, and its pictures are not quoted.
  state.setAttachments(startingAttachments(quoted, mode, start, input.held));
  input.pics.setImages(quoted?.encrypted ? [] : start.images);
  fillText(input, start.html, identity);
  state.initialized.current = true;
};

/**
 * Fills the form once the original (for reply/forward) and the identities are loaded. A form
 * hidden by a suspending route gets a new editor when it shows again; the effect still holds the
 * destroyed one then and waits for the render with the new one.
 */
export const useComposerFill = (input: FillInput) => {
  const { editor, identities, sendersReady, source, sourceEmailId, asEml, eml, mode } = input;
  const { myAddresses, prefill, account, username, sendAccountId, accountId } = input;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once (initialized); toast and upload are only called
  useEffect(() => {
    if (ready(input)) fill(input);
  }, [
    editor,
    identities,
    sendersReady,
    source,
    sourceEmailId,
    asEml,
    eml.data,
    mode,
    myAddresses,
    prefill?.to,
    prefill?.cc,
    prefill?.subject,
    prefill?.body,
    account,
    username,
    sendAccountId,
    accountId,
    input.originalImages,
    input.originalRemote,
  ]);
};
