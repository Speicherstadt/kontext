/**
 * Contacts, contact groups and appointments of the test data ("Weber Haustechnik"); the mails are in
 * seed-data.ts.
 */
import { DEV_DOMAIN } from "./config";
import { hoffmann, lang, petra, richter, sommer, steuer } from "./seed-people";

/** Contact groups (JSContact cards of kind "group"); members by uid. */
export type SeedContactGroup = { uid: string; owner: string; name: string; members: string[] };

export const contactGroups: SeedContactGroup[] = [
  { uid: "lieferanten", owner: "jonas", name: "Lieferanten", members: ["petra-keller", "richter"] },
  {
    uid: "team",
    owner: "jonas",
    name: "Team",
    members: ["anna-weber", "sandra-klein", "max-becker"],
  },
];

export type SeedContact = {
  uid: string;
  owner: string;
  given: string;
  surname: string;
  company?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  note?: string;
  /**
   * Birthday (for the calendar's "Geburtstage"): days from today, so it is near whenever the seed
   * runs, and the age turned on it; without one the card knows only the day (`--MM-DD`).
   */
  birthday?: { day: number; age?: number };
};

export const contacts: SeedContact[] = [
  {
    uid: "petra-keller",
    owner: "jonas",
    given: "Petra",
    surname: "Keller",
    company: "Keller Elektro GmbH",
    email: petra[1],
    phone: "+49 7223 81234",
    street: "Industriestraße 4",
    city: "77815 Bühl",
    note: "Ansprechpartnerin Wartungsvertrag",
    birthday: { day: 9, age: 52 },
  },
  {
    uid: "markus-hoffmann",
    owner: "jonas",
    given: "Markus",
    surname: "Hoffmann",
    company: "Schreinerei Hoffmann",
    email: hoffmann[1],
    phone: "+49 7223 55678",
    street: "Hauptstraße 41",
    city: "77815 Bühl",
    note: "Badsanierung OG ab Januar",
  },
  {
    uid: "claudia-sommer",
    owner: "jonas",
    given: "Claudia",
    surname: "Sommer",
    email: sommer[1],
    phone: "+49 160 1234567",
    street: "Rheinstraße 12",
    city: "77815 Bühl",
    note: "Privatkundin, Gastherme Baujahr 2009",
    birthday: { day: 16 },
  },
  {
    uid: "thomas-lang",
    owner: "jonas",
    given: "Thomas",
    surname: "Lang",
    email: lang[1],
    phone: "+49 171 7654321",
    city: "77815 Bühl-Weitenung",
    note: "Neubau, Wärmepumpe angefragt",
  },
  {
    uid: "kanzlei-braun",
    owner: "jonas",
    given: "Sabine",
    surname: "Braun",
    company: "Kanzlei Braun",
    email: steuer[1],
    phone: "+49 7221 99887",
    street: "Lichtentaler Straße 2",
    city: "76530 Baden-Baden",
  },
  {
    uid: "richter",
    owner: "jonas",
    given: "Bestellannahme",
    surname: "Richter",
    company: "Großhandel Richter",
    email: richter[1],
    phone: "+49 721 445566",
    city: "76131 Karlsruhe",
  },
  {
    uid: "anna-weber",
    owner: "jonas",
    given: "Anna",
    surname: "Weber",
    company: "Weber Haustechnik",
    email: `anna@${DEV_DOMAIN}`,
    phone: "+49 7223 1000-11",
    birthday: { day: 23, age: 34 },
  },
  {
    uid: "sandra-klein",
    owner: "jonas",
    given: "Sandra",
    surname: "Klein",
    company: "Weber Haustechnik",
    email: `sandra@${DEV_DOMAIN}`,
    phone: "+49 7223 1000-12",
  },
  {
    uid: "max-becker",
    owner: "jonas",
    given: "Max",
    surname: "Becker",
    company: "Weber Haustechnik",
    email: `max@${DEV_DOMAIN}`,
    phone: "+49 7223 1000-13",
  },
];

export type SeedEvent = {
  uid: string;
  owner: string;
  title: string;
  /** Days from today (0 = today, negative = past), local time "HH:MM". */
  day: number;
  time: string;
  minutes: number;
  location?: string;
  attendees?: string[];
  description?: string;
  /** Repeats, as a JSCalendar recurrenceRule. */
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; interval?: number; count?: number };
};

export const events: SeedEvent[] = [
  {
    uid: "baubesprechung-hoffmann",
    owner: "jonas",
    title: "Baubesprechung Hoffmann",
    day: 0,
    time: "10:00",
    minutes: 60,
    location: "Hauptstraße 41, Bühl",
    attendees: [`anna@${DEV_DOMAIN}`, hoffmann[1]],
  },
  {
    uid: "heizung-sommer",
    owner: "jonas",
    title: "Heizung prüfen – Sommer",
    day: 1,
    time: "08:30",
    minutes: 90,
    location: "Rheinstraße 12, Bühl",
  },
  {
    uid: "team-montag",
    owner: "jonas",
    title: "Teambesprechung",
    day: 3,
    time: "07:30",
    minutes: 30,
    recurrence: { frequency: "weekly", count: 12 },
    location: "Werkstatt",
    attendees: [`anna@${DEV_DOMAIN}`, `sandra@${DEV_DOMAIN}`, `max@${DEV_DOMAIN}`],
  },
  {
    uid: "steuer-braun",
    owner: "jonas",
    title: "Termin Kanzlei Braun",
    day: 2,
    time: "14:00",
    minutes: 60,
    location: "Baden-Baden",
  },
  {
    uid: "lieferung-richter",
    owner: "jonas",
    title: "Lieferung Großhandel Richter",
    day: 1,
    time: "13:00",
    minutes: 30,
  },
  {
    uid: "angebot-lang",
    owner: "jonas",
    title: "Besichtigung Neubau Lang",
    day: 4,
    time: "16:00",
    minutes: 60,
    location: "Bühl-Weitenung",
  },
  {
    // Anna's own appointment, so she is busy this afternoon whenever the seed runs (the
    // availability screenshot plans at 14:00). An invitation would not do: Stalwart sends
    // none for an appointment that is already over (ItipSendStatus::EventInPast,
    // crates/groupware/src/calendar/itip.rs), so after 11:00 Anna would miss the Baubesprechung.
    uid: "kundendienst-sommer",
    owner: "anna",
    title: "Kundendienst Heizung Sommer",
    day: 0,
    time: "13:30",
    minutes: 90,
    location: "Rheinstraße 12, Bühl",
  },
  {
    uid: "wartung-keller",
    owner: "jonas",
    title: "Wartung Halle 2 – Keller Elektro",
    day: -1,
    time: "09:00",
    minutes: 120,
    location: "Industriestraße 4, Bühl",
  },
];
