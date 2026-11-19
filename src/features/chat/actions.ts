/** Chat actions: post, edit, delete, react, read and the channel changes, with optimistic updates. */
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  addMessage,
  CHANNELS_KEY,
  type ChannelsData,
  channelPath,
  messagesKey,
  PENDING,
  type Post,
  send,
  setRead,
  threadKey,
} from "@/chat-core/queries";
import type { Channel, ChannelSummary, Message } from "@/lib/chat";
import type { ChatFile } from "@/lib/chat-cards";

const patchChannel = (
  queryClient: QueryClient,
  channelId: string,
  change: (channel: ChannelSummary) => ChannelSummary,
) =>
  queryClient.setQueryData<ChannelsData>(CHANNELS_KEY, (data) =>
    data
      ? {
          ...data,
          channels: data.channels.map((channel) =>
            channel.id === channelId ? change(channel) : channel,
          ),
        }
      : data,
  );

export const useChatActions = (me: string) => {
  const queryClient = useQueryClient();
  const refreshChannels = () => queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });

  /** A confidential channel's text goes encrypted (src/features/chat/confidential.tsx). */
  const textFor = async (channelId: string, text: string, files: ChatFile[] = []) => {
    const channel = queryClient
      .getQueryData<ChannelsData>(CHANNELS_KEY)
      ?.channels.find((candidate) => candidate.id === channelId);
    if (!channel?.confidential) return text;
    const { sealText } = await import("./confidential");
    return sealText(queryClient, channelId, text, files);
  };

  const post = useMutation({
    mutationFn: async ({ channelId, files, parentId = null, ...body }: Post) =>
      (
        await send<{ message: Message }>("POST", `${channelPath(channelId)}/messages`, {
          ...body,
          text: await textFor(channelId, body.text, files),
          parentId,
          fileIds: files.map((file) => file.id),
        })
      ).message,
    onMutate: ({
      channelId,
      parentId = null,
      alsoInChannel = false,
      text,
      mentions,
      cards,
      files,
    }) => {
      const pending: Message = {
        id: `${PENDING}${crypto.randomUUID()}`,
        channelId,
        authorId: me,
        text,
        mentions,
        files,
        cards,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        parentId,
        alsoInChannel: Boolean(parentId && alsoInChannel),
        reactions: [],
        replies: null,
        call: null,
      };
      addMessage(queryClient, pending);
      return { pending };
    },
    onSuccess: (message, _input, context) => {
      addMessage(queryClient, message, context?.pending.id);
      setRead(queryClient, message.channelId, me, message.createdAt);
    },
    onError: (_error, input, context) => {
      if (context) {
        void queryClient.invalidateQueries({
          queryKey: input.parentId ? threadKey(input.parentId) : messagesKey(input.channelId),
        });
      }
    },
    onSettled: refreshChannels,
  });

  const markRead = useMutation({
    mutationFn: ({ channelId, at }: { channelId: string; at: string }) =>
      send<{ at: string }>("POST", `${channelPath(channelId)}/read`, { at }),
    onMutate: ({ channelId, at }) => {
      patchChannel(queryClient, channelId, (channel) => ({
        ...channel,
        unread: 0,
        mentions: 0,
        readAt: at,
      }));
      setRead(queryClient, channelId, me, at);
    },
  });

  const createChannel = useMutation({
    mutationFn: async (input: { name: string; members: string[]; confidential?: boolean }) =>
      (await send<{ channel: Channel }>("POST", "/channels", input)).channel,
    onSettled: refreshChannels,
  });

  const updateChannel = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; members?: string[] }) =>
      (await send<{ channel: Channel }>("PATCH", channelPath(id), patch)).channel,
    onSettled: refreshChannels,
  });

  const openDirect = useMutation({
    mutationFn: async (input: string[] | { members: string[]; confidential: boolean }) =>
      (
        await send<{ channel: Channel }>(
          "POST",
          "/direct",
          Array.isArray(input) ? { members: input } : input,
        )
      ).channel,
    onSettled: refreshChannels,
  });

  /** Tells the others that one is writing; at most every few seconds. */
  const lastTyping = useRef(0);
  const typing = (channelId: string) => {
    const now = Date.now();
    if (now - lastTyping.current < 3000) return;
    lastTyping.current = now;
    void send("POST", `${channelPath(channelId)}/typing`).catch(() => undefined);
  };

  /** Edited or deleted: the server's answer replaces the message (also live for the others). */
  const replaced = (message: Message) => addMessage(queryClient, message);

  const edit = useMutation({
    mutationFn: async ({
      id,
      channelId,
      text,
      mentions,
      files = [],
    }: {
      id: string;
      channelId: string;
      text: string;
      mentions: string[];
      /** In a confidential channel the files' names go inside the text again. */
      files?: ChatFile[];
    }) =>
      (
        await send<{ message: Message }>("PATCH", `/messages/${encodeURIComponent(id)}`, {
          text: await textFor(channelId, text, files),
          mentions,
        })
      ).message,
    onSuccess: replaced,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await send<{ message: Message }>("DELETE", `/messages/${encodeURIComponent(id)}`)).message,
    onSuccess: replaced,
    onSettled: refreshChannels,
  });

  const mute = useMutation({
    mutationFn: ({ channelId, muted }: { channelId: string; muted: boolean }) =>
      send("POST", `${channelPath(channelId)}/mute`, { muted }),
    onMutate: ({ channelId, muted }) =>
      patchChannel(queryClient, channelId, (channel) => ({ ...channel, muted })),
    onSettled: refreshChannels,
  });

  const leave = useMutation({
    mutationFn: (channelId: string) => send("POST", `${channelPath(channelId)}/leave`),
    onSettled: refreshChannels,
  });

  const removeChannel = useMutation({
    mutationFn: (channelId: string) => send("DELETE", channelPath(channelId)),
    onSettled: refreshChannels,
  });

  return {
    post,
    markRead,
    createChannel,
    updateChannel,
    openDirect,
    typing,
    edit,
    remove,
    mute,
    leave,
    removeChannel,
  };
};
