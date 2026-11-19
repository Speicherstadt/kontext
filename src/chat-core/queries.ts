/**
 * The team chat from Kontext's server (/api/chat). The live connection (features/live) keeps
 * these caches current; what one writes shows at once and is replaced by the server's answer.
 */
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { ChannelSummary, Message } from "@/lib/chat";
import type { Card, ChatFile } from "@/lib/chat-cards";

export const CHAT_KEY = ["chat"];
export const CHANNELS_KEY = ["chat", "channels"];
export const DISCUSSED_KEY = ["chat", "discussed"];
export const messagesKey = (channelId: string) => ["chat", "messages", channelId];
/** The first message of a thread and its answers. */
export const threadKey = (parentId: string) => ["chat", "thread", parentId];
export type Thread = { message: Message; replies: Message[] };

/** The id prefix of a message shown before the server has it. */
export const PENDING = "pending-";

/** Shown before the server has it. */
export const isPending = (message: Message) => message.id.startsWith(PENDING);

/** A message to send; `files` are already uploaded. */
export type Post = {
  channelId: string;
  /** An answer in the thread of this message. */
  parentId?: string | null;
  /** For an answer: shown in the channel too. */
  alsoInChannel?: boolean;
  text: string;
  mentions: string[];
  cards: Card[];
  files: ChatFile[];
};

export type Discussion = {
  channelId: string;
  messageId: string;
  createdAt: string;
  replies: number;
};

/** Where a mail (or its thread) was discussed, in channels one sees; the latest first. */
export const useDiscussions = (ref: string, threadId: string | null) =>
  useQuery({
    queryKey: [...DISCUSSED_KEY, ref, threadId],
    queryFn: async () =>
      (
        await send<{ discussions: Discussion[] }>(
          "GET",
          `/discussed?ref=${encodeURIComponent(ref)}&thread=${encodeURIComponent(threadId ?? "")}`,
        )
      ).discussions,
  }).data ?? [];

/** Messages with these words in all channels one sees (from two letters on). */
export const useChatSearch = (words: string) =>
  useQuery({
    queryKey: ["chat", "search", words],
    queryFn: async () =>
      (await send<{ messages: Message[] }>("GET", `/search?q=${encodeURIComponent(words)}`))
        .messages,
    enabled: words.trim().length >= 2,
    staleTime: 10_000,
  });

/** Channels where mails of this sender were discussed before. */
export const useSuggestions = (party: string) =>
  useQuery({
    queryKey: ["chat", "suggestions", party],
    queryFn: async () =>
      (
        await send<{ channelIds: string[] }>(
          "GET",
          `/suggestions?party=${encodeURIComponent(party)}`,
        )
      ).channelIds,
    enabled: Boolean(party),
  }).data ?? [];

export type ChannelsData = {
  channels: ChannelSummary[];
  online: string[];
  /** How long the company keeps messages, in days; 0: for ever. */
  retentionDays?: number;
};
export type MessagePage = { messages: Message[]; hasMore: boolean; reads: Record<string, string> };
export type Messages = InfiniteData<MessagePage, string | null>;

export const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/chat${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const channelPath = (id: string) => `/channels/${encodeURIComponent(id)}`;

export const useChannels = () => {
  const { data, isPending } = useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: () => send<ChannelsData>("GET", "/channels"),
  });
  return {
    channels: data?.channels ?? [],
    online: data?.online ?? [],
    retentionDays: data?.retentionDays ?? 0,
    isPending,
  };
};

/** The messages of a channel, oldest first; older ones page in with `loadOlder`. */
export const useMessages = (channelId: string) => {
  const query = useInfiniteQuery({
    queryKey: messagesKey(channelId),
    queryFn: ({ pageParam }) =>
      send<MessagePage>(
        "GET",
        `${channelPath(channelId)}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? (page.messages.at(-1)?.createdAt ?? null) : null),
  });
  const pages = query.data?.pages ?? [];
  return {
    messages: pages.flatMap((page) => page.messages).reverse(),
    reads: pages[0]?.reads ?? {},
    isPending: query.isPending,
    hasOlder: query.hasNextPage,
    loadOlder: () => void query.fetchNextPage(),
    loadingOlder: query.isFetchingNextPage,
  };
};

/**
 * Whether `old` gives way to `message`: the same message, the one it `replaces`, or its pending
 * copy, matched by author and text, since the live event may come before the answer that names
 * the pending id.
 */
const givesWay = (old: Message, message: Message, replaces?: string) =>
  old.id === message.id ||
  old.id === replaces ||
  (isPending(old) &&
    !isPending(message) &&
    old.authorId === message.authorId &&
    old.text === message.text);

/**
 * Puts a message where it shows, once (the live event and the answer may both come): an answer
 * into its thread (and the channel's first page too when it is shown there), any other into the cached first page of its channel and, when its thread is
 * open, as the thread's first message.
 */
export const addMessage = (queryClient: QueryClient, message: Message, replaces?: string) => {
  if (message.parentId) {
    queryClient.setQueryData<Thread>(threadKey(message.parentId), (data) =>
      data
        ? {
            ...data,
            replies: [...data.replies.filter((m) => !givesWay(m, message, replaces)), message].sort(
              (a, b) => a.createdAt.localeCompare(b.createdAt),
            ),
          }
        : data,
    );
    if (message.alsoInChannel) addToChannel(queryClient, message, replaces);
    return;
  }
  queryClient.setQueryData<Thread>(threadKey(message.id), (data) =>
    data ? { ...data, message } : data,
  );
  addToChannel(queryClient, message, replaces);
};

const addToChannel = (queryClient: QueryClient, message: Message, replaces?: string) =>
  queryClient.setQueryData<Messages>(messagesKey(message.channelId), (data) => {
    if (!data) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    const others = first.messages.filter((m) => !givesWay(m, message, replaces));
    const messages = [message, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ...data, pages: [{ ...first, messages }, ...rest] };
  });

export const setRead = (
  queryClient: QueryClient,
  channelId: string,
  memberId: string,
  at: string,
) =>
  queryClient.setQueryData<Messages>(messagesKey(channelId), (data) => {
    const [first, ...rest] = data?.pages ?? [];
    if (!data || !first) return data;
    if ((first.reads[memberId] ?? "") >= at) return data;
    return { ...data, pages: [{ ...first, reads: { ...first.reads, [memberId]: at } }, ...rest] };
  });
