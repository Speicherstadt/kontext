/** The state of the mail being written: its fields, the files, the draft and the send in progress. */
import { useRef, useState } from "react";
import type { OutgoingAttachment } from "@/jmap/mail";
import type { EmailAddress } from "@/jmap/types";
import type { ComposeMode } from "@/lib/compose";

/** Sender, recipients and subject. */
const useAddressFields = () => {
  const [identityId, setIdentityId] = useState<string>("");
  const [to, setTo] = useState<EmailAddress[]>([]);
  const [cc, setCc] = useState<EmailAddress[]>([]);
  const [bcc, setBcc] = useState<EmailAddress[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [replyTo, setReplyTo] = useState<EmailAddress[]>([]);
  const [showReplyTo, setShowReplyTo] = useState(false);
  const [subject, setSubject] = useState("");
  return {
    identityId,
    setIdentityId,
    to,
    setTo,
    cc,
    setCc,
    bcc,
    setBcc,
    showCopies,
    setShowCopies,
    replyTo,
    setReplyTo,
    showReplyTo,
    setShowReplyTo,
    subject,
    setSubject,
  };
};

export const useComposerState = (mode: ComposeMode, sourceEmailId: string | undefined) => {
  const fields = useAddressFields();
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  // "Vertraulich senden": the files then stay in the browser until they are encrypted.
  const [encrypt, setEncrypt] = useState(false);
  // Signed, not encrypted (an encrypted mail is signed anyway).
  const [sign, setSign] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [sending, setSending] = useState(false);
  // "Anhang vergessen?": the word that asked, and when the mail was to go (now or later).
  const [forgotten, setForgotten] = useState<{ word: string; later?: Date } | null>(null);
  // A ref, not state: a send that waited for a running autosave must replace the draft that
  // save just wrote, not the one from before it.
  const draftId = useRef<string | null>(mode === "draft" ? (sourceEmailId ?? null) : null);
  const [threading, setThreading] = useState<{
    inReplyTo: string[] | null;
    references: string[] | null;
  }>({
    inReplyTo: null,
    references: null,
  });
  /** Bumped on every change; the autosave runs a moment after the last one. */
  const [changes, setChanges] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const initialized = useRef(false);
  // Set once the form is left (composer-draft.ts).
  const left = useRef(false);
  return {
    ...fields,
    attachments,
    setAttachments,
    uploading,
    setUploading,
    encrypt,
    setEncrypt,
    sign,
    setSign,
    receipt,
    setReceipt,
    delivery,
    setDelivery,
    sending,
    setSending,
    forgotten,
    setForgotten,
    draftId,
    threading,
    setThreading,
    changes,
    setChanges,
    savedAt,
    setSavedAt,
    saving,
    initialized,
    left,
  };
};

export type ComposerState = ReturnType<typeof useComposerState>;
