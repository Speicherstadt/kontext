/** What the telephone box should run: its configuration, derived from the line's settings. Pure. */
import { companyDay } from "../tasks/tasks";
import { deskForBox, ringPlanFor } from "./lines";
import { TRUNK_USER } from "./livekit-sip";
import { numberForms, toDialable } from "./numbers";
import type { RingPlan } from "./phone";
import type { BoxConfig } from "./protocol";
import type { PhoneSettings } from "./store";

/** How long an incoming call rings in Kontext before the box lets go of it. */
const RING_SECONDS = 60;

/** How long a message on the mailbox may be. */
const MAILBOX_SECONDS = 120;

/** Only sounds that still exist; a deleted greeting leaves the beep alone. */
const knownSound = (settings: PhoneSettings, id: string | null) =>
  id && settings.sounds.some((sound) => sound.id === id) ? id : null;

/** The company's time zone; the box compares opening hours in it. */
const TIMEZONE = "Europe/Berlin";

/**
 * Closed days from today on, for the year ahead: Asterisk knows no years, so a past day would come
 * back, and one a year or more ahead would close the same date this year.
 */
const comingDays = (days: { day: string }[], today: string) => {
  const yearAhead = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  return days.map((entry) => entry.day).filter((day) => day >= today && day < yearAhead);
};

/** The first line's ring plan, as the app sees it. */
export const ringPlanOf = (settings: PhoneSettings): RingPlan => ringPlanFor(settings, null);

export const desiredConfig = (
  settings: PhoneSettings,
  trunkHost: string,
  trunkPort: number,
  today = companyDay(new Date()),
  unavailable: string[] = [],
): BoxConfig => {
  const { mailbox, hours } = settings;
  const greeting = knownSound(settings, mailbox.greeting);
  const closedGreeting = knownSound(settings, hours.greeting);
  const menuGreeting = settings.menu.enabled ? knownSound(settings, settings.menu.greeting) : null;
  const notice = settings.recording.enabled
    ? knownSound(settings, settings.recording.notice)
    : null;
  return {
    line: settings.line,
    extraLines: settings.line
      ? settings.extraLines.map(({ id, username, password }) => ({ id, username, password }))
      : [],
    // The desk phone of someone who does not take calls stays quiet.
    deskPhones: settings.deskPhones.map((desk) =>
      desk.member && unavailable.includes(desk.member)
        ? { ...deskForBox(settings, desk), lines: [] }
        : deskForBox(settings, desk),
    ),
    trunk: {
      host: trunkHost,
      port: trunkPort,
      username: TRUNK_USER,
      password: settings.trunkPassword,
    },
    ringSeconds: mailbox.enabled ? mailbox.ringSeconds : RING_SECONDS,
    sounds: [
      ...new Set([
        ...(mailbox.enabled && greeting ? [greeting] : []),
        ...(hours.enabled && closedGreeting ? [closedGreeting] : []),
        ...(menuGreeting ? [menuGreeting] : []),
        ...(notice ? [notice] : []),
      ]),
    ],
    mailbox: mailbox.enabled ? { greeting, maxSeconds: MAILBOX_SECONDS } : null,
    hours: hours.enabled
      ? {
          timezone: TIMEZONE,
          open: hours.open,
          closedDays: comingDays(hours.closedDays, today).slice(0, 60),
          greeting: closedGreeting,
        }
      : null,
    fax: settings.fax.enabled && settings.fax.line ? { line: settings.fax.line } : null,
    recording: settings.recording.enabled ? { notice } : null,
    blocked: {
      numbers: [...new Set(settings.blocked.numbers.flatMap((entry) => numberForms(entry.number)))],
      anonymous: settings.blocked.anonymous,
    },
    // Without a greeting there is no menu to hear.
    menu:
      menuGreeting && settings.menu.options.length
        ? {
            greeting: menuGreeting,
            options: settings.menu.options.map(({ digit, mailbox: toMailbox }) => ({
              digit,
              mailbox: toMailbox,
            })),
            waitSeconds: 5,
          }
        : null,
    forward: settings.forward
      ? { number: toDialable(settings.forward.number), afterSeconds: settings.forward.afterSeconds }
      : null,
  };
};
