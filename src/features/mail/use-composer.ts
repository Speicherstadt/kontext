/** Everything the form for writing a mail needs, put together from the composer's hooks. */
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/auth/session";
import { useToast } from "@/components/ui/toast";
import { useAddressSuggestions } from "@/contacts-core/use-suggestions";
import type { Identity, Mailbox } from "@/jmap/types";
import { type ComposeMode, switchReplyTo } from "@/lib/compose";
import { findRole } from "@/lib/mailboxes";
import { useExternalQuestion } from "@/mail-core/external-question";
import { useUndoSeconds } from "@/mail-core/send-settings";
import { useSendAccount } from "@/mail-core/use-send-account";
import { m } from "@/paraglide/messages";
import { useLegalFooter } from "../company/legal-footer";
import { useAutocryptHeader } from "../pgp/autocrypt";
import type { ComposePrefill } from "./composer";
import { useComposerDraft } from "./composer-draft";
import { useComposerEditor } from "./composer-editor";
import {
  type OutgoingInput,
  outgoingMail,
  useComposerFiles,
  useSharedFiles,
} from "./composer-files";
import { useComposerFill } from "./composer-fill";
import { useComposerImages } from "./composer-images";
import { sendWith } from "./composer-send";
import { type ComposerState, useComposerState } from "./composer-state";
import { useInlineImageUrls } from "./inline-image-urls";
import { useEmail } from "./queries";
import { useRemoteImages } from "./remote-images";
import { useTakeBack } from "./take-back";
import { useEmlForward } from "./use-eml-forward";
import { useEncryptedSend } from "./use-encrypted-send";
import { useHeldFiles } from "./use-held-files";

export type ComposerProps = {
  accountId: string;
  mode: ComposeMode;
  sourceEmailId?: string;
  /** "Als Anhang weiterleiten" of several picked mails; else the source mail alone. */
  forwardIds?: string[];
  prefill?: ComposePrefill;
};

/** No original (a new mail): nothing whose pictures from the internet could be allowed. */
const NO_MAIL = { id: "", from: null, authenticationResults: null };

/** The mail the form starts from: the original to answer or forward, or the mails to forward as files. */
const useOriginal = ({ accountId, mode, sourceEmailId, forwardIds }: ComposerProps) => {
  // A mail forwarded as a file needs only its blob, not its content.
  const asEml = mode === "forwardEml";
  const source = useEmail(accountId, asEml ? undefined : sourceEmailId);
  const eml = useEmlForward(
    accountId,
    asEml ? (forwardIds ?? (sourceEmailId ? [sourceEmailId] : [])) : [],
  );
  // The pictures of a draft or of the original, to show them before the text goes into the editor.
  const originalImages = useInlineImageUrls(
    accountId,
    mode === "new" || asEml ? undefined : (source.data ?? undefined),
  );
  // Pictures from the internet stay in a quote only if the original showed them (remote-images.ts).
  const { allowRemote: originalRemote } = useRemoteImages(source.data ?? NO_MAIL);
  return { asEml, source: source.data, eml, originalImages, originalRemote };
};

/** Another sender: its default „Antwort an“ comes along, unless one was written by hand. */
const pickIdentityWith = (state: ComposerState, identities: Identity[]) => (id: string) => {
  const next = switchReplyTo(
    state.replyTo,
    identities.find((i) => i.id === state.identityId),
    identities.find((i) => i.id === id),
  );
  state.setReplyTo(next);
  if (next.length) state.setShowReplyTo(true);
  state.setIdentityId(id);
};

/** The form with its editor, its pictures and its files. */
const useForm = (props: ComposerProps, sendAccountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const state = useComposerState(props.mode, props.sourceEmailId);
  const held = useHeldFiles(client, sendAccountId);
  // Pictures pasted or dropped into the text; set once the hook below has the editor.
  const insertPictures = useRef<(files: File[]) => void>(() => {});
  const editor = useComposerEditor(state, insertPictures);
  const pics = useComposerImages({
    place: (file, alongside) => files.place(file, alongside),
    editor,
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onBusy: (by) => state.setUploading((n) => n + by),
  });
  insertPictures.current = (pictures) => void pics.insert(pictures);
  const files = useComposerFiles({
    state,
    pics,
    held,
    client,
    queryClient,
    sendAccountId,
    onError: (message) => toast.show(message, "error"),
  });
  return { client, queryClient, toast, state, held, editor, pics, files };
};

type Sender = ReturnType<typeof useSendAccount>;
type Form = ReturnType<typeof useForm>;

/** Fills the form once from the original and the sender (composer-fill.ts). */
const useFillFrom = (
  props: ComposerProps,
  sender: Sender,
  original: ReturnType<typeof useOriginal>,
  form: Form,
  username: string | undefined,
) => {
  const { identities } = sender;
  const myAddresses = useMemo(
    () => [username ?? "", ...identities.map((identity) => identity.email)].filter(Boolean),
    [username, identities],
  );
  useComposerFill({
    ...original,
    state: form.state,
    editor: form.editor,
    mode: props.mode,
    accountId: props.accountId,
    sourceEmailId: props.sourceEmailId,
    prefill: props.prefill,
    identities,
    sendersReady: sender.sendersReady,
    sendAccountId: sender.sendAccountId,
    account: sender.account,
    username,
    myAddresses,
    held: form.held,
    pics: form.pics,
    onClosedForward: () => form.toast.show(m.mail_forward_encrypted_closed()),
  });
};

type SendBase = {
  form: Form;
  sender: Sender;
  identity: Identity | undefined;
  drafts: Mailbox | undefined;
  sent: Mailbox | undefined;
  outgoing: OutgoingInput;
  draft: ReturnType<typeof useComposerDraft>;
};

/** Sending: with the Pflichtangaben, encrypted or signed, "Rückgängig", the question about outside. */
const useSending = (
  props: ComposerProps,
  { form, sender, identity, drafts, sent, outgoing, draft }: SendBase,
) => {
  const { state, editor, files, held } = form;
  const pgp = useEncryptedSend(
    identity?.email,
    [...state.to, ...state.cc, ...state.bcc].map((a) => a.email),
    held.blobOf,
  );
  const legalFooter = useLegalFooter();
  const external = useExternalQuestion("mail");
  const send = sendWith({
    ...props,
    state,
    client: form.client,
    queryClient: form.queryClient,
    toast: form.toast,
    sendAccountId: sender.sendAccountId,
    identity,
    drafts,
    sent,
    html: () => editor?.getHTML() ?? "",
    outgoing: () => outgoingMail(outgoing),
    released: files.released,
    legalFooter,
    pgp,
    external,
    undoSeconds: useUndoSeconds(),
    takeBack: useTakeBack(),
    markSaved: draft.markSaved,
    leave: draft.leave,
  });
  return { pgp, legalFooter, external, send };
};

export const useComposer = (props: ComposerProps) => {
  const { data: session } = useSession();
  const sender = useSendAccount(props.accountId, true);
  const { sendAccountId, identities, mailboxes } = sender;
  const original = useOriginal(props);
  const form = useForm(props, sendAccountId);
  useFillFrom(props, sender, original, form, session?.username);
  const { state, editor, pics, files } = form;
  const identity = identities.find((i) => i.id === state.identityId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");
  const autocrypt = useAutocryptHeader(identity?.email);
  const suggestions = useAddressSuggestions();
  const ownId = sender.own?.id;
  const outgoing = {
    state,
    editor,
    pics,
    sendAccountId,
    ownId,
    identity,
    myName: sender.myName,
    autocrypt,
  };
  const draft = useComposerDraft({
    ...form,
    mode: props.mode,
    identity,
    drafts,
    sendAccountId,
    draftMail: () => files.released(outgoingMail(outgoing, { draft: true })),
  });
  const sending = useSending(props, { form, sender, identity, drafts, sent, outgoing, draft });
  useSharedFiles(state, props.prefill, sendAccountId, files.upload);
  const pickIdentity = pickIdentityWith(state, identities);
  const { asEml } = original;
  return {
    ...form,
    ...sending,
    sender,
    identity,
    drafts,
    sent,
    draft,
    pickIdentity,
    asEml,
    suggestions,
  };
};

export type Composing = ReturnType<typeof useComposer>;
