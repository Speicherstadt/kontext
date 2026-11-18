/** The parts of a mail's line in the list (message-row.tsx): the box to pick, the top line, the marks. */
import {
  AlarmClock,
  CalendarClock,
  CornerUpLeft,
  ListChecks,
  LockKeyhole,
  Paperclip,
  Star,
  Users,
} from "lucide-react";
import { Highlighted } from "@/components/highlighted";
import { Avatar } from "@/components/ui/avatar";
import { isFlagged } from "@/jmap/mail";
import type { Category } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { listDate } from "@/lib/format";
import { encryptedPreview } from "@/lib/pgp-mail";
import { sendTimeLabel } from "@/lib/schedule";
import { m } from "@/paraglide/messages";
import { CategoryChips } from "../categories/category-chips";
import { AssignmentChip } from "./assignment";
import { ExternalMark } from "./external-mark";
import type { Row } from "./list-frame";
import type { Answer, Group } from "./use-thread-info";

/**
 * Its own column the height of the line, beside the link: a click a bit off the box still picks and
 * never opens the mail. It shows the picture until the box is wanted.
 */
export const PickColumn = ({
  boxShown,
  selected,
  subject,
  face,
  onPick,
}: {
  boxShown: boolean;
  selected: boolean;
  subject: string | null;
  face: { name: string; photo: string | undefined };
  onPick: (shift: boolean) => void;
}) => (
  // A click on the box itself bubbles here too; a label would not hand on a Shift-click
  // beside the box to it.
  // biome-ignore lint/a11y/noStaticElementInteractions: the checkbox inside is the control
  // biome-ignore lint/a11y/useKeyWithClickEvents: Space on the checkbox clicks it, which bubbles here
  <div
    onClick={(event) => onPick(event.shiftKey)}
    className="relative w-10 shrink-0 cursor-pointer pt-3 pl-2"
  >
    {boxShown ? null : (
      <Avatar
        name={face.name}
        photo={face.photo}
        size={28}
        // Not in the way of a click: the box below it takes it, the column the rest.
        className="pointer-events-none absolute top-3 left-2 group-hover:opacity-0 group-has-[:focus-visible]:opacity-0"
      />
    )}
    <input
      type="checkbox"
      checked={selected}
      readOnly
      aria-label={m.mail_select({ subject: subject || m.mail_no_subject() })}
      className={cn(
        // In the middle of the picture's place.
        "mt-1.5 ml-1.5 block size-4 cursor-pointer accent-[var(--primary)]",
        // Under the picture, still there for the keyboard; shown on hover and focus.
        !boxShown && "opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100",
      )}
    />
  </div>
);

/** Who, how many in the conversation, the flag and the date. */
export const TopLine = ({
  row,
  who,
  unread,
  group,
}: {
  row: Row;
  who: string;
  unread: boolean;
  group?: Group;
}) => (
  <span className="flex items-baseline gap-2">
    <span className={cn("min-w-0 flex-1 truncate", unread && "font-semibold")}>
      {unread ? (
        <span
          aria-hidden="true"
          className="mr-1.5 mb-px inline-block size-1.5 rounded-full bg-accent align-middle"
        />
      ) : null}
      <Highlighted text={who || "—"} terms={row.highlight} />
      {group && group.count > 1 ? (
        <>
          <span aria-hidden="true" className="ml-1.5 font-mono text-[12px] font-normal text-muted">
            {group.count}
          </span>
          <span className="sr-only">, {m.mail_thread_count({ count: group.count })}</span>
        </>
      ) : null}
    </span>
    {isFlagged(row.email) ? (
      <Star size={12} className="shrink-0 fill-warn text-warn" aria-label={m.mail_flagged()} />
    ) : null}
    <span className="shrink-0 font-mono text-[12px] text-muted">
      {listDate(row.email.receivedAt, new Date())}
    </span>
  </span>
);

const PILL =
  "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium";

/** Where it is and whose: the folder (search) and the account's badge (combined lists). */
const Place = ({ row }: { row: Row }) => (
  <>
    {row.folder ? (
      <span className="shrink-0 rounded-md border border-border px-1.5 text-[11px] text-muted">
        {row.folder}
      </span>
    ) : null}
    {row.account?.label ? (
      <span
        title={row.account.title}
        className="flex min-w-0 items-center gap-1 rounded-md bg-subtle px-1.5 text-[11px] font-medium text-muted"
      >
        <Users size={12} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{row.account.label}</span>
      </span>
    ) : null}
  </>
);

/** Held to go out later, or on Wiedervorlage. */
const Timing = ({ sendAt, snoozedUntil }: Pick<Row, "sendAt" | "snoozedUntil">) => (
  <>
    {sendAt ? (
      <span className={cn(PILL, "bg-warn/10 text-warn")}>
        <CalendarClock size={12} aria-hidden="true" />
        {m.mail_scheduled_at({ when: sendTimeLabel(new Date(sendAt)) })}
      </span>
    ) : null}
    {snoozedUntil ? (
      <span className={cn(PILL, "bg-accent/10 text-accent-ink")}>
        <AlarmClock size={12} aria-hidden="true" />
        {Date.parse(snoozedUntil) <= Date.now()
          ? m.mail_snoozed_soon()
          : m.mail_snoozed_until({ when: sendTimeLabel(new Date(snoozedUntil)) })}
      </span>
    ) : null}
  </>
);

/** Answered, and in a shared mailbox by whom. */
const Answered = ({ answer, shared }: { answer?: Answer; shared: boolean }) => (
  <span
    title={
      answer
        ? m.mail_answered_by({ name: answer.name, when: listDate(answer.at, new Date()) })
        : m.mail_answered()
    }
    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted"
  >
    <CornerUpLeft size={12} aria-label={m.mail_answered()} />
    {shared && answer ? `${answer.name.split(" ")[0]} · ${listDate(answer.at, new Date())}` : null}
  </span>
);

/** The preview, or for an encrypted mail the lock and, once opened here, its real start. */
const Preview = ({ row, openedPreview }: { row: Row; openedPreview?: string | null }) => {
  const { email, highlight } = row;
  if (encryptedPreview(email.preview, email["header:Content-Type"]))
    return (
      <>
        <span className="flex shrink-0 items-center gap-1 text-accent">
          <LockKeyhole size={12} aria-hidden="true" /> {m.pgp_encrypted()}
        </span>
        {openedPreview ? <span className="truncate">{openedPreview}</span> : null}
      </>
    );
  return (
    <>
      {email.hasAttachment ? (
        <Paperclip size={12} className="shrink-0" aria-label={m.mail_attachments()} />
      ) : null}
      <span className="truncate">
        <Highlighted text={email.preview} terms={highlight} />
      </span>
    </>
  );
};

/** The third line: place, timing, answered, task, categories and the preview. */
export const MarksLine = ({
  row,
  answer,
  shared,
  hasTask,
  categories,
  openedPreview,
}: {
  row: Row;
  answer?: Answer;
  shared: boolean;
  hasTask: boolean;
  categories: Category[];
  openedPreview?: string | null;
}) => (
  <span className="flex items-center gap-1.5 text-[13px] text-muted">
    <Place row={row} />
    <ExternalMark address={row.email.from?.[0]?.email} />
    <Timing sendAt={row.sendAt} snoozedUntil={row.snoozedUntil} />
    {row.email.keywords.$answered ? <Answered answer={answer} shared={shared} /> : null}
    {hasTask ? (
      <span className={cn(PILL, "bg-accent/10 text-accent-ink")}>
        <ListChecks size={12} aria-hidden="true" />
        {m.tasks_from_mail()}
      </span>
    ) : null}
    {row.inAttachment ? (
      <span className={cn(PILL, "bg-accent/10 text-accent-ink")}>
        <Paperclip size={12} aria-hidden="true" />
        {m.search_in_attachment()}
      </span>
    ) : null}
    {shared ? <AssignmentChip email={row.email} compact /> : null}
    <CategoryChips categories={categories} max={2} />
    <Preview row={row} openedPreview={openedPreview} />
  </span>
);
