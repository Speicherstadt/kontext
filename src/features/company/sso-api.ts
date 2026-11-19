/**
 * Anmeldung über Firmenkonto (SSO) and SCIM in the Firmenverwaltung (server/company/sso-routes.ts),
 * only with Stalwart Enterprise: the provider, the domains it serves, the SCIM token, and which
 * employees the provider manages.
 */
import { useQuery } from "@tanstack/react-query";
import { useStalwartEdition } from "@/company-core/edition";
import type { ConnectionTest, SsoView } from "../../../server/company/sso-routes";

export type { ConnectionTest, SsoView };

export type SsoSettings = {
  issuerUrl: string;
  clientId: string;
  /** Empty keeps the saved one. */
  clientSecret: string;
  scopes: string;
  claimUsername: string;
  usernameDomain: string;
  claimName: string;
  claimGroups: string;
  audience: string;
  tokenCheck: "jwt" | "userInfo";
};

export type DomainChoice = { id: string; sso: boolean; scim: boolean };

export const SSO_KEY = ["company", "sso"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/company/sso${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const getSso = () => send<SsoView>("GET", "");
export const saveSso = (settings: SsoSettings) => send<SsoView>("PUT", "", settings);
export const removeSso = () => send<SsoView>("DELETE", "");
export const saveSsoDomains = (domains: DomainChoice[]) =>
  send<SsoView>("PUT", "/domains", { domains });
export const testSso = () => send<ConnectionTest>("POST", "/test");
export const createScimToken = () =>
  send<{ secret: string; canDelete: boolean }>("POST", "/scim-token");
export const removeScimToken = () => send<SsoView>("DELETE", "/scim-token");

/** Asked only with Stalwart Enterprise; undefined otherwise and while loading. */
export const useSso = () => {
  const enterprise = useStalwartEdition() === "enterprise";
  return useQuery({ queryKey: SSO_KEY, queryFn: getSso, enabled: enterprise, retry: false }).data;
};

/** What the provider takes over for an employee, by the domain of the address. */
export type Managed = { sso: boolean; scim: boolean };

export const managedBy = (email: string, domains: SsoView["domains"]): Managed => {
  const name = email.split("@")[1]?.toLowerCase();
  const domain = domains.find((candidate) => candidate.name.toLowerCase() === name);
  return { sso: Boolean(domain?.sso), scim: Boolean(domain?.scim) };
};

export const useManagedBy = (email: string): Managed => managedBy(email, useSso()?.domains ?? []);

/** The values the form starts with: the saved ones, or what suits Entra ID, Google, Keycloak. */
export const initialSettings = (view: SsoView | undefined): SsoSettings => ({
  issuerUrl: view?.directory?.issuerUrl ?? "",
  clientId: view?.client?.clientId ?? "",
  clientSecret: "",
  scopes: view?.client?.scopes ?? "openid email profile offline_access",
  claimUsername: view?.directory?.claimUsername ?? "preferred_username",
  usernameDomain: view?.directory?.usernameDomain ?? "",
  claimName: view?.directory?.claimName ?? "name",
  claimGroups: view?.directory?.claimGroups ?? "",
  audience: view?.directory?.audience ?? "",
  tokenCheck: view?.directory?.tokenCheck ?? "jwt",
});
