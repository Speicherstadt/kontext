/**
 * Kontext's starting point for Stalwart's calendar mails (Enterprise): the same parts and
 * variables as Stalwart's built-in templates (resources/html-templates/calendar-alarm.html and
 * calendar-invite.html of stalwartlabs/stalwart v1.1.0) – logo, header, title, description, the
 * details with what changed, the guests, the buttons, the footer – in Kontext's look (zinc, light
 * and dark) and much shorter. Stalwart fills the texts in the recipient's language (the account's
 * `locale`; Kontext creates accounts with de-DE); only what is written into a template stays as
 * it is. That is the alarm mail's footer: Stalwart's own speaks of a "self-service portal" that
 * Kontext does not have, so the default says in German or English where the reminder is set.
 */
import type { CalendarTemplateKind } from "./calendar-template";

export type TemplateLanguage = "de" | "en";

const FONT = "font-family:Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const TEXT = `${FONT}color:#09090b;`;
const MUTED = `${FONT}color:#68686f;`;
const LABEL = `${MUTED}font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;`;

const STYLE = `<style>
body{margin:0;padding:0;background:#fafafa}
a{color:#2563eb}
.tone-info{background:#eff6ff;color:#1d4ed8}
.tone-warning{background:#fffbeb;color:#b45309}
.tone-danger{background:#fef2f2;color:#b91c1c}
@media (prefers-color-scheme:dark){
.k-bg{background:#09090b!important}
.k-card{background:#18181b!important;border-color:#27272a!important}
.k-tile{background:#27272a!important}
.k-fg{color:#fafafa!important}
.k-muted{color:#a1a1aa!important}
.k-logo{background:#ffffff!important;padding:6px 10px!important}
.k-button{background:#fafafa!important;color:#09090b!important}
}
</style>`;

const row = (padding: string, content: string) =>
  `<tr><td style="padding:${padding}">${content}</td></tr>`;

const LOGO = row(
  "28px 32px 0",
  `<span class="k-logo" style="display:inline-block;border-radius:8px"><img src="{{logo_cid}}" width="140" alt="" style="display:block;width:140px;max-width:140px;height:auto;border:0"></span>`,
);

const header = (tone: boolean) =>
  `{{#if header}}${row(
    "24px 32px 0",
    `<div class="${tone ? "tone-{{color}}" : "tone-info"}" style="${FONT}padding:10px 14px;border-radius:8px;font-size:14px;font-weight:600;line-height:1.45">{{header}}</div>`,
  )}{{/if header}}`;

const TITLE = `{{#if event_title}}${row(
  "20px 32px 0",
  `<div class="k-fg" style="${TEXT}font-size:22px;font-weight:600;line-height:1.3">{{event_title}}</div>`,
)}{{/if event_title}}`;

const DESCRIPTION = `{{#if event_description}}${row(
  "8px 32px 0",
  `<div class="k-muted" style="${MUTED}font-size:14px;line-height:1.6;white-space:pre-line">{{event_description}}</div>`,
)}{{/if event_description}}`;

const DETAIL = `<tr><td style="padding:12px 0 0">
<div class="k-muted" style="${LABEL}">{{key}}{{#if changed}} <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:10px;text-transform:none;letter-spacing:0">{{changed}}</span>{{/if changed}}</div>
{{#if old_value}}<div class="k-muted" style="${MUTED}font-size:13px;text-decoration:line-through;padding-top:2px">{{old_value}}</div>{{/if old_value}}
<div class="k-fg" style="${TEXT}font-size:15px;line-height:1.5;padding-top:2px;word-break:break-word">{{#if link}}<a href="{{link}}" target="_blank">{{/if link}}{{value}}{{#if link}}</a>{{/if link}}</div>
</td></tr>`;

const DETAILS = `{{#if event_details}}${row(
  "20px 32px 0",
  `<table role="presentation" class="k-tile" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:10px"><tr><td style="padding:4px 18px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{{#each event_details}}${DETAIL}{{/each event_details}}</table></td></tr></table>`,
)}{{/if event_details}}`;

const ATTENDEES = `{{#if attendees}}${row(
  "20px 32px 0",
  `<div class="k-muted" style="${LABEL}padding-bottom:6px">{{attendees_title}}</div>{{#each attendees}}<div class="k-fg" style="${TEXT}font-size:14px;line-height:1.6">{{key}} <span class="k-muted" style="color:#68686f">{{value}}</span></div>{{/each attendees}}`,
)}{{/if attendees}}`;

const BUTTON = `display:inline-block;padding:11px 20px;border-radius:8px;${FONT}font-size:14px;font-weight:600;text-decoration:none;`;

/** The alarm mail's one button: open the appointment (Stalwart's webcal link). */
const OPEN = row(
  "24px 32px 0",
  `<a class="k-button" href="{{action_url}}" target="_blank" style="${BUTTON}background:#18181b;color:#ffffff">{{action_name}}</a>`,
);

/** Yes, no, maybe – only when Stalwart's answer page is on (Kontext leaves it off, its own buttons). */
const RSVP = `{{#if rsvp}}${row(
  "24px 32px 0",
  `<div class="k-muted" style="${MUTED}font-size:13px;padding-bottom:8px">{{rsvp}}</div>{{#each actions}}<a class="tone-{{color}}" href="{{action_url}}" target="_blank" style="${BUTTON}margin:0 6px 6px 0;background:#f4f4f5;color:#09090b">{{action_name}}</a>{{/each actions}}`,
)}{{/if rsvp}}`;

const footerBlock = (content: string) =>
  `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px"><tr><td align="center" style="padding:14px 32px 0"><div class="k-muted" style="${MUTED}font-size:12px;line-height:1.55">${content}</div></td></tr></table>`;

const ALARM_FOOTER: Record<TemplateLanguage, string> = {
  de: "Sie erhalten diese E-Mail, weil für diesen Termin eine Erinnerung per E-Mail eingestellt ist. Im Termin lässt sie sich ändern oder abschalten.",
  en: "You are receiving this email because this event has a reminder by email. You can change or turn it off in the event.",
};

/** Stalwart's two footer lines (why one gets it, why not to forward it), in the recipient's language. */
const INVITATION_FOOTER = `{{#if footer}}${footerBlock(
  `{{#each footer}}<p style="margin:0 0 6px">{{key}}</p>{{/each footer}}`,
)}{{/if footer}}`;

const page = (body: string, footer: string) => `<!DOCTYPE html>
<html lang="{{lang}}" dir="{{dir}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{page_title}}</title>
${STYLE}
</head>
<body class="k-bg" dir="{{dir}}" style="margin:0;padding:0;background:#fafafa">
<table role="presentation" class="k-bg" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" class="k-card" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate">
${body}
<tr><td style="padding:0 0 28px;font-size:0;line-height:0">&nbsp;</td></tr>
</table>
${footer}
</td></tr>
</table>
</body>
</html>
`;

const alarmTemplate = (language: TemplateLanguage) =>
  page(
    [LOGO, header(false), TITLE, DESCRIPTION, DETAILS, ATTENDEES, OPEN].join("\n"),
    footerBlock(ALARM_FOOTER[language]),
  );

const invitationTemplate = () =>
  page(
    [LOGO, header(true), TITLE, DESCRIPTION, DETAILS, ATTENDEES, RSVP].join("\n"),
    INVITATION_FOOTER,
  );

/** The template the Firmenverwaltung starts from, in the language picked there. */
export const defaultTemplate = (kind: CalendarTemplateKind, language: TemplateLanguage): string =>
  kind === "alarm" ? alarmTemplate(language) : invitationTemplate();
