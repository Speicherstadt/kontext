/**
 * A shared mailbox or a person of the company, by account id: where tasks or mails from the
 * telephone go.
 */
import type { ComponentProps } from "react";
import { useCompany } from "@/company-core/queries";
import { Select } from "@/components/ui/select";

export const OwnerSelect = ({
  none,
  ...props
}: { none: string } & Omit<ComponentProps<typeof Select>, "options">) => {
  const { data: company } = useCompany();
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <Select
      {...props}
      options={[
        { value: "", label: none },
        ...(company?.mailboxes ?? []).map((mailbox) => ({
          value: mailbox.id,
          label: mailbox.email,
        })),
        ...people.map((employee) => ({
          value: employee.id,
          label: employee.fullName,
          hint: employee.email,
        })),
      ]}
    />
  );
};
