/**
 * The rights the Kontext server's role needs in Stalwart, the ones an older admin role may not
 * grant (and what the admin reads then), and whether new users may keep passkeys.
 *
 * Permission names: crates/registry/src/schema/enums_impl.rs of stalwartlabs/stalwart v1.1.0
 * (Permission::as_str); roles: Role in crates/registry/src/schema/structs.rs.
 */

export type Role = {
  id: string;
  description: string;
  roleIds?: Record<string, boolean>;
  enabledPermissions?: Record<string, boolean>;
  disabledPermissions?: Record<string, boolean>;
};

/**
 * Mails beim Versand verschlüsseln (company/encryption-gateway.ts); the setting takes effect after
 * ReloadSettings. Optional: an admin role from before Stalwart 1.0.2 lacks the encryption rights
 * and may not grant them (CHANGELOG.md, 1.0.2), so the role is then set up without these.
 */
export const GATEWAY_RIGHTS = [
  "sysEncryptionGet",
  "sysEncryptionUpdate",
  "sysExternalPublicKeyGet",
  "sysExternalPublicKeyCreate",
  "sysExternalPublicKeyDestroy",
  "sysActionCreate",
  "actionReloadSettings",
] as const;

/**
 * Serverzustand (company/server-health-routes.ts): Stalwart Enterprise's metrics and traces, and
 * whether it records them. Read only; without a license Stalwart refuses the objects anyway.
 */
export const TELEMETRY_RIGHTS = [
  "sysMetricGet",
  "sysMetricQuery",
  "sysTraceGet",
  "sysTraceQuery",
  "sysMetricsStoreGet",
  "sysTracingStoreGet",
] as const;

/**
 * Firmenlogo und Vorlagen (company/branding.ts, Stalwart Enterprise): the logo in x:Enterprise,
 * the calendar mail templates in x:CalendarAlarm and x:CalendarScheduling, and the caches Stalwart
 * keeps its logos in. The objects exist in Community too, so the rights can always be granted.
 */
export const BRANDING_RIGHTS = [
  "sysEnterpriseGet",
  "sysEnterpriseUpdate",
  "sysCalendarAlarmGet",
  "sysCalendarAlarmUpdate",
  "sysCalendarSchedulingGet",
  "sysCalendarSchedulingUpdate",
  "actionInvalidateCaches",
] as const;

/**
 * Gelöschte Elemente wiederherstellen (company/archive.ts), used only with Stalwart Enterprise.
 * Optional like the gateway rights: an admin role that lacks them may not grant them.
 */
export const ARCHIVE_RIGHTS = [
  "sysArchivedItemGet",
  "sysArchivedItemQuery",
  "sysArchivedItemUpdate",
  "sysArchivedItemDestroy",
  "sysDataRetentionGet",
  "sysDataRetentionUpdate",
] as const;

/**
 * KI-Spamfilter (company/spam-ai.ts): Kontext's AiModel and the SpamAi settings, applied with
 * ReloadSettings (GATEWAY_RIGHTS). Admin roles have them since Stalwart 1.0.0, which brought the
 * AI models (CHANGELOG.md); Stalwart uses them only with an Enterprise license.
 */
export const SPAM_AI_RIGHTS = [
  "sysAiModelGet",
  "sysAiModelCreate",
  "sysAiModelUpdate",
  "sysAiModelDestroy",
  "sysSpamAiGet",
  "sysSpamAiUpdate",
] as const;

/**
 * Deleting people, and with Stalwart Enterprise listing and recovering deleted accounts
 * (company/deleted-accounts.ts; Permission::as_str in crates/registry/src/schema/enums_impl.rs,
 * Task::permission in crates/registry/src/utils/task.rs). How long Stalwart keeps them is set with
 * the sysDataRetention… rights of ARCHIVE_RIGHTS.
 */
export const DELETED_ACCOUNT_RIGHTS = [
  "sysAccountDestroy",
  "sysTaskGet",
  "sysTaskQuery",
  "sysTaskDestroy",
  "taskDestroyAccount",
] as const;

/**
 * Anmeldung über Firmenkonto (SSO) and SCIM with Stalwart Enterprise (company/sso.ts): the OIDC
 * directory, the domains' `directoryId` and `allowScimProvisioning`, and `scimAccess` for the
 * provider's SCIM token, an API key of the server's account. Harmless without a license.
 */
export const SSO_RIGHTS = [
  "sysDirectoryGet",
  "sysDirectoryCreate",
  "sysDirectoryUpdate",
  "sysDirectoryDestroy",
  "sysDomainUpdate",
  "scimAccess",
] as const;

/** The rights the Kontext server's key needs beside those of User (docs/installation.md). */
export const KONTEXT_SERVER_RIGHTS = [
  "sysAccountGet",
  "sysAccountQuery",
  "sysAccountCreate",
  "sysAccountUpdate",
  "sysRoleGet",
  "sysRoleCreate",
  "sysDomainGet",
  "sysAuthenticationGet",
  "sysIndexQueueStatusGet",
  ...TELEMETRY_RIGHTS,
  ...GATEWAY_RIGHTS,
  ...BRANDING_RIGHTS,
  ...ARCHIVE_RIGHTS,
  ...SPAM_AI_RIGHTS,
  ...DELETED_ACCOUNT_RIGHTS,
  ...SSO_RIGHTS,
  "impersonate",
] as const;

const without = (rights: readonly string[], left: readonly string[]): readonly string[] =>
  rights.filter((right) => !left.includes(right));

const withoutArchiveRights = without(KONTEXT_SERVER_RIGHTS, ARCHIVE_RIGHTS);
const withoutOptionalRights = without(withoutArchiveRights, GATEWAY_RIGHTS);

/** What the admin reads when its role may not grant the gateway rights. */
export const GATEWAY_RIGHTS_HINT =
  "Hinweis: Stalwarts Admin-Rolle fehlen die Rechte für die Verschlüsselung (Stalwart wurde von " +
  "einer Version vor 1.0.2 aktualisiert); ohne sie kann Kontext nicht beim Versand verschlüsseln. " +
  "Der Admin-Rolle die Rechte geben, wie es Stalwarts Changelog zu 1.0.2 beschreibt " +
  "(https://github.com/stalwartlabs/stalwart/blob/main/CHANGELOG.md), dann den Befehl erneut ausführen.";

/** What the admin reads when its role may not grant the rights for deleted items. */
export const ARCHIVE_RIGHTS_HINT =
  "Hinweis: Stalwarts Admin-Rolle fehlen die Rechte für gelöschte Elemente (sysArchivedItem…, " +
  "sysDataRetention…); ohne sie kann Kontext mit Stalwart Enterprise Gelöschtes nicht " +
  "wiederherstellen. Der Admin-Rolle die Rechte geben, dann den Befehl erneut ausführen.";

/**
 * What the passkeys in the settings need (x:Passkey, src/jmap/passkeys.ts). A new server's User
 * role has them; one updated from before 1.1.0 keeps its roles as they were until Stalwart starts
 * once with STALWART_UPDATE_ROLE_PERMISSIONS=true (CHANGELOG.md of Stalwart, 1.1.0).
 */
export const PASSKEY_RIGHTS = [
  "sysPasskeyGet",
  "sysPasskeyCreate",
  "sysPasskeyUpdate",
  "sysPasskeyDestroy",
] as const;

export const PASSKEY_RIGHTS_HINT =
  "Hinweis: Die Standardrolle der Benutzer hat keine Rechte für Passkeys (Stalwart wurde von einer " +
  "Version vor 1.1.0 aktualisiert); ohne sie fehlen die Passkeys in Kontexts Einstellungen. Stalwart " +
  "einmal mit STALWART_UPDATE_ROLE_PERMISSIONS=true starten, danach die Variable wieder entfernen " +
  "(docs/installation.md, Stalwart 1.1.0).";

/** The roles reached from these, with those they inherit, each once. */
const reachedRoles = (roles: Role[], ids: string[], seen = new Set<string>()): Role[] =>
  ids.flatMap((id) => {
    const role = roles.find((candidate) => candidate.id === id);
    if (!role || seen.has(id)) return [];
    seen.add(id);
    return [role, ...reachedRoles(roles, Object.keys(role.roleIds ?? {}), seen)];
  });

const switchedOn = (permissions: Record<string, boolean> | undefined): string[] =>
  Object.keys(permissions ?? {}).filter((right) => permissions?.[right]);

/**
 * The rights the roles give, with those they inherit: all enabled ones minus all disabled ones,
 * as Stalwart computes them (add_role_permissions, PermissionsGroup::finalize in
 * crates/common/src/auth/permissions.rs).
 */
const rightsOf = (roles: Role[], ids: string[]): Set<string> => {
  const reached = reachedRoles(roles, ids);
  const disabled = new Set(reached.flatMap((role) => switchedOn(role.disabledPermissions)));
  return new Set(
    reached
      .flatMap((role) => switchedOn(role.enabledPermissions))
      .filter((right) => !disabled.has(right)),
  );
};

/** Whether the roles new users get let them keep passkeys; a hint for the admin when not. Pure. */
export const passkeyRightsMessage = (roles: Role[], userRoleIds: string[]): string => {
  const rights = rightsOf(roles, userRoleIds);
  return PASSKEY_RIGHTS.every((right) => rights.has(right))
    ? "Passkeys sind für die Benutzer erlaubt."
    : PASSKEY_RIGHTS_HINT;
};

/** Stalwart's refusal of rights the admin does not hold (build_set_error, principal.rs). */
export const isGrantRefusal = (error: string): boolean =>
  error.includes("You are not authorized to grant permissions");

/** The rights to try when the admin may not grant all of them, each with what the admin reads. */
export const ROLE_FALLBACKS: [readonly string[], string][] = [
  [withoutArchiveRights, ARCHIVE_RIGHTS_HINT],
  [withoutOptionalRights, `${GATEWAY_RIGHTS_HINT}\n${ARCHIVE_RIGHTS_HINT}`],
];
