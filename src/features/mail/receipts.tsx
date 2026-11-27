/**
 * Read receipts: the line at a mail whose sender asks for one ("Senden" / "Nicht senden"), and at
 * a mail one sent with the request, who has confirmed it (src/lib/mdn.ts, src/jmap/receipts.ts).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { setKeyword } from "@/jmap/mail";
import { receiptsFor, sendReceipt } from "@/jmap/receipts";
import type { EmailDetail } from "@/jmap/types";
import { displayName, noteDate } from "@/lib/format";
import { MDN_SENT, receiptAnswered, receiptText } from "@/lib/mdn";
import { useSendAccount } from "@/mail-core/use-send-account";
import { m } from "@/paraglide/messages";

const line =
  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-[13px]";

/** At a mail whose sender asks for a receipt, until it is sent or declined. */
export const ReceiptRequest = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const send = useSendAccount(accountId);
  const [busy, setBusy] = useState(false);
  const asker = email.receiptTo?.[0];
  const own = send.identities.map((identity) => identity.email.toLowerCase());
  if (
    !asker ||
    receiptAnswered(email.keywords) ||
    own.includes(asker.email.toLowerCase()) ||
    send.sendAccountId !== accountId ||
    send.account?.isReadOnly
  ) {
    return null;
  }

  const answer = async (confirm: boolean) => {
    setBusy(true);
    try {
      if (confirm) {
        const to = [...(email.to ?? []), ...(email.cc ?? [])].map((a) => a.email.toLowerCase());
        const identity =
          send.identities.find((candidate) => to.includes(candidate.email.toLowerCase())) ??
          send.identities[0];
        if (!identity) throw new Error(m.mail_receipt_failed());
        await sendReceipt(client, accountId, identity.id, email.id, {
          subject: `Gelesen: ${email.subject ?? ""}`,
          textBody: receiptText({
            from: { name: identity.name || null, email: identity.email },
            original: {
              subject: email.subject ?? "",
              sentAt: email.sentAt ?? email.receivedAt,
            },
          }),
        });
      } else {
        // Abgelehnt zählt ebenfalls als beantwortet: niemand wird ein zweites Mal gefragt.
        await setKeyword(client, accountId, [email.id], MDN_SENT, true);
      }
      await queryClient.invalidateQueries({ queryKey: [accountId] });
      if (confirm) toast.show(m.mail_receipt_sent({ name: displayName(asker) }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const button = "text-[12px] font-medium underline-offset-2 hover:underline disabled:opacity-50";
  return (
    <div role="note" className={line}>
      <MailCheck size={16} className="text-accent" aria-hidden="true" />
      <span className="flex-1">{m.mail_receipt_asked({ name: displayName(asker) })}</span>
      <button type="button" className={button} disabled={busy} onClick={() => void answer(true)}>
        {m.mail_receipt_send()}
      </button>
      <button
        type="button"
        className={`${button} text-muted`}
        disabled={busy}
        onClick={() => void answer(false)}
      >
        {m.mail_receipt_decline()}
      </button>
    </div>
  );
};

/** At a mail one sent asking for receipts: who confirmed it, and when. */
export const ReceiptsReceived = ({
  accountId,
  email,
}: {
  accountId: string;
  email: EmailDetail;
}) => {
  const client = useClient();
  const messageId = email.messageId?.[0];
  const asked = Boolean(email.receiptTo?.length && messageId);
  const { data = [] } = useQuery({
    // Under the account: a receipt arriving refreshes it.
    queryKey: [accountId, "emails", "receipts", messageId],
    queryFn: () =>
      receiptsFor(client, accountId, {
        messageId: messageId!,
        subject: email.subject ?? "",
        sentAt: email.sentAt ?? email.receivedAt,
        recipients: [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])].map(
          (address) => address.email,
        ),
      }),
    enabled: asked,
  });
  if (!asked) return null;
  return (
    <div role="note" className={line}>
      <MailCheck size={16} className={data.length ? "text-ok" : "text-muted"} aria-hidden="true" />
      <span className="text-muted">
        {data.length
          ? data
              .map((receipt) =>
                m.mail_receipt_by({
                  name: displayName(receipt.from?.[0]),
                  when: noteDate(receipt.receivedAt),
                }),
              )
              .join(" · ")
          : m.mail_receipt_waiting()}
      </span>
    </div>
  );
};
