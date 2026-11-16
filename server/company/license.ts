/**
 * What the Stalwart Enterprise license allows and how much of it is used, for the Firmenverwaltung.
 *
 * Stalwart has no route that names the license's details. What it knows (stalwartlabs/stalwart
 * v1.1.0):
 * - Used: `can_create_account` (crates/common/src/enterprise/mod.rs) compares `total_accounts`, the
 *   count of every `Account` object (crates/common/src/storage/mod.rs), with the key's `accounts`;
 *   an `Account` is a user or a group (crates/registry/src/schema/structs.rs), so shared mailboxes
 *   and the Kontext server's own account count. `x:Account/query` with `calculateTotal` gives the
 *   same number (crates/jmap/src/api/query.rs).
 * - Limit, end and domain sit only in the key itself (`LicenseKey`,
 *   crates/common/src/enterprise/license.rs). `x:Enterprise/get` returns it as `licenseKey`, but
 *   masked as "****" unless the system setting `includeSecrets` is on
 *   (crates/registry/src/schema/structs_impl.rs, `SecretKeyValue`), and only with
 *   `sysEnterpriseGet`. Where it comes in clear, Kontext reads the fields from it; the signature was
 *   checked by Stalwart, which says "enterprise" only for a valid key (edition.ts).
 */
import type { StalwartRequest } from "./management";

/** The key's fields; times in seconds since 1970, as Stalwart keeps them. */
export type LicenseKey = { validFrom: number; validTo: number; accounts: number; domain: string };

/** What the Firmenverwaltung shows; null where Stalwart does not say. */
export type License = {
  used: number | null;
  limit: number | null;
  /** ISO 8601. */
  validTo: string | null;
  domain: string | null;
};

const U64 = 8;
const U32 = 4;
const HEADER = U64 * 2 + U32 * 2;

/**
 * The fields of a license key: base64 of valid_from (u64), valid_to (u64), accounts (u32), the
 * domain's length (u32), the domain, then the signature, all little-endian
 * (`LicenseValidator::try_parse`, license.rs). Null for a masked key or anything else.
 */
export const decodeLicenseKey = (key: string): LicenseKey | null => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key.trim())) return null;
  const bytes = Buffer.from(key.trim(), "base64");
  if (bytes.length < HEADER) return null;
  const validFrom = Number(bytes.readBigUInt64LE(0));
  const validTo = Number(bytes.readBigUInt64LE(U64));
  const accounts = bytes.readUInt32LE(U64 * 2);
  const domainLength = bytes.readUInt32LE(U64 * 2 + U32);
  if (bytes.length < HEADER + domainLength) return null;
  let domain: string;
  try {
    domain = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(HEADER, HEADER + domainLength),
    );
  } catch {
    return null;
  }
  // The same checks as Stalwart's before it looks at the signature.
  if (!validFrom || !validTo || validFrom >= validTo || !accounts || !domain) return null;
  return { validFrom, validTo, accounts, domain };
};

/** The clear key from an `x:Enterprise/get` answer, or null (masked, none, not allowed). */
export const licenseKeyOf = (getResponse: unknown): LicenseKey | null => {
  const list = (getResponse as { list?: { licenseKey?: { secret?: unknown } }[] } | null)?.list;
  const secret = list?.[0]?.licenseKey?.secret;
  return typeof secret === "string" ? decodeLicenseKey(secret) : null;
};

export const toLicense = (used: number | null, key: LicenseKey | null): License => ({
  used,
  limit: key?.accounts ?? null,
  validTo: key ? new Date(key.validTo * 1000).toISOString() : null,
  domain: key?.domain ?? null,
});

export type LicenseCheck = () => Promise<License>;

/** Asks Stalwart with the server's key; a refused question leaves its part null. */
export const createLicenseCheck = (request: StalwartRequest): LicenseCheck => {
  const answer = async (method: string, args: Record<string, unknown>) =>
    request([[method, args, "0"]])
      .then((responses) => responses[0]?.[1] ?? null)
      .catch(() => null);
  return async () => {
    const [count, enterprise] = await Promise.all([
      answer("x:Account/query", { calculateTotal: true, limit: 1 }),
      answer("x:Enterprise/get", { ids: ["singleton"], properties: ["licenseKey"] }),
    ]);
    const total = (count as { total?: unknown } | null)?.total;
    return toLicense(typeof total === "number" ? total : null, licenseKeyOf(enterprise));
  };
};
