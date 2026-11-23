/**
 * Deleting a person's account. Final in Stalwart Community; with Stalwart Enterprise and a
 * retention it says how long the account can still be restored (deleted-accounts.ts).
 */
import { useState } from "react";
import { deleteEmployee, type Employee } from "@/company-core/api";
import { useCompanyChange } from "@/company-core/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { type DeleteOutcome, deleteOutcome, useDeletedAccounts } from "./deleted-accounts";

const noticeOf = (outcome: DeleteOutcome, name: string): string => {
  if (outcome.kind === "final") return m.company_delete_final({ name });
  return outcome.days === 1
    ? m.company_delete_recoverable_one({ name })
    : m.company_delete_recoverable({ name, days: outcome.days });
};

export const DeleteEmployeeDialog = ({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) => {
  const toast = useToast();
  const name = employee.fullName;
  const outcome = deleteOutcome(useDeletedAccounts());
  const [problem, setProblem] = useState<string | null>(null);
  const remove = useCompanyChange(() => deleteEmployee(employee.id));

  const submit = async () => {
    setProblem(null);
    try {
      await remove.mutateAsync(undefined);
      toast.show(m.company_deleted({ name }));
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.company_delete_title({ name })}
      description={employee.email}
    >
      <p className="m-0 text-[14px]" data-testid="delete-notice">
        {noticeOf(outcome, name)}
      </p>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <DialogActions>
        <Button variant="ghost" onClick={onClose}>
          {m.company_cancel()}
        </Button>
        <Button variant="danger" disabled={remove.isPending} onClick={() => void submit()}>
          {outcome.kind === "final" ? m.company_delete_final_run() : m.company_delete_run()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
