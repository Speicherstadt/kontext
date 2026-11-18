/**
 * Calendars and events of every account the user can see: the own one, shared mailboxes like
 * info@, and colleagues who shared a calendar. Each event carries the account it came from.
 */
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import {
  type Calendar,
  getEvent,
  listCalendars,
  queryEvents,
  searchEvents,
  updateCalendar,
} from "@/jmap/calendar";
import { CAPABILITIES } from "@/jmap/client";
import { principalName } from "@/jmap/principals";
import { hiddenToMove } from "@/lib/calendar-visibility";
import { orderHits } from "@/lib/event-search";
import {
  addDays,
  type CalendarEvent,
  dateKey,
  eventKey,
  fromLocal,
  isOrganizer,
  isPrivate,
  myParticipation,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { usePrincipals } from "../sharing/queries";
import { CALENDAR_COLORS } from "./calendar-colors";
import { forgetHiddenCalendar, useHiddenCalendars } from "./hidden-calendars";

/** A calendar together with the account it lives in. */
export type CalendarRef = {
  /** `accountId:calendarId`, unique across accounts. */
  key: string;
  accountId: string;
  isPersonal: boolean;
  /**
   * Whether Stalwart counts the user as the calendar's owner: their own account, or a shared
   * mailbox (a group) they are a member of (AccessToken::is_member in
   * crates/common/src/auth/access_token.rs). Only owners see, change and mark private events.
   */
  isOwner: boolean;
  /** Who it belongs to: a colleague's name or a shared mailbox by its address. */
  owner: string;
  /** The owner's address; counts as organizer when the user edits a colleague's calendar. */
  ownerEmail: string;
  name: string;
  color: string;
  calendar: Calendar;
  mayWrite: boolean;
  /** Shown in the views: the calendar's own `isVisible`, per person on every device. */
  visible: boolean;
};

export const useCalendarAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.calendars];
};

/** The addresses that count as "me" in participant lists. */
export const useMyAddresses = (): string[] => {
  const { data: session } = useSession();
  return session ? [session.username] : [];
};

const useCalendarAccounts = () => {
  const { data: session } = useSession();
  if (!session) return [];
  return Object.entries(session.accounts)
    .filter(([, account]) => CAPABILITIES.calendars in account.accountCapabilities)
    .map(([id, account]) => ({ id, ...account }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));
};

/** Stalwart names the default calendar "Stalwart Calendar (…)"; the app calls it by its owner. */
const calendarName = (calendar: Calendar, own: boolean, owner: string): string =>
  /^Stalwart Calendar/.test(calendar.name) ? (own ? m.calendar_mine() : owner) : calendar.name;

/** A colour per calendar when the user has not picked one. */
const PALETTE = CALENDAR_COLORS.map((choice) => choice.color);

export const listKey = (accountId: string) => [accountId, "calendars"] as const;

/** All calendars the user can read: own ones first, then shared mailboxes and colleagues. */
export const useCalendarRefs = (): { calendars: CalendarRef[]; isPending: boolean } => {
  const client = useClient();
  const accounts = useCalendarAccounts();
  const { data: principals = [] } = usePrincipals();
  const hidden = useHiddenCalendars();
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: listKey(account.id),
      queryFn: () => listCalendars(client, account.id),
    })),
  });
  let index = 0;
  const calendars = accounts.flatMap((account, position) => {
    const principal = principals.find((p) => p.id === account.id);
    const owner = principal && principal.type !== "group" ? principalName(principal) : account.name;
    return (results[position]?.data ?? [])
      .filter((calendar) => account.isPersonal || calendar.myRights?.mayReadItems)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
      .map(
        (calendar): CalendarRef => ({
          key: `${account.id}:${calendar.id}`,
          accountId: account.id,
          isPersonal: account.isPersonal,
          isOwner: account.isPersonal || principal?.type === "group",
          owner,
          ownerEmail: principal?.email ?? account.name,
          name: calendarName(calendar, account.isPersonal, owner),
          color: calendar.color ?? PALETTE[index++ % PALETTE.length]!,
          calendar,
          mayWrite: account.isPersonal || Boolean(calendar.myRights?.mayWriteAll),
          visible: calendar.isVisible !== false,
        }),
      );
  });
  const isPending = results.some((result) => result.isPending);
  useMoveHiddenCalendars(isPending ? [] : calendars, hidden);
  return { calendars, isPending };
};

/** The move runs once per page load, shared by every calendar list on the page. */
let moveStarted = false;

/**
 * Before Stalwart 1.0 the app kept hidden calendars per device (hidden-calendars.ts); what this
 * device hid is set on the server once (lib/calendar-visibility.ts) and then forgotten here; a key
 * whose write failed stays for the next load.
 */
const useMoveHiddenCalendars = (calendars: CalendarRef[], local: ReadonlySet<string>) => {
  const setVisible = useSetCalendarVisible();
  useEffect(() => {
    if (moveStarted) return;
    const { hide, forget } = hiddenToMove(local, calendars);
    if (!forget.length) return;
    moveStarted = true;
    const byKey = new Map(calendars.map((calendar) => [calendar.key, calendar]));
    const alreadyHidden = forget.filter((key) => !hide.includes(key));
    void Promise.allSettled(
      hide.map((key) =>
        setVisible.mutateAsync({ calendar: byKey.get(key)!, visible: false }).then(() => key),
      ),
    ).then((results) => {
      const moved = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      for (const key of [...alreadyHidden, ...moved]) forgetHiddenCalendar(key);
    });
  }, [calendars, local, setVisible]);
};

/** Shows or hides a calendar for the user, on every device; the list follows at once. */
export const useSetCalendarVisible = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const setShown = (calendar: CalendarRef, isVisible: boolean) =>
    queryClient.setQueryData<Calendar[]>(listKey(calendar.accountId), (list) =>
      list?.map((item) => (item.id === calendar.calendar.id ? { ...item, isVisible } : item)),
    );
  return useMutation({
    mutationFn: ({ calendar, visible }: { calendar: CalendarRef; visible: boolean }) =>
      updateCalendar(client, calendar.accountId, calendar.calendar.id, { isVisible: visible }),
    onMutate: async ({ calendar, visible }) => {
      // A list still loading (e.g. after saving an event) would bring the old value back.
      await queryClient.cancelQueries({ queryKey: listKey(calendar.accountId) });
      setShown(calendar, visible);
    },
    // Back to before the click, also when the list cannot be reloaded right now.
    onError: (_error, { calendar, visible }) => setShown(calendar, !visible),
    onSettled: (_data, _error, { calendar }) =>
      queryClient.invalidateQueries({ queryKey: listKey(calendar.accountId) }),
  });
};

/** "Baustellen · Jonas Weber"; own calendars and colleagues' default ones by their name alone. */
export const calendarLabel = (calendar: CalendarRef): string =>
  calendar.isPersonal || calendar.name === calendar.owner
    ? calendar.name
    : m.calendar_of({ calendar: calendar.name, owner: calendar.owner });

/** The calendar an event is in (the first visible one it belongs to). */
export const calendarOf = (
  calendars: CalendarRef[],
  event: CalendarEvent,
): CalendarRef | undefined =>
  calendars.find(
    (calendar) => calendar.accountId === event.accountId && event.calendarIds[calendar.calendar.id],
  );

/**
 * An invitation still waiting for the user's answer. Only the user's own calendar holds
 * invitations to answer; a colleague's shared calendar holds theirs.
 */
export const isInvitation = (
  calendars: CalendarRef[],
  event: CalendarEvent,
  mine: string[],
): boolean => {
  if (!calendarOf(calendars, event)?.isPersonal) return false;
  const me = myParticipation(event, mine);
  return Boolean(me && !isOrganizer(event, mine) && me[1].participationStatus === "needs-action");
};

/**
 * A colleague's private event: the user sees only its time, and Stalwart refuses changes to it
 * from anyone but the owner (assert_privacy_access in crates/jmap/src/calendar_event/privacy.rs).
 * A shared mailbox's members count as its owner.
 */
export const isOthersPrivate = (calendar: CalendarRef | undefined, event: CalendarEvent) =>
  isPrivate(event) && !calendar?.isOwner;

/**
 * May the user change the event? In a writable calendar, if they or the calendar's owner organize
 * it (invitations from others are answered, not edited), unless it is a colleague's private one.
 */
export const mayEdit = (
  calendar: CalendarRef | undefined,
  event: CalendarEvent,
  myAddresses: string[],
): boolean =>
  Boolean(calendar?.mayWrite) &&
  !isOthersPrivate(calendar, event) &&
  isOrganizer(event, [...myAddresses, calendar!.ownerEmail]);

/** The URL search that opens an event. */
export const eventSearch = (event: CalendarEvent) => ({
  event: event.id,
  account: event.accountId,
});

/** Events of the local days `from` … `to` (inclusive) in the visible calendars. */
export const useEvents = (from: string, to: string) => {
  const client = useClient();
  const { calendars, isPending: calendarsPending } = useCalendarRefs();
  const shown = calendars.filter((calendar) => calendar.visible);
  const results = useQueries({
    queries: shown.map((calendar) => ({
      queryKey: [calendar.accountId, "events", calendar.calendar.id, from, to],
      queryFn: () =>
        queryEvents(
          client,
          calendar.accountId,
          fromLocal(`${from}T00:00:00`),
          fromLocal(`${addDays(to, 1)}T00:00:00`),
          { calendarId: calendar.calendar.id },
        ),
      placeholderData: keepPreviousData,
    })),
  });
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  shown.forEach((calendar, index) => {
    for (const event of results[index]?.data ?? []) {
      const loaded = { ...event, accountId: calendar.accountId, color: calendar.color };
      if (seen.has(eventKey(loaded))) continue;
      seen.add(eventKey(loaded));
      events.push(loaded);
    }
  });
  return {
    data: events,
    calendars,
    isPending: calendarsPending || results.some((result) => result.isPending),
  };
};

/**
 * Appointments of the visible calendars that mention the words, past and future; a series is one
 * hit. Hidden calendars are left out like in the views, which could not open their events.
 */
export const useEventSearch = (words: string) => {
  const client = useClient();
  const { calendars } = useCalendarRefs();
  const shown = calendars.filter((calendar) => calendar.visible);
  const results = useQueries({
    queries: shown.map((calendar) => ({
      queryKey: [calendar.accountId, "events", calendar.calendar.id, "search", words],
      queryFn: () => searchEvents(client, calendar.accountId, calendar.calendar.id, words),
      enabled: words.length >= 2,
    })),
  });
  const found = shown.flatMap((calendar, index) =>
    (results[index]?.data ?? []).map((event) => ({
      ...event,
      accountId: calendar.accountId,
      color: calendar.color,
    })),
  );
  return {
    hits: orderHits(found, new Date()),
    isFetching: results.some((result) => result.isFetching),
  };
};

/** Today's and later events of the own calendars that mention an address (contact view). */
export const useEventsWith = (email: string | undefined) => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  return useQuery({
    queryKey: [accountId, "events", "with", email],
    queryFn: async () => {
      const today = fromLocal(`${dateKey(new Date())}T00:00:00`);
      const events = await queryEvents(
        client,
        accountId!,
        today,
        new Date(today.getTime() + 180 * 86_400_000),
        { text: email },
      );
      return events.map((event) => ({ ...event, accountId }));
    },
    enabled: Boolean(accountId && email),
  });
};

/** The series an instance belongs to; holds the rule the editor shows. */
export const useSeries = (event: CalendarEvent | undefined) => {
  const client = useClient();
  const accountId = event?.accountId;
  const baseEventId = event?.baseEventId;
  return useQuery({
    queryKey: [accountId, "events", "series", baseEventId],
    queryFn: () => getEvent(client, accountId!, baseEventId!),
    enabled: Boolean(accountId && baseEventId),
  });
};
