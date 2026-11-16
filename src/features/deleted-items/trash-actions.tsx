/**
 * Above the Papierkorb with Stalwart Enterprise: a way to what was deleted for good, beside
 * "Papierkorb leeren". Opens Einstellungen → Gelöschte Elemente on this account.
 */
import { Link } from "@tanstack/react-router";
import { ArchiveRestore } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { Mailbox } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import { useArchive } from "./queries";

/** Whether the trash of this account offers the deleted items (Enterprise, the caller's own). */
const useOffersDeleted = (accountId: string, mailbox: Mailbox): boolean => {
  const { data } = useArchive();
  return (
    mailbox.role === "trash" && Boolean(data?.accounts.some((account) => account.id === accountId))
  );
};

export const TrashActions = ({
  accountId,
  mailbox,
  children,
}: {
  accountId: string;
  mailbox: Mailbox;
  /** The other folder actions, e.g. "Papierkorb leeren". */
  children?: ReactNode;
}) => {
  const offers = useOffersDeleted(accountId, mailbox);
  if (!children && !offers) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {offers ? (
        <Link
          to="/settings"
          search={{ section: "deleted", account: accountId }}
          className={buttonVariants({ variant: "ghost", size: "sm", className: "no-underline" })}
        >
          <ArchiveRestore size={14} aria-hidden="true" /> {m.deleted_from_trash()}
        </Link>
      ) : null}
    </div>
  );
};
