/**
 * Einstellungen → Gelöschte Elemente (Stalwart Enterprise): the own account's deleted items and
 * those of the shared mailboxes one is a member of, chosen above the list.
 */
import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useStalwartEdition } from "@/company-core/edition";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { m } from "@/paraglide/messages";
import { type ArchiveAccount, type ArchiveView, pickAccount, retentionDays } from "./api";
import { DeletedItemsList } from "./deleted-items-list";
import { useArchive } from "./queries";

/** What Stalwart keeps and for how long, or that it keeps nothing yet. */
export const RetentionNote = ({ retention }: { retention: ArchiveView["retention"] }) => {
  if (!retention.known) return null;
  const days = retentionDays(retention.ms);
  return (
    <p className="m-0 text-[13px] text-muted" data-testid="deleted-retention">
      {days === 0
        ? m.deleted_retention_off()
        : days === 1
          ? m.deleted_retention_one()
          : m.deleted_retention({ days })}
    </p>
  );
};

const AccountPicker = ({
  accounts,
  value,
  onChange,
}: {
  accounts: ArchiveAccount[];
  value: string;
  onChange: (id: string) => void;
}) => (
  <Label>
    {m.deleted_account()}
    <Select
      value={value}
      onValueChange={onChange}
      options={accounts.map((account) => ({
        value: account.id,
        label:
          account.kind === "own"
            ? m.deleted_account_own({ email: account.email })
            : m.deleted_account_shared({ email: account.email }),
      }))}
    />
  </Label>
);

export const DeletedItemsSection = () => {
  const edition = useStalwartEdition();
  const { data, error } = useArchive();
  const wanted = useSearch({ strict: false }).account;
  // Reached by its address in Community: a word instead of a list that never comes.
  if (edition && edition !== "enterprise")
    return <p className="m-0 text-[14px] text-muted">{m.deleted_community()}</p>;
  if (error)
    return (
      <p role="alert" className="m-0 text-[14px] text-danger">
        {m.common_error({ message: error.message })}
      </p>
    );
  if (!data) return <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>;
  return <DeletedItems view={data} wanted={wanted} />;
};

const DeletedItems = ({ view, wanted }: { view: ArchiveView; wanted?: string }) => {
  const [accountId, setAccountId] = useState(() => pickAccount(view.accounts, wanted));
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">{m.deleted_hint()}</p>
      <RetentionNote retention={view.retention} />
      {view.accounts.length > 1 && accountId ? (
        <AccountPicker accounts={view.accounts} value={accountId} onChange={setAccountId} />
      ) : null}
      {accountId ? (
        <DeletedItemsList key={accountId} accountId={accountId} />
      ) : (
        <p className="m-0 text-[14px] text-muted">{m.deleted_empty()}</p>
      )}
    </div>
  );
};
