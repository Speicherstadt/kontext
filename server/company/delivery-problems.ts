/**
 * Zustellprobleme (Stalwart Enterprise): why a mail to someone outside did not arrive, from the
 * traces Stalwart keeps of each delivery attempt (`x:Trace`, crates/registry/src/schema/structs.rs,
 * Trace / TraceEvent / TraceValue). An attempt is one span that starts with
 * `delivery.attempt-start` (crates/smtp/src/outbound/delivery.rs); the events below are those its
 * failures send, with the recipient in `to`, the remote server in `hostname` and its answer in
 * `details` or `reason` (outbound/session.rs, outbound/delivery.rs, queue/dsn.rs). Pure.
 */

type TraceValue = { "@type"?: string; value?: unknown; event?: string };
type KeyValue = { key: string; value: TraceValue };
type TraceEvent = { event: string; timestamp: string; keyValues?: KeyValue[] };

/** One `x:Trace` as Stalwart returns it. */
export type RawTrace = { id: string; events?: TraceEvent[] };

export type DeliveryProblem = {
  /** The trace and the recipient: unique per row. */
  id: string;
  at: string;
  to: string;
  /** The remote server's answer or Stalwart's reason, as they wrote it. */
  reason: string;
  host: string | null;
  /** Given up (the sender gets a bounce), or tried again later. */
  permanent: boolean;
};

/** The failures of an attempt; true: final. A 4xx RCPT answer is decided by its code below. */
const FAILURES: Record<string, boolean> = {
  "delivery.failed": true,
  "delivery.dsn-perm-fail": true,
  "delivery.null-mx": true,
  "delivery.rcpt-to-rejected": true,
  "delivery.message-rejected": true,
  "delivery.dsn-temp-fail": false,
  "delivery.rcpt-to-failed": false,
  "delivery.greeting-failed": false,
};

/** The text in a value: a string, the strings of a list, or the details of a nested error. */
const textOf = (value: TraceValue | undefined): string | null => {
  if (!value) return null;
  if (value["@type"] === "String" && typeof value.value === "string") return value.value;
  if (value["@type"] === "List" && Array.isArray(value.value)) {
    const parts = (value.value as TraceValue[]).map(textOf).filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (value["@type"] === "Event" && Array.isArray(value.value)) {
    const inner = value.value as KeyValue[];
    return (
      ["details", "reason"].map((key) => textOf(find(inner, key))).find(Boolean) ??
      value.event ??
      null
    );
  }
  return null;
};

const find = (values: KeyValue[] | undefined, key: string): TraceValue | undefined =>
  values?.find((entry) => entry.key === key)?.value;

const numberOf = (value: TraceValue | undefined): number | null =>
  typeof value?.value === "number" ? value.value : null;

const isPermanent = (event: TraceEvent): boolean => {
  if (event.event !== "delivery.rcpt-to-rejected") return FAILURES[event.event] ?? false;
  const code = numberOf(find(event.keyValues, "code"));
  return code === null || code >= 500;
};

const reasonOf = (event: TraceEvent): string => {
  const values = event.keyValues;
  const code = numberOf(find(values, "code"));
  const text =
    ["details", "reason", "causedBy"].map((key) => textOf(find(values, key))).find(Boolean) ??
    event.event;
  return code !== null && !text.startsWith(String(code)) ? `${code} ${text}` : text;
};

/** The recipients an event is about; a message rejection is about all of the attempt. */
const recipientsOf = (event: TraceEvent, attempt: string[]): string[] => {
  const to = textOf(find(event.keyValues, "to"));
  return to ? to.split("; ") : attempt;
};

/** The problems of one attempt, one per recipient: the last word about each counts. */
const problemsOf = (trace: RawTrace): DeliveryProblem[] => {
  const events = trace.events ?? [];
  const attempt = recipientsOf(events[0] ?? { event: "", timestamp: "" }, []);
  const byRecipient = new Map<string, DeliveryProblem>();
  for (const event of events.filter((candidate) => candidate.event in FAILURES)) {
    for (const to of recipientsOf(event, attempt)) {
      const before = byRecipient.get(to);
      const permanent = isPermanent(event);
      // A final answer is kept over a later temporary one (a DSN after the rejection).
      if (before?.permanent && !permanent) continue;
      byRecipient.set(to, {
        id: `${trace.id}/${to}`,
        at: event.timestamp,
        to,
        reason: reasonOf(event),
        host: textOf(find(event.keyValues, "hostname")),
        permanent,
      });
    }
  }
  return [...byRecipient.values()];
};

/** What went wrong in these attempts, newest first, at most `limit`. */
export const deliveryProblems = (traces: RawTrace[], limit = 20): DeliveryProblem[] =>
  traces
    .flatMap(problemsOf)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
