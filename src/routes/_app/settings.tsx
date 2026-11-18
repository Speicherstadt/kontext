import { createFileRoute } from "@tanstack/react-router";
import { settingsSections } from "@/features/settings/sections";
import { SettingsPage } from "@/features/settings/settings-page";
import { z } from "@/lib/zod";

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
