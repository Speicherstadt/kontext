/** Writing calendar events (JMAP for Calendars): create, update, delete, answer. */
import { chunk } from "@/lib/chunk";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.calendars];

/**
 * Who sends the invitations: Stalwart (`true`: its own mails, crates/services/src/task_manager/
 * imip.rs) or Kontext, which then sends them itself (invitations.ts).
 */
export type Scheduling = { sendSchedulingMessages: boolean };

const STALWART_SENDS: Scheduling = { sendSchedulingMessages: true };

/**
 * Changing or deleting an instance id changes only that date: Stalwart writes it to the series'
 * `recurrenceOverrides` (an exclusion for a delete). The base id changes the whole series.
 */
export const createEvent = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  event: Record<string, unknown>,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    {
      accountId,
      sendSchedulingMessages,
      create: {
        e: {
          "@type": "Event",
          uid: crypto.randomUUID(),
          calendarIds: { [calendarId]: true },
          ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== null)),
        },
      },
    },
    USING,
  );
  assertSetOk(result, "Termin");
  return result.created!.e!.id;
};

/**
 * Several events into one calendar, without invitations (such as public holidays); at most 100 per
 * call, below Stalwart's `maxObjectsInSet`.
 */
export const createEvents = async (
  client: JmapClient,
  accountId: string,
  calendarId: string,
  events: Record<string, unknown>[],
): Promise<void> => {
  for (const page of chunk(events, 100)) {
    const create = Object.fromEntries(
      page.map((event, index) => [
        `e${index}`,
        {
          "@type": "Event",
          uid: crypto.randomUUID(),
          calendarIds: { [calendarId]: true },
          ...event,
        },
      ]),
    );
    assertSetOk(
      await client.call(
        "CalendarEvent/set",
        { accountId, sendSchedulingMessages: false, create },
        USING,
      ),
      "Termin",
    );
  }
};

export const updateEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
  patch: Record<string, unknown>,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages, update: { [id]: patch } },
      USING,
    ),
    "Termin",
  );
};

export const deleteEvent = async (
  client: JmapClient,
  accountId: string,
  id: string,
  { sendSchedulingMessages }: Scheduling = STALWART_SENDS,
): Promise<void> => {
  assertSetOk(
    await client.call(
      "CalendarEvent/set",
      { accountId, sendSchedulingMessages, destroy: [id] },
      USING,
    ),
    "Termin",
  );
};

/**
 * Accept, decline or maybe in the calendar: Stalwart tells the organizer (iMIP REPLY), also one
 * outside; since Stalwart 1.1.0 also for an event Kontext put in from a mail without scheduling
 * (`itip_unscheduled_update`, crates/groupware/src/scheduling/event_create.rs).
 */
export const respondToEvent = (
  client: JmapClient,
  accountId: string,
  id: string,
  participantId: string,
  status: "accepted" | "declined" | "tentative",
) =>
  updateEvent(client, accountId, id, {
    [`participants/${participantId}/participationStatus`]: status,
  });
