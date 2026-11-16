import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/settings-page";
import { z } from "@/lib/zod";

export const settingsSections = [
  "profile",
  "signature",
  "accounts",
  "vacation",
  "deputy",
  "rules",
  "snippets",
  "sync",
  "security",
  "access",
  "encryption",
  "masked-email",
  "agents",
  "appearance",
  "deleted",
  "employees",
  "mailboxes",
  "company-signature",
  "company-legal",
  "company-vacation",
  "company-chat",
  "company-security",
  "company-idle",
  "company-external",
  "company-smime",
  "company-backup",
  "company-health",
  "company-branding",
  "company-sso",
  "phone",
  "migration",
] as const;

export const Route = createFileRoute("/_app/settings")({
  validateSearch: z.object({
    section: z.enum(settingsSections).optional(),
    /** Gelöschte Elemente: the account to show first (from that account's trash). */
    account: z.string().max(64).optional(),
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  return <SettingsPage section={Route.useSearch().section} />;
}
