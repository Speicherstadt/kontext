/** The mail as it goes out, and its files: uploaded, or kept in the browser for an encrypted mail. */
import type { QueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { JmapClient } from "@/jmap/client";
import type { Identity } from "@/jmap/types";
import { sharedSenderName } from "@/lib/compose";
import { withSavedBlob } from "@/lib/draft-blobs";
import { formatSize } from "@/lib/format";
import { fitsEncrypted, HELD_LIMIT } from "@/lib/held-files";
import { htmlToText } from "@/lib/html";
import { draftSwap } from "@/lib/send-route";
import { m } from "@/paraglide/messages";
import type { ComposePrefill } from "./composer";
import type { useComposerImages } from "./composer-images";
import type { ComposerState } from "./composer-state";
import { removeDraft } from "./draft-place";
import type { HeldFiles } from "./use-held-files";

type Pictures = ReturnType<typeof useComposerImages>;

export type OutgoingInput = {
  state: ComposerState;
  editor: Editor | null;
  pics: Pictures;
  sendAccountId: string;
  ownId: string | undefined;
  identity: Identity | undefined;
  myName: string;
  autocrypt: string | null;
};

/** The mail from the form; a draft keeps its pictures as they are (composer-images.tsx). */
export const outgoingMail = (input: OutgoingInput, { draft = false } = {}) => {
  const { state, identity } = input;
  const { html, images } = input.pics.outgoing(input.editor?.getHTML() ?? "", { draft });
  return {
    accountId: input.sendAccountId,
    identity:
      input.sendAccountId === input.ownId
        ? identity!
        : { ...identity!, name: sharedSenderName(input.myName, identity!.name) },
    to: state.to,
    cc: state.cc,
    bcc: state.bcc,
    replyTo: state.replyTo,
    subject: state.subject.trim(),
    html,
    text: htmlToText(html),
    attachments: state.attachments,
    images,
    inReplyTo: state.threading.inReplyTo,
    references: state.threading.references,
    draftId: draftSwap(state.savedDraft.current, input.sendAccountId).replaces,
    requestReceipt: state.receipt,
    requestDelivery: state.delivery,
    autocrypt: input.autocrypt,
  };
};

export type OutgoingMail = ReturnType<typeof outgoingMail>;

type FilesInput = {
  state: ComposerState;
  pics: Pictures;
  held: HeldFiles;
  client: JmapClient;
  queryClient: QueryClient;
  onError: (message: string) => void;
};

/** Placing, releasing and encrypting the files of the mail. */
export const useComposerFiles = ({
  state,
  pics,
  held,
  client,
  queryClient,
  onError,
}: FilesInput) => {
  /**
   * A new file: uploaded, or kept in the browser for an encrypted mail (within its limit).
   * `alongside`: the sizes of the files placed before it from the same choice, which this
   * render's attachments do not show yet.
   */
  const place = (file: File, alongside: number[] = []) => {
    const sizes = [
      ...[...state.attachments, ...pics.images, file].map((each) => each.size),
      ...alongside,
    ];
    if (state.encrypt && !fitsEncrypted(sizes)) {
      throw new Error(m.mail_encrypted_too_large({ size: formatSize(HELD_LIMIT) }));
    }
    return held.place(file, state.encrypt);
  };

  /** The form told the blobs its files now have. */
  const takeBlobs = (map: Map<string, string>) => {
    state.setAttachments((current) => current.map(withSavedBlob(map)));
    pics.setImages((current) => current.map(withSavedBlob(map)));
  };

  /** The mail with the files kept in the browser uploaded, and the form told their blobs. */
  const released = async <T extends OutgoingMail>(mail: T): Promise<T> => {
    const { map, mail: done } = await held.release(mail);
    if (map.size) takeBlobs(map);
    return done;
  };

  /**
   * "Vertraulich senden" on: files that went to Stalwart already come into the browser, and the
   * draft that held them (and the text) unencrypted goes; an encrypted mail is no draft.
   */
  const switchEncrypt = async (on: boolean) => {
    if (!on) return state.setEncrypt(false);
    const files = [...state.attachments, ...pics.images];
    if (!fitsEncrypted(files.map((file) => file.size))) {
      onError(m.mail_encrypted_too_large({ size: formatSize(HELD_LIMIT) }));
      return;
    }
    state.setEncrypt(true);
    state.setUploading((n) => n + 1);
    try {
      if (state.saving.current) await state.saving.current;
      takeBlobs(await held.pull(files));
      const saved = state.savedDraft.current;
      if (saved) {
        await removeDraft(client, saved);
        state.savedDraft.current = null;
        state.setSavedAt(null);
        void queryClient.invalidateQueries({ queryKey: [saved.accountId, "emails"] });
      }
    } catch (error) {
      state.setEncrypt(false);
      onError(m.common_error({ message: (error as Error).message }));
    } finally {
      state.setUploading((n) => n - 1);
    }
  };

  const upload = async (files: FileList | File[] | null) => {
    if (!files) return;
    const placed: number[] = [];
    for (const file of Array.from(files)) {
      state.setUploading((n) => n + 1);
      try {
        const attachment = await place(file, placed);
        placed.push(attachment.size);
        state.setAttachments((current) => [...current, attachment]);
      } catch (error) {
        onError(m.common_error({ message: (error as Error).message }));
      } finally {
        state.setUploading((n) => n - 1);
      }
    }
  };

  return { place, released, switchEncrypt, upload };
};

/**
 * Files shared from another app become attachments once the form is filled (which sets the
 * attachments of a new mail to none) and the sender is known.
 */
export const useSharedFiles = (
  state: ComposerState,
  prefill: ComposePrefill | undefined,
  sendAccountId: string,
  upload: (files: File[]) => Promise<void>,
) => {
  const sharedUploaded = useRef(false);
  useEffect(() => {
    if (sharedUploaded.current || !state.initialized.current || !prefill?.files?.length) return;
    if (!sendAccountId) return;
    sharedUploaded.current = true;
    void upload(prefill.files);
  });
};
