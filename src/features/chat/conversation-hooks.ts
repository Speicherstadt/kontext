/**
 * The effects of a conversation (conversation.tsx): marking what one sees as read, keeping the
 * place in the history, and showing a message asked for in the URL.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChannelSummary } from "@/lib/chat";
import type { useChatActions } from "./actions";
import { useScrollPlace } from "./use-scroll-place";

/** Marks the newest message or answer as read, whenever the tab is visible. */
export const useMarkRead = (
  channel: ChannelSummary,
  newest: string | undefined,
  actions: ReturnType<typeof useChatActions>,
) => {
  const markRead = actions.markRead.mutate;
  useEffect(() => {
    if (!newest) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      if (channel.readAt && channel.readAt >= newest) return;
      markRead({ channelId: channel.id, at: newest });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [newest, channel.id, channel.readAt, markRead]);
};

/** Stays at the bottom while one is there; keeps the place when older messages come in above. */
export const useKeepScrollPlace = (count: number, loadOlder: () => void) => {
  const { scroller, atBottom, toBottom, scrollProps } = useScrollPlace();
  const heightBefore = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || count === 0) return;
    if (heightBefore.current !== null) {
      element.scrollTop += element.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    } else if (atBottom.current) {
      toBottom();
    }
  }, [count, scroller, atBottom, toBottom]);
  const older = () => {
    heightBefore.current = scroller.current?.scrollHeight ?? null;
    loadOlder();
  };
  return { scroller, atBottom, scrollProps, older };
};

/** A message asked for in the URL: loads older pages until it is there, then shows and marks it. */
export const useShowMessage = (
  messageId: string | undefined,
  {
    scroller,
    atBottom,
    loading,
    canLoadOlder,
    older,
  }: {
    scroller: RefObject<HTMLElement | null>;
    atBottom: { current: boolean };
    loading: boolean;
    canLoadOlder: boolean;
    older: () => void;
  },
) => {
  const [highlight, setHighlight] = useState<string>();
  const shown = useRef<string | null>(null);
  const pagesLoaded = useRef(0);
  useEffect(() => {
    if (!messageId || shown.current === messageId || loading) return;
    const element = scroller.current?.querySelector(`[data-message="${CSS.escape(messageId)}"]`);
    if (element) {
      shown.current = messageId;
      atBottom.current = false;
      element.scrollIntoView({ block: "center" });
      setHighlight(messageId);
      const fade = setTimeout(() => setHighlight(undefined), 2500);
      return () => clearTimeout(fade);
    }
    // At most ten pages back; a removed message is not searched for in the whole history.
    if (canLoadOlder && pagesLoaded.current < 10) {
      pagesLoaded.current += 1;
      older();
    }
  });
  return highlight;
};
