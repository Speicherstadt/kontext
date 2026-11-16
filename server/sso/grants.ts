/**
 * Renewing and ending the grants of sessions signed in with the company account (auth.ts,
 * ProviderGrants): at the provider's token and revocation endpoints, with the client as it is set
 * now. A client taken away or moved to another provider ends those sessions at their next renewal.
 */
import type { ProviderGrants } from "../auth";
import {
  type DiscoveryCache,
  type Fetch,
  refreshAtProvider,
  revokeAtProvider,
  type SsoClient,
  sameIssuer,
} from "./oidc";
import type { SsoStore } from "./store";

export const createProviderGrants = (
  store: Pick<SsoStore, "client">,
  discovery: DiscoveryCache,
  fetchFn?: Fetch,
): ProviderGrants => {
  const clientFor = async (issuer: string): Promise<SsoClient | null> => {
    const client = await store.client();
    return client && sameIssuer(client.issuer, issuer) ? client : null;
  };
  return {
    refresh: async (issuer, refreshToken) => {
      const client = await clientFor(issuer);
      if (!client) return { status: "rejected" };
      const document = await discovery(issuer);
      if (!document) return { status: "unavailable" };
      return refreshAtProvider(document, client, refreshToken, fetchFn);
    },
    revoke: async (issuer, refreshToken) => {
      const client = await clientFor(issuer);
      const document = client && (await discovery(issuer));
      return client && document ? revokeAtProvider(document, client, refreshToken, fetchFn) : false;
    },
  };
};
