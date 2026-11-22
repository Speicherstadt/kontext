/** The version at the foot of the account menus, small and grey; it leads to "Über Kontext". */
import { Link } from "@tanstack/react-router";
import { MenuItem } from "@/components/ui/menu";
import { APP_VERSION } from "@/features/settings/version";
import { m } from "@/paraglide/messages";

export const MenuVersion = () => (
  <MenuItem asChild>
    <Link
      to="/settings"
      search={{ section: "about" }}
      className="text-[12px] text-muted no-underline"
    >
      {m.pwa_version({ version: APP_VERSION })}
    </Link>
  </MenuItem>
);
