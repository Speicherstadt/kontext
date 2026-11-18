/** Changes to events and calendars: create, update, answer, delete, share (JMAP for Calendars). */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { createCalendar, deleteCalendar, respondToEvent, updateCalendar } from "@/jmap/calendar";
import { type AnswerLinksOf, type EventChange, saveEvent } from "@/jmap/invitations";
import { withOwnVisibility } from "@/lib/calendar-visibility";
import type { CalendarEvent } from "@/lib/jscalendar";
import type { ShareWith } from "@/lib/sharing";
import { type CalendarRef, listKey, useCalendarAccountId } from "./queries";

/** The pages on which attendees answer, signed by Kontext's server (/api/invitations). */
const answerLinksOf: AnswerLinksOf = async (accountId, eventId) => {
  const response = await fetch("/api/invitations/links", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, eventId }),
  });
  if (!response.ok) return {};
  return ((await response.json()) as { links: Awaited<ReturnType<AnswerLinksOf>> }).links;
};

export const useEventMutations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const refresh = (accountId: string | undefined) =>
    queryClient.invalidateQueries({ queryKey: [accountId, "events"] });
  const account = (event: CalendarEvent) => event.accountId!;
  const save = (accountId: string, change: EventChange) =>
    saveEvent(client, accountId, change, answerLinksOf);

  return {
    create: useMutation({
      mutationFn: ({
        event,
        calendar,
      }: {
        event: Record<string, unknown>;
        calendar: CalendarRef;
      }) => save(calendar.accountId, { kind: "create", calendarId: calendar.calendar.id, event }),
      onSettled: (_data, _error, { calendar }) => refresh(calendar.accountId),
    }),
    update: useMutation({
      mutationFn: ({
        event,
        id,
        patch,
      }: {
        event: CalendarEvent;
        /** The instance or series to change; defaults to the event itself. */
        id?: string;
        patch: Record<string, unknown>;
      }) => save(account(event), { kind: "update", id: id ?? event.id, patch }),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    /** Drag in the grid: shown at once, saved in the background. */
    move: useMutation({
      mutationFn: ({
        event,
        patch,
      }: {
        event: CalendarEvent;
        patch: Record<string, unknown>;
        start: Date;
        end: Date;
      }) => save(account(event), { kind: "update", id: event.id, patch }),
      onMutate: async ({ event, start, end }) => {
        const queryKey = [account(event), "events"];
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueriesData<CalendarEvent[]>({ queryKey }, (list) =>
          Array.isArray(list)
            ? list.map((item) =>
                item.id === event.id
                  ? { ...item, utcStart: start.toISOString(), utcEnd: end.toISOString() }
                  : item,
              )
            : list,
        );
      },
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    remove: useMutation({
      mutationFn: ({ event, id }: { event: CalendarEvent; id?: string }) =>
        save(account(event), { kind: "destroy", id: id ?? event.id }),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    respond: useMutation({
      mutationFn: ({
        event,
        participantId,
        status,
      }: {
        event: CalendarEvent;
        participantId: string;
        status: "accepted" | "declined" | "tentative";
      }) => respondToEvent(client, account(event), event.id, participantId, status),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
  };
};

export const useCalendarMutations = () => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  const queryClient = useQueryClient();
  const refresh = (account: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey(account) }),
      queryClient.invalidateQueries({ queryKey: [account, "events"] }),
    ]);

  const createOne = useMutation({
    mutationFn: (name: string) => createCalendar(client, accountId!, { name }),
    onSettled: () => refresh(accountId!),
  });
  const deleteOne = useMutation({
    mutationFn: (calendar: CalendarRef) =>
      deleteCalendar(client, calendar.accountId, calendar.calendar.id),
    onSettled: (_data, _error, calendar) => refresh(calendar.accountId),
  });
  const share = useMutation({
    mutationFn: ({
      calendar,
      shareWith,
      includeInAvailability,
    }: {
      calendar: CalendarRef;
      shareWith: ShareWith;
      includeInAvailability?: boolean;
    }) =>
      updateCalendar(
        client,
        calendar.accountId,
        calendar.calendar.id,
        withOwnVisibility(
          {
            shareWith,
            ...(includeInAvailability === undefined
              ? {}
              : {
                  includeInAvailability: includeInAvailability
                    ? ("all" as const)
                    : ("none" as const),
                }),
          },
          calendar.visible,
        ),
      ),
    onSettled: (_data, _error, { calendar }) => refresh(calendar.accountId),
  });
  /** A new name or colour, the user's own (calendar-colors.ts). */
  const edit = useMutation({
    mutationFn: ({
      calendar,
      patch,
    }: {
      calendar: CalendarRef;
      patch: { name?: string; color?: string };
    }) =>
      updateCalendar(
        client,
        calendar.accountId,
        calendar.calendar.id,
        withOwnVisibility(patch, calendar.visible),
      ),
    onSettled: (_data, _error, { calendar }) => refresh(calendar.accountId),
  });
  return { createOne, deleteOne, share, edit };
};
