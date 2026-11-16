/**
 * Stalwart Enterprise's license as the server reads it (server/company/license.ts): how many
 * mailboxes are used of how many, until when, for which domain; and when to warn.
 */
import { useQuery } from "@tanstack/react-query";
import type { License } from "../../../server/company/license";

export type { License };

/** From this share of the licensed mailboxes on, the Firmenverwaltung warns. */
export const NEAR_LIMIT = 0.9;
/** This long before the license ends, the Firmenverwaltung warns. */
export const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60_000;

/** Null without a license, or when the server cannot be asked. */
export const getLicense = async (): Promise<License | null> => {
  const response = await fetch("/api/company/license", { credentials: "same-origin" });
  if (!response.ok) return null;
  return ((await response.json()) as { license: License | null }).license;
};

/** Asked only where Stalwart runs as Enterprise (LicenseDetails is shown only there). */
export const useLicense = (): License | null | undefined =>
  useQuery({
    queryKey: ["company", "license"],
    queryFn: getLicense,
    retry: false,
  }).data;

export type LicenseWarnings = {
  /** Stalwart creates no new account (`can_create_account`: used + 1 > limit). */
  full: boolean;
  /** Not full yet, but at least NEAR_LIMIT used. */
  nearLimit: boolean;
  /** The license ends within EXPIRY_WARNING_MS. */
  expiresSoon: boolean;
};

export const licenseWarnings = (license: License, now: number): LicenseWarnings => {
  const { used, limit, validTo } = license;
  const counted = used !== null && limit !== null;
  const full = counted && used >= limit;
  return {
    full,
    nearLimit: counted && !full && used >= limit * NEAR_LIMIT,
    expiresSoon: validTo !== null && Date.parse(validTo) - now <= EXPIRY_WARNING_MS,
  };
};
