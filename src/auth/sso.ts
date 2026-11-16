/**
 * Sign-in with the company account (Stalwart Enterprise, server/sso/sign-in.ts): whether an address
 * goes to the company's identity provider, and the address that starts it. The browser leaves for
 * the provider and comes back signed in, or to /login with `sso` saying what went wrong.
 */

/** Whether the address signs in with the company account; false when the server cannot tell. */
export const checkSso = async (email: string): Promise<boolean> => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return false;
  try {
    const response = await fetch("/api/auth/sign-in/sso/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!response.ok) return false;
    return Boolean(((await response.json()) as { sso?: boolean }).sso);
  } catch {
    return false;
  }
};

export const ssoStartUrl = (email: string): string =>
  `/api/auth/sign-in/sso?${new URLSearchParams({ email: email.trim() })}`;

/** What the server reports after the round trip through the provider. */
export type SsoOutcome = "failed" | "unavailable" | "cancelled";

export const ssoOutcomeOf = (value: string | undefined): SsoOutcome | null =>
  value === "failed" || value === "unavailable" || value === "cancelled" ? value : null;
