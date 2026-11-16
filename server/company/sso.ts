/**
 * Anmeldung über Firmenkonto (SSO) and SCIM in Stalwart (Enterprise), with the server's key:
 *
 * - the OIDC directory (`x:Directory`, `@type: "Oidc"`, OidcDirectory in
 *   crates/registry/src/schema/structs.rs of stalwartlabs/stalwart v1.1.0) that checks the
 *   provider's access tokens; Stalwart builds its directories at start and on ReloadSettings
 *   (crates/common/src/cache/reload.rs);
 * - per domain `directoryId` (which directory signs its accounts in; only with a license,
 *   `get_directory_for_domain` in crates/common/src/auth/authentication.rs) and
 *   `allowScimProvisioning` (Domain in structs.rs): the provider creates, changes and deactivates
 *   the domain's accounts over SCIM, and a sign-in no longer creates one (just-in-time
 *   provisioning is off, `sync_account` in crates/common/src/cache/directory.rs);
 * - the provider's SCIM token: an API key of the Kontext server's own account that may do only
 *   what SCIM needs (Permission::ScimAccess and the account rights crates/scim/src checks).
 *
 * Rights: sysDirectory*, sysDomainUpdate, scimAccess (stalwart-setup.ts, SSO_RIGHTS).
 */
import { firstError, type Invocation, type SetResult } from "./management";

type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

/** How Stalwart checks the provider's access tokens: signed JWTs, or opaque ones at UserInfo. */
export type TokenCheck = "jwt" | "userInfo";

/** What the admin sets of the OIDC directory. */
export type DirectorySettings = {
  issuerUrl: string;
  /** The claim with the address (Stalwart's default: preferred_username). */
  claimUsername: string;
  /** Appended as @domain when the claim holds a bare name. */
  usernameDomain: string;
  claimName: string;
  claimGroups: string;
  /** The `aud` the provider puts into its access tokens for Kontext (often the client id). */
  audience: string;
  tokenCheck: TokenCheck;
};

export type SsoDomain = {
  id: string;
  name: string;
  /** Signed in by Kontext's OIDC directory. */
  sso: boolean;
  /** Signed in by another directory (LDAP, SQL) set up in Stalwart: left alone here. */
  otherDirectory: boolean;
  scim: boolean;
};

export type StalwartSsoView = {
  directoryId: string | null;
  directory: DirectorySettings | null;
  domains: SsoDomain[];
};

/** How Kontext's directory is named in Stalwart's list of directories. */
export const DIRECTORY_DESCRIPTION = "Firmenkonto (Kontext)";
/** How the SCIM token is named in the Kontext server's list of API keys. */
export const SCIM_KEY_DESCRIPTION = "SCIM (Kontext)";

/** What the SCIM client needs (crates/scim/src: auth.rs, users/*, groups/*). */
export const SCIM_RIGHTS = [
  "authenticate",
  "scimAccess",
  "sysAccountGet",
  "sysAccountCreate",
  "sysAccountUpdate",
] as const;
/** Deleting accounts over SCIM; only when the Kontext server may delete (not by default). */
export const SCIM_DELETE_RIGHT = "sysAccountDestroy";

type RawDirectory = {
  id: string;
  "@type": string;
  description?: string;
  issuerUrl?: string;
  claimUsername?: string;
  usernameDomain?: string | null;
  claimName?: string | null;
  claimGroups?: string | null;
  acceptedAudiences?: Record<string, boolean>;
  opaqueTokenValidation?: string;
};

type RawDomain = {
  id: string;
  name: string;
  directoryId?: string | null;
  allowScimProvisioning?: boolean;
};

/** Kontext's OIDC directory: the one it named, else the only OIDC directory there is. */
export const pickDirectory = (directories: RawDirectory[]): RawDirectory | null => {
  const oidc = directories.filter((directory) => directory["@type"] === "Oidc");
  return (
    oidc.find((directory) => directory.description === DIRECTORY_DESCRIPTION) ??
    (oidc.length === 1 ? oidc[0]! : null)
  );
};

export const toSettings = (raw: RawDirectory): DirectorySettings => ({
  issuerUrl: raw.issuerUrl ?? "",
  claimUsername: raw.claimUsername ?? "",
  usernameDomain: raw.usernameDomain ?? "",
  claimName: raw.claimName ?? "",
  claimGroups: raw.claimGroups ?? "",
  audience: Object.keys(raw.acceptedAudiences ?? {})[0] ?? "",
  tokenCheck: raw.opaqueTokenValidation === "userInfo" ? "userInfo" : "jwt",
});

export const toSsoDomain = (raw: RawDomain, directoryId: string | null): SsoDomain => ({
  id: raw.id,
  name: raw.name,
  sso: Boolean(directoryId) && raw.directoryId === directoryId,
  otherDirectory: Boolean(raw.directoryId) && raw.directoryId !== directoryId,
  scim: Boolean(raw.allowScimProvisioning),
});

/**
 * The directory's properties. `unscopedTokens: "full"`: a token of the provider with the right
 * audience gets the account's full rights, as Kontext's own sign-in does (scope `full`,
 * stalwart.ts); providers such as Entra ID cannot issue Stalwart's scope names
 * (`token_access` in crates/directory/src/backend/oidc/lookup.rs).
 */
export const directoryObject = (settings: DirectorySettings) => ({
  description: DIRECTORY_DESCRIPTION,
  issuerUrl: settings.issuerUrl.trim(),
  claimUsername: settings.claimUsername.trim() || "preferred_username",
  usernameDomain: settings.usernameDomain.trim() || null,
  claimName: settings.claimName.trim() || null,
  claimGroups: settings.claimGroups.trim() || null,
  acceptedAudiences: settings.audience.trim() ? { [settings.audience.trim()]: true } : {},
  opaqueTokenValidation: settings.tokenCheck === "userInfo" ? "userInfo" : "none",
  unscopedTokens: "full",
});

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

const RELOAD: Invocation = ["x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }, "z"];

const trueMap = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((key) => [key, true as const]));

/** The first refusal in the answers, Stalwart's words. */
const refusalOf = (responses: Invocation[]): string | undefined =>
  responses.map(([, args]) => firstError(args as SetResult)).find(Boolean);

export const createStalwartSso = (request: Request) => {
  /** null when the key may not read directories (setup command not run again). */
  const read = async (): Promise<StalwartSsoView | null> => {
    try {
      const [directories, domains] = await request([
        ["x:Directory/get", { ids: null }, "d"],
        [
          "x:Domain/get",
          { ids: null, properties: ["name", "directoryId", "allowScimProvisioning"] },
          "n",
        ],
      ]);
      const directory = pickDirectory(directories![1].list as RawDirectory[]);
      const directoryId = directory?.id ?? null;
      return {
        directoryId,
        directory: directory ? toSettings(directory) : null,
        domains: (domains![1].list as RawDomain[])
          .map((domain) => toSsoDomain(domain, directoryId))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    } catch {
      return null;
    }
  };

  /** Creates or changes the directory, then lets Stalwart load it. */
  const saveDirectory = async (
    current: string | null,
    settings: DirectorySettings,
  ): Promise<Outcome<null>> => {
    const object = directoryObject(settings);
    const set: Invocation = current
      ? ["x:Directory/set", { update: { [current]: object } }, "0"]
      : ["x:Directory/set", { create: { d: { "@type": "Oidc", ...object } } }, "0"];
    const error = refusalOf(await request([set, RELOAD]));
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  /** Per domain: signed in by the directory or not, provisioned over SCIM or not. */
  const setDomains = async (
    directoryId: string | null,
    domains: { id: string; sso: boolean; scim: boolean }[],
  ): Promise<Outcome<null>> => {
    if (!domains.length) return { ok: true, value: null };
    const update = Object.fromEntries(
      domains.map((domain) => [
        domain.id,
        {
          directoryId: domain.sso && directoryId ? directoryId : null,
          allowScimProvisioning: domain.scim,
        },
      ]),
    );
    const error = refusalOf(await request([["x:Domain/set", { update }, "0"], RELOAD]));
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  /** Takes the directory away: its domains sign in with passwords at Stalwart again. */
  const removeDirectory = async (view: StalwartSsoView): Promise<Outcome<null>> => {
    if (!view.directoryId) return { ok: true, value: null };
    const assigned = view.domains.filter((domain) => domain.sso);
    const released = await setDomains(
      view.directoryId,
      assigned.map((domain) => ({ id: domain.id, sso: false, scim: domain.scim })),
    );
    if (!released.ok) return released;
    const error = refusalOf(
      await request([["x:Directory/set", { destroy: [view.directoryId] }, "0"], RELOAD]),
    );
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  const scimKeys = async (): Promise<{ id: string; createdAt: string | null }[]> => {
    const [keys] = await request([
      ["x:ApiKey/get", { ids: null, properties: ["description", "createdAt"] }, "0"],
    ]);
    return (keys![1].list as { id: string; description?: string; createdAt?: string }[])
      .filter((key) => key.description === SCIM_KEY_DESCRIPTION)
      .map((key) => ({ id: key.id, createdAt: key.createdAt ?? null }));
  };

  /** When the SCIM token was made, or null; never the token itself (Stalwart keeps a hash). */
  const scimKey = async (): Promise<{ createdAt: string | null } | null> => {
    const [key] = await scimKeys().catch(() => []);
    return key ? { createdAt: key.createdAt } : null;
  };

  const createKey = async (rights: readonly string[]) => {
    const [answer] = await request([
      [
        "x:ApiKey/set",
        {
          create: {
            k: {
              description: SCIM_KEY_DESCRIPTION,
              permissions: { "@type": "Replace", permissions: trueMap(rights) },
            },
          },
        },
        "0",
      ],
    ]);
    const result = answer![1] as SetResult;
    const secret = (result.created?.k as { secret?: string } | undefined)?.secret;
    return secret
      ? { ok: true as const, secret }
      : { ok: false as const, error: firstError(result) };
  };

  /**
   * A new SCIM token, shown once; the old one stops working. With deleting where the Kontext
   * server may delete accounts, else without (Stalwart grants no right the key lacks,
   * `validate_credential_permissions` in crates/jmap/src/registry/mapping/account.rs).
   */
  const newScimKey = async (): Promise<Outcome<{ secret: string; canDelete: boolean }>> => {
    const old = await scimKeys();
    const full = await createKey([...SCIM_RIGHTS, SCIM_DELETE_RIGHT]);
    const created = full.ok ? full : await createKey(SCIM_RIGHTS);
    if (!created.ok) return { ok: false, error: created.error ?? "Kein Schlüssel angelegt." };
    if (old.length) await request([["x:ApiKey/set", { destroy: old.map((key) => key.id) }, "0"]]);
    return { ok: true, value: { secret: created.secret, canDelete: full.ok } };
  };

  const removeScimKey = async (): Promise<Outcome<null>> => {
    const old = await scimKeys();
    if (!old.length) return { ok: true, value: null };
    const error = refusalOf(
      await request([["x:ApiKey/set", { destroy: old.map((key) => key.id) }, "0"]]),
    );
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  return { read, saveDirectory, setDomains, removeDirectory, scimKey, newScimKey, removeScimKey };
};

export type StalwartSso = ReturnType<typeof createStalwartSso>;
