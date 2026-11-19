/**
 * Gelöschte Konten under Mitarbeiter, only with Stalwart Enterprise: how long Stalwart keeps a
 * deleted account, and those it still keeps, each with "Wiederherstellen".
 */
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import {
  type DeletedAccount,
  type DeletedAccountsView,
  restoreDeletedAccount,
  saveDeletedAccountsRetention,
} from "./api";
import { formatDay, useDeletedAccounts } from "./deleted-accounts";
import { Badge, ConfirmButton, PasswordNotice } from "./fields";
import { useCompanyChange } from "./queries";

export const DeletedAccountsSection = () => {
  const view = useDeletedAccounts();
  if (!view) return null;
  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard
        title={m.company_deleted_accounts()}
        description={m.company_deleted_accounts_hint()}
      >
        <RetentionForm days={view.retentionDays ?? 0} />
        <DeletedList view={view} />
      </SettingsCard>
    </div>
  );
};

const RetentionForm = ({ days }: { days: number }) => {
  const toast = useToast();
  const save = useCompanyChange(saveDeletedAccountsRetention);
  const [chosen, setChosen] = useState(String(days));
  const value = Number(chosen);
  const valid = Number.isInteger(value) && value >= 0 && value <= 3650;

  const submit = async () => {
    try {
      await save.mutateAsync(value);
      toast.show(m.company_deleted_retention_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Label className="flex-1">
          {m.company_deleted_retention()}
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
          />
        </Label>
        <Button
          variant="primary"
          disabled={save.isPending || !valid || value === days}
          onClick={() => void submit()}
        >
          {m.company_save()}
        </Button>
      </div>
      <p className="m-0 text-[12px] text-muted">{m.company_deleted_retention_hint()}</p>
    </div>
  );
};

const DeletedList = ({ view }: { view: DeletedAccountsView }) => {
  const [restored, setRestored] = useState<{ name: string; password: string } | null>(null);
  return (
    <>
      {view.retentionDays ? null : (
        <p className="m-0 text-[13px] text-warn">{m.company_deleted_accounts_off()}</p>
      )}
      {restored ? <PasswordNotice name={restored.name} password={restored.password} /> : null}
      {view.accounts.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
          {view.accounts.map((account) => (
            <DeletedRow key={account.id} account={account} onPassword={setRestored} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.company_deleted_accounts_empty()}</p>
      )}
    </>
  );
};

const DeletedRow = ({
  account,
  onPassword,
}: {
  account: DeletedAccount;
  onPassword: (restored: { name: string; password: string }) => void;
}) => {
  const toast = useToast();
  const restore = useCompanyChange(() => restoreDeletedAccount(account.id));
  const name = account.email;

  const run = async () => {
    try {
      const { password } = await restore.mutateAsync(undefined);
      if (password) onPassword({ name, password });
      toast.show(m.company_restored({ name }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center md:px-4">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
          <span className="truncate">{name}</span>
          {account.kind === "mailbox" ? <Badge>{m.company_deleted_mailbox()}</Badge> : null}
        </span>
        <span className="text-[13px] text-muted">
          {m.company_deleted_meta({
            deleted: formatDay(account.deletedAt),
            purge: formatDay(account.purgeAt),
          })}
        </span>
      </span>
      <ConfirmButton
        label={m.company_restore()}
        question={m.company_restore_confirm({ name })}
        disabled={restore.isPending}
        onConfirm={() => void run()}
      />
    </li>
  );
};
