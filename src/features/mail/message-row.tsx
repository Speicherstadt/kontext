/**
 * One mail in the list: who, when, subject, categories, preview; and its picture, which turns into
 * the box to pick it on hover, on keyboard focus and while picking (like Gmail). Picking
 * also works with Shift/Ctrl on the line and, on phones, by a long press. On phones the line can
 * be swiped to the left or right (what that does is set per device).
 */
import { Link, useParams } from "@tanstack/react-router";
import type { MouseEvent, PointerEvent } from "react";
import { Highlighted } from "@/components/highlighted";
import { useLongPress } from "@/components/use-long-press";
import { useMediaQuery } from "@/components/use-media-query";
import { useSwipe } from "@/components/use-swipe";
import { isFlagged, isUnread } from "@/jmap/mail";
import type { EmailSummary } from "@/jmap/types";
import { categoriesOn } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { displayName, formatAddressList } from "@/lib/format";
import type { PhotoKey } from "@/lib/photo";
import { rowFace } from "@/lib/row-face";
import { rowClick } from "@/lib/selection";
import { directionOf, type SwipeAction } from "@/lib/swipe";
import { tasksOfMail } from "@/lib/tasks";
import { useOpenedPreview, useShownSubject } from "@/mail-core/opened-mails";
import { useSwipeSettings } from "@/mail-core/swipe-settings";
import { m } from "@/paraglide/messages";
import { useCategoryMap } from "../categories/queries";
import { useTasks } from "../tasks/queries";
import type { Row } from "./list-frame";
import { type DraggedMail, startMailDrag } from "./mail-drag";
import { MarksLine, PickColumn, TopLine } from "./message-row-parts";
import { SwipeBackdrop } from "./swipe-backdrop";
import type { Answer, Group } from "./use-thread-info";

type Props = {
  row: Row;
  active: boolean;
  showRecipient: boolean;
  /** A draft opens in the composer to be finished. */
  isDraft: boolean;
  drag: DraggedMail | undefined;
  /** Some mail is picked (or the phone's "Auswählen" is on): every row shows its box, and on a
   *  phone a tap on the line picks. */
  selecting: boolean;
  selected: boolean;
  /** Picks or drops the mail; with Shift, the range up to the last one picked. */
  onPick: (shift: boolean) => void;
  /** Who answered it and when (undefined: not answered, or not known yet). */
  answer?: Answer;
  /** In a shared mailbox the answer names the colleague. */
  shared?: boolean;
  /** Grouped as conversations: the conversation this line stands for. */
  group?: Group;
  /** The photo of a person (features/photos `usePhotoOf`), found once for the whole list. */
  photoOf: (person: PhotoKey) => string | undefined;
  /** A swipe on the phone let go far enough. */
  onSwipe: (action: SwipeAction) => void;
};

/**
 * Click, long press and swipe on the line: a click opens (or picks, with Shift/Ctrl or while
 * picking on a phone), a long press picks, a swipe does what is set for its side.
 */
const useRowGestures = (selecting: boolean, onPick: Props["onPick"], onSwipe: Props["onSwipe"]) => {
  const phone = !useMediaQuery("(min-width: 768px)");
  const swipes = useSwipeSettings();
  const swipe = useSwipe(swipes, onSwipe);
  // A long press picks the mail; the finger sliding on afterwards is no swipe any more.
  const pickByPress = useLongPress(() => {
    swipe.handlers.onPointerCancel();
    onPick(false);
  });
  const onClick = (event: MouseEvent) => {
    // Both are asked, so neither keeps a stale "swallow the next click". Only a finger's click
    // ends a press or a swipe: after a drag the browser sends none, and Enter (detail 0) must
    // still open the line.
    const pressed = pickByPress.consumeClick();
    const swiped = swipe.consumeClick();
    if ((swiped || pressed) && event.detail > 0) return event.preventDefault();
    const does = rowClick({
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
      picking: selecting,
      phone,
    });
    if (does === "open") return;
    event.preventDefault();
    onPick(does === "range");
  };
  const handlers = {
    ...pickByPress.handlers,
    onClick,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      pickByPress.handlers.onPointerDown(event);
      swipe.handlers.onPointerDown(event);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      pickByPress.handlers.onPointerMove(event);
      swipe.handlers.onPointerMove(event);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      pickByPress.handlers.onPointerUp();
      swipe.handlers.onPointerUp(event);
    },
    onPointerCancel: () => {
      pickByPress.handlers.onPointerCancel();
      swipe.handlers.onPointerCancel();
    },
  };
  return { phone, swipes, offset: swipe.offset, handlers };
};

/** The categories of the mail and an open task made from it. */
const useRowExtras = (email: EmailSummary, accountId: string | undefined) => {
  // Combined lists name each row's account; a folder's list is the route's account.
  const routeAccount = useParams({ strict: false }).accountId;
  const categories = categoriesOn(
    email.keywords,
    useCategoryMap()[accountId ?? routeAccount ?? ""] ?? [],
  );
  const task = tasksOfMail(useTasks().tasks, email.id, email.threadId).find(
    (candidate) => candidate.status !== "done",
  );
  return { categories, hasTask: Boolean(task) };
};

export const MessageRow = ({
  row,
  active,
  showRecipient,
  isDraft,
  drag,
  selecting,
  selected,
  onPick,
  answer,
  shared = false,
  group,
  photoOf,
  onSwipe,
}: Props) => {
  const { email, account } = row;
  const unread = group ? group.unread : isUnread(email);
  const subject = useShownSubject(email);
  const openedPreview = useOpenedPreview(email.id);
  const { categories, hasTask } = useRowExtras(email, account?.id);
  const who = showRecipient
    ? formatAddressList(email.to)
    : group && group.count > 1
      ? group.names.map((name) => name.split(" ")[0]).join(", ")
      : displayName(email.from?.[0]);
  const face = rowFace(email, { showRecipient, latest: group?.latest });
  const boxShown = selecting || selected;
  const { phone, swipes, offset, handlers } = useRowGestures(selecting, onPick, onSwipe);
  return (
    <div className="relative overflow-hidden rounded-[10px]">
      {offset ? (
        <SwipeBackdrop
          action={swipes[directionOf(offset)]}
          side={directionOf(offset)}
          unread={unread}
          flagged={isFlagged(email)}
        />
      ) : null}
      <div
        className={cn(
          "group relative flex rounded-[10px] hover:bg-hover",
          active && "bg-subtle",
          selected && "bg-accent/8",
          offset !== 0 && "bg-bg",
        )}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      >
        <PickColumn
          boxShown={boxShown}
          selected={selected}
          subject={subject}
          face={{ name: face.name, photo: photoOf(face.photo) }}
          onPick={onPick}
        />
        <Link
          to="."
          search={(prev) => ({
            ...prev,
            email: email.id,
            account: account?.id,
            compose: isDraft ? "draft" : undefined,
          })}
          aria-current={active ? "true" : undefined}
          draggable={drag && !phone ? true : undefined}
          onDragStart={
            drag && !phone
              ? (event) => startMailDrag(event, drag)
              : (event) => event.preventDefault()
          }
          {...handlers}
          className="flex min-w-0 flex-1 touch-pan-y py-3 pr-3 pl-2 text-left text-fg no-underline [-webkit-touch-callout:none]"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <TopLine row={row} who={who} unread={unread} group={group} />
            <span className={cn("truncate", unread && "font-semibold")}>
              <Highlighted text={subject || m.mail_no_subject()} terms={row.highlight} />
            </span>
            <MarksLine
              row={row}
              answer={answer}
              shared={shared}
              hasTask={hasTask}
              categories={categories}
              openedPreview={openedPreview}
            />
          </span>
        </Link>
      </div>
    </div>
  );
};
