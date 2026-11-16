/**
 * The preview of a calendar mail template in the Firmenverwaltung: the template filled with an
 * example appointment, with the values Stalwart puts in (alarm: build_template in
 * crates/services/src/task_manager/tasks/alarm.rs; invitation: ItipTemplate::new in
 * crates/services/src/task_manager/tasks/imip.rs) and its texts in German or English
 * (resources/locales/i18n.yml, de-DE and en-US, of stalwartlabs/stalwart v1.1.0). The invitation
 * is shown as a change, so the preview has the header, the "Changed" mark and the old value.
 */
import {
  type CalendarTemplateKind,
  parseTemplate,
  renderTemplate,
  type TemplateValues,
} from "./calendar-template";
import type { TemplateLanguage } from "./calendar-template-defaults";

type Words = {
  alarmHeader: string;
  alarmFooter: string;
  alarmOpen: string;
  alarmPrefix: string;
  updated: string;
  updatedInvitation: string;
  title: string;
  description: string;
  start: string;
  end: string;
  when: string;
  location: string;
  conference: string;
  organizer: string;
  attendees: string;
  changed: string;
  startValue: string;
  endValue: string;
  whenValue: string;
  oldWhen: string;
  footer: [string, string];
};

const WORDS: Record<TemplateLanguage, Words> = {
  de: {
    alarmHeader: "Sie haben einen bevorstehenden Termin",
    alarmFooter:
      "Sie erhalten diese E-Mail, weil Sie Kalender-Benachrichtigungen aktiviert haben. Um diese E-Mails nicht mehr zu erhalten, melden Sie sich im Self-Service-Portal an und deaktivieren Sie Ereignisbenachrichtigungen.",
    alarmOpen: "Termin anzeigen",
    alarmPrefix: "Benachrichtigung",
    updated: "Dieses Ereignis wurde aktualisiert",
    updatedInvitation: "Aktualisierte Einladung",
    title: "Baubesprechung Neubau Kirchstraße",
    description: "Bitte die Pläne für die Heizungsanlage mitbringen.",
    start: "Beginn",
    end: "Ende",
    when: "Wann",
    location: "Ort",
    conference: "Konferenz",
    organizer: "Organisator",
    attendees: "Gäste",
    changed: "Geändert",
    startValue: "18.11.26, 09:00",
    endValue: "18.11.26, 10:00",
    whenValue: "Mittwoch, 18. November 2026 09:00 – 10:00 (Europe/Berlin)",
    oldWhen: "17.11.26, 14:00 – 15:00",
    footer: [
      "Sie erhalten diese E-Mail, weil Sie als Teilnehmer für dieses Ereignis aufgeführt sind.",
      "Das Weiterleiten dieser E-Mail könnte es jedem Empfänger ermöglichen, dem Organisator zu antworten, der Gästeliste beizutreten, die Einladung an andere weiterzugeben oder Ihre Antwort zu ändern.",
    ],
  },
  en: {
    alarmHeader: "You have an upcoming event",
    alarmFooter:
      "You are receiving this email because you have enabled calendar notifications. To stop receiving these emails, login to the self-service portal and disable event notifications.",
    alarmOpen: "View Event",
    alarmPrefix: "Notification",
    updated: "This event has been updated",
    updatedInvitation: "Updated invitation",
    title: "Site meeting new build Kirchstraße",
    description: "Please bring the plans for the heating system.",
    start: "Start",
    end: "End",
    when: "When",
    location: "Location",
    conference: "Conference",
    organizer: "Organizer",
    attendees: "Guests",
    changed: "Changed",
    startValue: "11/18/26, 9:00 AM",
    endValue: "11/18/26, 10:00 AM",
    whenValue: "Wednesday, November 18, 2026 9:00 AM – 10:00 AM (Europe/Berlin)",
    oldWhen: "11/17/26, 2:00 PM – 3:00 PM",
    footer: [
      "You're receiving this e-mail as you're listed as a participant for this event.",
      "Forwarding this e-mail could allow any recipient to reply to the organizer, join the guest list, extend the invitation to others, or alter your RSVP.",
    ],
  },
};

const LOCATION = "Kirchstraße 12, 79098 Freiburg";
const MEETING = "https://meet.weber-haustechnik.test/baubesprechung";
const GUESTS = [
  { key: "Jonas Weber", value: "jonas@weber-haustechnik.test" },
  { key: "Anna Weber", value: "anna@weber-haustechnik.test" },
];

const alarmValues = (w: Words, language: TemplateLanguage): TemplateValues => ({
  page_title: `${w.alarmPrefix}: ${w.title} @ ${w.startValue}`,
  lang: language === "de" ? "de-DE" : "en-US",
  dir: "ltr",
  header: w.alarmHeader,
  footer: w.alarmFooter,
  action_name: w.alarmOpen,
  action_url: "#",
  attendees_title: w.attendees,
  event_title: w.title,
  event_description: w.description,
  event_details: [
    { key: w.start, value: w.startValue },
    { key: w.end, value: w.endValue },
    { key: w.location, value: LOCATION },
    { key: w.conference, value: MEETING, link: MEETING },
    { key: w.organizer, value: `Jonas Weber <${GUESTS[0]!.value}>` },
  ],
  attendees: GUESTS.slice(1),
});

const invitationValues = (w: Words, language: TemplateLanguage): TemplateValues => ({
  page_title: `${w.updatedInvitation}: ${w.title} @ ${w.whenValue}`,
  lang: language === "de" ? "de-DE" : "en-US",
  dir: "ltr",
  header: w.updated,
  color: "info",
  event_title: w.title,
  event_description: w.description,
  event_details: [
    { key: w.when, value: w.whenValue, changed: w.changed, old_value: w.oldWhen },
    { key: w.location, value: LOCATION },
  ],
  attendees_title: w.attendees,
  attendees: [{ ...GUESTS[0]!, key: `${GUESTS[0]!.key} - ${w.organizer}` }, GUESTS[1]!],
  footer: w.footer.map((key) => ({ key })),
});

/** The example values for a kind of mail, with the logo where Stalwart puts its `cid:` link. */
export const previewValues = (
  kind: CalendarTemplateKind,
  language: TemplateLanguage,
  logo: string,
): TemplateValues => {
  const w = WORDS[language];
  const values = kind === "alarm" ? alarmValues(w, language) : invitationValues(w, language);
  return { ...values, logo_cid: logo };
};

/** The mail as HTML for the preview frame, or Stalwart's reason why the template is broken. */
export const previewTemplate = (
  template: string,
  kind: CalendarTemplateKind,
  language: TemplateLanguage,
  logo: string,
): { ok: true; html: string } | { ok: false; error: string } => {
  const parsed = parseTemplate(template);
  if (!parsed.ok) return parsed;
  return { ok: true, html: renderTemplate(parsed.value, previewValues(kind, language, logo)) };
};
