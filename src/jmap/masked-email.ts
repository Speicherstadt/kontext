/**
 * Masked addresses: one address per website or shop that ends in the person's own inbox and can be
 * switched off or deleted when it gets spam (x:MaskedEmail, Stalwart Enterprise only; MaskedEmail
 * in crates/registry/src/schema/structs.rs). Stalwart makes the address itself
 * (crates/jmap/src/registry/mapping/masked_email.rs): a prefix (random, or `emailPrefix`), a dot,
 * a checked id and the account's domain (crates/common/src/enterprise/masked.rs). Mail to it
 * arrives while `enable` is on and `expiresAt` has not passed (crates/common/src/cache/
 * principals.rs, crates/common/src/network/mta.rs). The person's own token may do this: the User
 * role has sysMaskedEmail* (crates/common/src/auth/permissions.rs) and Kontext's `full` OAuth scope
 * includes them (SETTINGS in crates/common/src/auth/oauth/scope.rs), so the browser asks Stalwart
 * directly. Without a license Stalwart answers "forbidden" (crates/jmap/src/registry/mod.rs).
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];

export type MaskedEmail = {
  id: string;
  email: string;
  enable: boolean;
  description: string | null;
  forDomain: string | null;
  createdAt: string;
  expiresAt: string | null;
};

const PROPERTIES = ["email", "enable", "description", "forDomain", "createdAt", "expiresAt"];

/** How long a new address lives; "never" keeps it until it is deleted. */
export const EXPIRY_CHOICES = ["never", "day", "week", "month", "year"] as const;
export type Expiry = (typeof EXPIRY_CHOICES)[number];

const DAY_MS = 24 * 60 * 60_000;
const EXPIRY_MS: Record<Exclude<Expiry, "never">, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

/** Stalwart's UTCDateTime is written without fractions (crates/registry/src/types/datetime.rs). */
const utc = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The moment an address chosen now runs out, null for never. Pure. */
export const expiryFrom = (choice: Expiry, now: Date): string | null =>
  choice === "never" ? null : utc(new Date(now.getTime() + EXPIRY_MS[choice]));

/**
 * The prefix rules Stalwart applies (masked_email.rs): 1 to 64 letters, digits or `_`, not
 * starting with `_`. Empty means Stalwart picks a random one. Pure.
 */
export const isValidPrefix = (prefix: string): boolean =>
  prefix === "" || /^[A-Za-z0-9][A-Za-z0-9_]{0,63}$/.test(prefix);

/** "https://www.shop.de/login" → "shop.de"; anything that is no web address stays as typed. */
export const siteOf = (input: string): string => {
  const text = input.trim();
  if (!text) return "";
  try {
    const url = new URL(text.includes("://") ? text : `https://${text}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return text;
  }
};

export type MaskedState = "active" | "off" | "expired";

/** Whether mail to the address arrives now, as Stalwart decides it (principals.rs). Pure. */
export const maskedState = (entry: MaskedEmail, now: Date): MaskedState => {
  if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= now.getTime()) return "expired";
  return entry.enable ? "active" : "off";
};

export type NewMaskedEmail = {
  description: string;
  site: string;
  prefix: string;
  expiry: Expiry;
};

/** What x:MaskedEmail/set gets to create one; empty fields stay out. Pure. */
export const creationOf = (input: NewMaskedEmail, now: Date): Record<string, unknown> => {
  const description = input.description.trim();
  const site = siteOf(input.site);
  const prefix = input.prefix.trim().toLowerCase();
  const expiresAt = expiryFrom(input.expiry, now);
  return {
    enable: true,
    ...(description ? { description } : {}),
    ...(site ? { forDomain: site } : {}),
    ...(prefix ? { emailPrefix: prefix } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
};

/** The newest first. */
export const listMaskedEmails = async (client: JmapClient): Promise<MaskedEmail[]> => {
  const { list } = await client.call<{ list: MaskedEmail[] }>(
    "x:MaskedEmail/get",
    { ids: null, properties: PROPERTIES },
    STALWART,
  );
  return list
    .map((entry) => ({
      ...entry,
      description: entry.description ?? null,
      forDomain: entry.forDomain ?? null,
      expiresAt: entry.expiresAt ?? null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** Creates one; Stalwart answers with the address it made. */
export const createMaskedEmail = async (
  client: JmapClient,
  input: NewMaskedEmail,
  now = new Date(),
): Promise<string> => {
  const result = await client.call<{ created?: Record<string, { email?: string }> }>(
    "x:MaskedEmail/set",
    { create: { m: creationOf(input, now) } },
    STALWART,
  );
  assertSetOk(result, "Maskierte Adresse");
  return result.created?.m?.email ?? "";
};

/** Off: mail to the address is refused as an unknown recipient (mta.rs); on again later. */
export const setMaskedEmailEnabled = async (client: JmapClient, id: string, enable: boolean) =>
  assertSetOk(
    await client.call("x:MaskedEmail/set", { update: { [id]: { enable } } }, STALWART),
    "Maskierte Adresse",
  );

export const deleteMaskedEmail = async (client: JmapClient, id: string) =>
  assertSetOk(
    await client.call("x:MaskedEmail/set", { destroy: [id] }, STALWART),
    "Maskierte Adresse",
  );
