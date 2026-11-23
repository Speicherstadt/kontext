/** The draft of the mail being written: saved a moment after each change, on closing, on sign-out. */
import type { QueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { useToast } from "@/components/ui/toast";
import type { JmapClient } from "@/jmap/client";
import { draftParts, saveDraft } from "@/jmap/mail";
import type { Identity, Mailbox } from "@/jmap/types";
import type { ComposeMode } from "@/lib/compose";
import { savedBlobs, withSavedBlob } from "@/lib/draft-blobs";
import { registerDraftFlush } from "@/lib/draft-flush";
import { m } from "@/paraglide/messages";
import type { OutgoingMail } from "./composer-files";
import type { useComposerImages } from "./composer-images";
import type { ComposerState } from "./composer-state";
import { removeDraft, settleDraft } from "./draft-place";

export type DraftInput = {
  state: ComposerState;
  client: JmapClient;
  queryClient: QueryClient;
  mode: ComposeMode;
  editor: Editor | null;
  pics: ReturnType<typeof useComposerImages>;
  identity: Identity | undefined;
  drafts: Mailbox | undefined;
  /** The mail as a draft, its files kept in the browser uploaded. */
  draftMail: () => Promise<OutgoingMail>;
  toast: ReturnType<typeof useToast>;
};

/** Leaves the form: the composer's search parameters go, an opened mail stays (not for a new one). */
const useLeave = (state: ComposerState, mode: ComposeMode) => {
  const navigate = useNavigate();
  return () => {
    state.left.current = true;
    return navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        compose: undefined,
        to: undefined,
        cc: undefined,
        subject: undefined,
        body: undefined,
        shared: undefined,
        emails: undefined,
        email: mode === "new" || mode === "draft" ? undefined : prev.email,
      }),
    });
  };
};

/** Saves the current state as the draft (replacing the previous one); one save at a time. */
const autosaveWith = (input: DraftInput, isEmpty: () => boolean) => async (): Promise<void> => {
  const { state, client, identity, drafts, pics } = input;
  if (state.saving.current) await state.saving.current;
  // Once the form is left, what is still in the editor is no longer the mail: taking the editor
  // off the page drops its pictures (@tiptap/react resets the node views), and a save still
  // waiting would overwrite the draft just written.
  if (state.left.current) return;
  // An encrypted mail is not kept on the server unencrypted, not even as a draft.
  if (!identity || !drafts || isEmpty() || state.encrypt) return;
  const run = (async () => {
    const mail = await input.draftMail();
    const id = await saveDraft(client, mail, drafts.id);
    // Only now: the files of a draft left in another account are still its blobs until here.
    await settleDraft(input, mail.accountId, id);
    state.setSavedAt(new Date());
    // Files and pictures now live in the draft just written; the one replaced took its own.
    if (mail.attachments.length || mail.images.length) {
      const parts = await draftParts(client, mail.accountId, id);
      const saved = savedBlobs(mail.attachments, mail.images, parts);
      state.setAttachments((current) => current.map(withSavedBlob(saved)));
      pics.setImages((current) => current.map(withSavedBlob(saved)));
    }
    void input.queryClient.invalidateQueries({ queryKey: [mail.accountId, "emails"] });
  })();
  state.saving.current = run;
  try {
    await run;
  } finally {
    state.saving.current = null;
  }
};

/**
 * Autosave two seconds after the last change, and the save Abmelden nach Inaktivität waits for
 * (draft-flush.ts); `lastSaved` is the state of the last save.
 */
const useAutosave = (input: DraftInput, autosave: () => Promise<void>, isEmpty: () => boolean) => {
  const { state } = input;
  const { to, cc, bcc, replyTo, subject, attachments, identityId } = state;
  const changeKey = `${state.changes}|${JSON.stringify([to, cc, bcc, replyTo, subject, attachments.length, identityId])}`;
  const lastSaved = useRef(changeKey);
  useEffect(() => {
    if (!state.initialized.current || state.sending || changeKey === lastSaved.current) return;
    const timer = setTimeout(() => {
      lastSaved.current = changeKey;
      void autosave().catch(() => undefined);
    }, 2000);
    return () => clearTimeout(timer);
  });
  /** Saves what changed since the last save now, without waiting for the autosave. */
  const saveNow = async () => {
    if (state.initialized.current && changeKey !== lastSaved.current && !isEmpty()) {
      lastSaved.current = changeKey;
      await autosave().catch(() => undefined);
    }
  };
  // The ref keeps the registered save on this render's state.
  const flushRef = useRef(saveNow);
  flushRef.current = async () => {
    await saveNow();
    await state.saving.current?.catch(() => undefined);
  };
  useEffect(() => registerDraftFlush(() => flushRef.current()), []);
  /** Marks the current state as saved: a send or a discard needs no autosave after it. */
  const markSaved = () => {
    lastSaved.current = changeKey;
  };
  return { saveNow, markSaved };
};

export const useComposerDraft = (input: DraftInput) => {
  const { state, client, queryClient, editor, pics, toast } = input;
  const leave = useLeave(state, input.mode);
  const isEmpty = () =>
    state.to.length + state.cc.length + state.bcc.length === 0 &&
    !state.subject.trim() &&
    state.attachments.length === 0 &&
    pics.images.length === 0 &&
    !(editor?.getText().trim() ?? "");
  const autosave = autosaveWith(input, isEmpty);
  const { saveNow, markSaved } = useAutosave(input, autosave, isEmpty);

  /** Closing keeps the work: unsaved changes are saved as a draft first. */
  const close = async () => {
    await saveNow();
    await leave();
  };

  /** Throws the mail away, including its draft. */
  const discard = async () => {
    markSaved();
    if (state.saving.current) await state.saving.current;
    const saved = state.savedDraft.current;
    if (saved) {
      await removeDraft(client, saved).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: [saved.accountId] });
    }
    await leave();
  };

  const store = async () => {
    // An encrypted mail is kept nowhere on the server, not even as a draft (autosave): saying
    // "saved" and closing would lose it, as switching on deleted the plain draft.
    if (state.encrypt) {
      toast.show(m.mail_encrypted_no_draft(), "error");
      return;
    }
    try {
      markSaved();
      await autosave();
      toast.show(m.mail_draft_saved());
      await leave();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return { leave, close, discard, store, markSaved };
};
