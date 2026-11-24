/**
 * In a mail the server still holds: when it goes out – or, past that, that it is on its way or
 * waits for the receiving server – and "Nicht senden" to get it back.
 */
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNow } from "@/features/notifications/feed";
import { heldState } from "@/jmap/submissions";
import { findRole } from "@/lib/mailboxes";
import { sendTimeLabel } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { useHeldMails, useMailboxes } from "./queries";
import { useTakeBack } from "./take-back";

export const ScheduledNotice = ({ accountId, emailId }: { accountId: string; emailId: string }) => {
  const held = useHeldMails(accountId).find((mail) => mail.emailId === emailId);
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const drafts = findRole(mailboxes, "drafts");
  const takeBack = useTakeBack();
  const now = useNow();
  if (!held || !drafts) return null;
  const state = heldState(held, now);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-[14px]">
      <CalendarClock size={16} className="shrink-0 text-warn" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>
          {state === "scheduled"
            ? m.mail_scheduled_notice({ when: sendTimeLabel(new Date(held.sendAt)) })
            : state === "delayed"
              ? m.mail_delivery_delayed()
              : m.mail_delivery_sending()}
        </span>
        {state === "delayed" ? (
          <span className="break-words text-[12px] text-muted">{held.delay}</span>
        ) : null}
      </span>
      <Button size="sm" onClick={() => void takeBack(accountId, held, drafts.id)}>
        {m.mail_unsend()}
      </Button>
    </div>
  );
};
