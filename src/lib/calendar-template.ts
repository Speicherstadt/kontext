/**
 * Stalwart's templates for its calendar mails (Enterprise): the alarm mail (`x:CalendarAlarm`,
 * `template`) and the invitation mail (`x:CalendarScheduling`, `emailTemplate`). The syntax is
 * Stalwart's own, read here the same way so the Firmenverwaltung can check a template before it
 * goes to Stalwart and show a preview: `{{name}}` (HTML-escaped), `{{!name}}` (as is),
 * `{{#if name}}…{{/if name}}` and `{{#each name}}…{{/each name}}`, nothing else
 * (Template::parse and Template::eval in crates/utils/src/template.rs of stalwartlabs/stalwart
 * v1.1.0). Stalwart does not check a template when it is saved; a broken one only logs "Invalid
 * template" when the settings load and its own built-in template stays in use
 * (crates/common/src/enterprise/config.rs) – hence the check here.
 */
/** Errors as values, as server/company/accounts.ts has it. */
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Which mail: the reminder Stalwart sends for an appointment that reminds by mail
 * (crates/services/src/task_manager/tasks/alarm.rs), or its scheduling mail – invitation, change,
 * cancellation, answer (crates/services/src/task_manager/tasks/imip.rs).
 */
export const CALENDAR_TEMPLATE_KINDS = ["alarm", "invitation"] as const;
export type CalendarTemplateKind = (typeof CALENDAR_TEMPLATE_KINDS)[number];

/** Every name Stalwart knows (CalendarTemplateVariable::from_str, crates/common/src/config/groupware.rs). */
export const TEMPLATE_VARIABLES = [
  "page_title",
  "lang",
  "dir",
  "header",
  "footer",
  "event_title",
  "event_description",
  "event_details",
  "action_url",
  "action_name",
  "attendees",
  "attendees_title",
  "key",
  "value",
  "link",
  "logo_cid",
  "actions",
  "changed",
  "old_value",
  "rsvp",
  "color",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export type TemplateItem =
  | { kind: "static"; text: string }
  | { kind: "variable"; name: TemplateVariable; escape: boolean }
  | { kind: "if" | "each"; variable: TemplateVariable; end: number };

/** A value Stalwart fills in: a text, or a list of entries for `{{#each}}`. */
export type TemplateValue = string | Partial<Record<TemplateVariable, string>>[];
export type TemplateValues = Partial<Record<TemplateVariable, TemplateValue>>;

const isVariable = (name: string): name is TemplateVariable =>
  (TEMPLATE_VARIABLES as readonly string[]).includes(name);

type Block = { name: string; at: number };

/** `#each x` / `#if x` (or with `/`): which block and its variable name, or Stalwart's error. */
const blockOf = (rest: string, start: boolean): Result<{ kind: "if" | "each"; name: string }> => {
  if (rest.startsWith("each ")) return { ok: true, value: { kind: "each", name: rest.slice(5) } };
  if (rest.startsWith("if ")) return { ok: true, value: { kind: "if", name: rest.slice(3) } };
  return { ok: false, error: `Invalid block ${start ? "start" : "end"}: ${rest}` };
};

/** Closes the innermost block, as Stalwart does; an end with no open block is ignored there too. */
const closeBlock = (
  items: TemplateItem[],
  stack: Block[],
  kind: "if" | "each",
  name: string,
): string | null => {
  const open = stack.pop();
  if (!open) return null;
  if (open.name !== name)
    return `Block end does not match start: expected ${open.name}, got ${name}`;
  const item = items[open.at]!;
  if (item.kind !== kind) return `Block end does not match start type for ${name}`;
  items[open.at] = { ...item, end: items.length };
  return null;
};

/** One `{{…}}` tag added to the items, or Stalwart's reason why not. */
const addTag = (items: TemplateItem[], stack: Block[], tag: string): string | null => {
  if (tag.startsWith("#") || tag.startsWith("/")) {
    const start = tag.startsWith("#");
    const block = blockOf(tag.slice(1).trim(), start);
    if (!block.ok) return block.error;
    const { kind, name } = block.value;
    if (!start) return closeBlock(items, stack, kind, name);
    if (!isVariable(name)) return `Invalid variable: ${name}`;
    stack.push({ name, at: items.length });
    items.push({ kind, variable: name, end: 0 });
    return null;
  }
  const escaped = !tag.startsWith("!");
  const name = escaped ? tag : tag.slice(1);
  if (!isVariable(name)) return `Invalid variable: ${name}`;
  items.push({ kind: "variable", name, escape: escaped });
  return null;
};

/** The template as Stalwart reads it, or the error Stalwart would log (in its English words). */
export const parseTemplate = (template: string): Result<TemplateItem[]> => {
  const items: TemplateItem[] = [];
  const stack: Block[] = [];
  let rest = template;
  for (;;) {
    const open = rest.indexOf("{{");
    if (open < 0) break;
    if (open > 0) items.push({ kind: "static", text: rest.slice(0, open) });
    const close = rest.indexOf("}}", open + 2);
    if (close < 0) return { ok: false, error: "Unmatched {{" };
    const error = addTag(items, stack, rest.slice(open + 2, close).trim());
    if (error) return { ok: false, error };
    rest = rest.slice(close + 2);
  }
  if (rest) items.push({ kind: "static", text: rest });
  const unclosed = stack.at(-1);
  return unclosed
    ? { ok: false, error: `Unmatched {: ${unclosed.name}` }
    : { ok: true, value: items };
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const textOf = (value: string | undefined, escaped: boolean) =>
  value === undefined ? "" : escaped ? escapeHtml(value) : value;

/**
 * One entry of an `{{#each}}`: only its own values count, an `{{#if}}` inside skips to its end, a
 * nested `{{#each}}` is not run (its content is written with this entry), as in Template::eval.
 */
const renderEntry = (
  items: TemplateItem[],
  from: number,
  to: number,
  entry: Partial<Record<TemplateVariable, string>>,
): string => {
  let out = "";
  for (let at = from; at < to; at++) {
    const item = items[at]!;
    if (item.kind === "static") out += item.text;
    else if (item.kind === "variable") out += textOf(entry[item.name], item.escape);
    else if (item.kind === "if" && entry[item.variable] === undefined) at = item.end - 1;
  }
  return out;
};

/** The template filled in with these values, character for character as Stalwart does it. */
export const renderTemplate = (items: TemplateItem[], values: TemplateValues): string => {
  let out = "";
  for (let at = 0; at < items.length; at++) {
    const item = items[at]!;
    if (item.kind === "static") out += item.text;
    else if (item.kind === "variable") {
      const value = values[item.name];
      if (typeof value === "string") out += textOf(value, item.escape);
    } else if (item.kind === "if") {
      if (values[item.variable] === undefined) at = item.end - 1;
    } else {
      const entries = values[item.variable];
      if (Array.isArray(entries))
        out += entries.map((entry) => renderEntry(items, at + 1, item.end, entry)).join("");
      at = item.end - 1;
    }
  }
  return out;
};

/** The longest template Kontext sends to Stalwart (Stalwart's own are about 16 KB). */
export const TEMPLATE_MAX = 200_000;

/** Why Stalwart would not use this template, or null. */
export const templateProblem = (template: string): string | null => {
  if (!template.trim()) return "empty";
  if (template.length > TEMPLATE_MAX) return "too long";
  const parsed = parseTemplate(template);
  return parsed.ok ? null : parsed.error;
};
