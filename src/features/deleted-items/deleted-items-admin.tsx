/**
 * Gelöschte Elemente in the Firmenverwaltung (Stalwart Enterprise): an employee's or shared
 * mailbox's items from their row, and how many days Stalwart keeps what is deleted.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";
import { type ArchiveView, retentionDays, setRetentionDays } from "./api";
import { DeletedItemsList } from "./deleted-items-list";
import { RetentionNote } from "./deleted-items-section";
import { ARCHIVE_KEY, useArchive } from "./queries";

/** True once the server says the archive is there (Enterprise, admin asked). */
export const useArchiveAdmin = (): boolean => Boolean(useArchive().data?.admin);

/** The button in an employee's or mailbox's row or dialog; nothing without Enterprise. */
export const DeletedItemsButton = ({
  label,
  onOpen,
  compact,
}: {
  label: string;
  onOpen: () => void;
  compact?: boolean;
}) =>
  useArchiveAdmin() ? (
    <Button
      variant={compact ? "ghost" : "outline"}
      size={compact ? "sm" : "md"}
      className={compact ? "mr-2 shrink-0" : undefined}
      aria-label={label}
      onClick={onOpen}
    >
      <ArchiveRestore size={16} />{" "}
      <span className={compact ? "hidden sm:inline" : undefined}>{m.deleted_title()}</span>
    </Button>
  ) : null;

export const DeletedItemsDialog = ({
  accountId,
  name,
  onClose,
}: {
  accountId: string;
  name: string;
  onClose: () => void;
}) => (
  <Dialog
    open
    onOpenChange={(open) => !open && onClose()}
    title={m.deleted_of({ name })}
    description={m.deleted_admin_hint()}
    className="md:w-[min(640px,calc(100vw-32px))]"
  >
    <DeletedItemsList accountId={accountId} />
  </Dialog>
);

/** Only for the admin with Enterprise; the days Stalwart keeps deleted items (0: none). */
export const RetentionCard = () => {
  const { data } = useArchive();
  if (!data?.admin) return null;
  return <RetentionForm retention={data.retention} />;
};

const RetentionForm = ({ retention }: { retention: ArchiveView["retention"] }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const saved = retentionDays(retention.ms);
  const [days, setDays] = useState(String(saved));
  const value = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 3650;
  const save = useMutation({
    mutationFn: () => setRetentionDays(value),
    onSuccess: () => toast.show(m.company_saved()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ARCHIVE_KEY }),
  });
  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.deleted_retention_title()} description={m.deleted_retention_hint()}>
        {retention.known ? (
          <RetentionNote retention={retention} />
        ) : (
          <p className="m-0 text-[13px] text-danger">{m.deleted_retention_unknown()}</p>
        )}
        <Label>
          {m.deleted_retention_days()}
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="max-w-[160px]"
          />
        </Label>
        <div>
          <Button
            variant="primary"
            disabled={save.isPending || !valid || value === saved}
            onClick={() => save.mutate()}
          >
            {m.company_save()}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
};
