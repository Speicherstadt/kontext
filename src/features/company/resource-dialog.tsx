/** Dialog zum Anlegen, Bearbeiten und Löschen eines Raums oder Geräts in der Firmenverwaltung. */
import { type FormEvent, useState } from "react";
import {
  type Company,
  createResource,
  deleteResource,
  type Resource,
  type ResourceBooking,
  type ResourceKind,
  updateResource,
} from "@/company-core/api";
import { useCompanyChange } from "@/company-core/queries";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { AddressInput, ConfirmButton } from "./fields";

type FormState = {
  local: string;
  domainId: string;
  description: string;
  kind: ResourceKind;
  location: string;
  capacity: string;
  delegateIds: string[];
  mode: "automatic" | "manual";
  allowConflicts: boolean;
  allowRecurring: boolean;
  allowExternal: boolean;
  bookingWindowDays: string;
  maxDurationMinutes: string;
};

const initialForm = (company: Company, resource?: Resource): FormState => {
  const auto = resource?.booking.mode === "automatic" ? resource.booking : null;
  return {
    local: resource?.name ?? "",
    domainId: company.domains[0]?.id ?? "",
    description: resource?.description ?? "",
    kind: resource?.kind ?? "room",
    location: resource?.location ?? "",
    capacity: resource?.capacity ? String(resource.capacity) : "",
    delegateIds: resource?.delegateIds ?? [],
    mode: resource?.booking.mode ?? "automatic",
    allowConflicts: auto?.allowConflicts ?? false,
    allowRecurring: auto?.allowRecurring ?? true,
    allowExternal: auto?.allowExternal ?? false,
    bookingWindowDays: auto?.bookingWindowDays ? String(auto.bookingWindowDays) : "",
    maxDurationMinutes: auto?.maxDurationMinutes ? String(auto.maxDurationMinutes) : "",
  };
};

const positiveInt = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toBooking = (form: FormState): ResourceBooking =>
  form.mode === "manual"
    ? { mode: "manual" }
    : {
        mode: "automatic",
        allowConflicts: form.allowConflicts,
        allowRecurring: form.allowRecurring,
        allowExternal: form.allowExternal,
        bookingWindowDays: positiveInt(form.bookingWindowDays),
        maxDurationMinutes: positiveInt(form.maxDurationMinutes),
      };

const CheckOption = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => (
  <label className="flex items-center gap-2 text-[14px]">
    <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const BookingFields = ({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (patch: Partial<FormState>) => void;
}) => (
  <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
    <div className="flex flex-col gap-1">
      <Label htmlFor="resource-booking">{m.company_resource_booking()}</Label>
      <Select
        id="resource-booking"
        value={form.mode}
        onValueChange={(mode) => setForm({ mode: mode as "automatic" | "manual" })}
        options={[
          { value: "automatic", label: m.company_resource_booking_auto() },
          { value: "manual", label: m.company_resource_booking_manual() },
        ]}
      />
    </div>
    {form.mode === "automatic" ? (
      <div className="flex flex-col gap-2">
        <CheckOption
          checked={form.allowConflicts}
          onChange={(allowConflicts) => setForm({ allowConflicts })}
          label={m.company_resource_allow_conflicts()}
        />
        <CheckOption
          checked={form.allowRecurring}
          onChange={(allowRecurring) => setForm({ allowRecurring })}
          label={m.company_resource_allow_recurring()}
        />
        <CheckOption
          checked={form.allowExternal}
          onChange={(allowExternal) => setForm({ allowExternal })}
          label={m.company_resource_allow_external()}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="resource-window">{m.company_resource_window_days()}</Label>
            <Input
              id="resource-window"
              type="number"
              min={1}
              max={3650}
              value={form.bookingWindowDays}
              onChange={(e) => setForm({ bookingWindowDays: e.target.value })}
              placeholder={m.company_resource_unlimited()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="resource-max-duration">{m.company_resource_max_duration()}</Label>
            <Input
              id="resource-max-duration"
              type="number"
              min={1}
              max={43200}
              value={form.maxDurationMinutes}
              onChange={(e) => setForm({ maxDurationMinutes: e.target.value })}
              placeholder={m.company_resource_unlimited()}
            />
          </div>
        </div>
      </div>
    ) : null}
  </div>
);

const ResourceBasics = ({
  company,
  resource,
  form,
  setForm,
}: {
  company: Company;
  resource?: Resource;
  form: FormState;
  setForm: (patch: Partial<FormState>) => void;
}) => (
  <>
    <div className="flex flex-col gap-1">
      <Label htmlFor="resource-name">{m.company_resource_name()}</Label>
      <Input
        id="resource-name"
        value={form.description}
        onChange={(e) => setForm({ description: e.target.value })}
        required
      />
    </div>
    {resource ? (
      <p className="m-0 text-[13px] text-muted">{resource.email}</p>
    ) : (
      <AddressInput
        local={form.local}
        domainId={form.domainId}
        domains={company.domains}
        onChange={(local, domainId) => setForm({ local, domainId })}
      />
    )}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="resource-kind">{m.company_resource_kind()}</Label>
        <Select
          id="resource-kind"
          value={form.kind}
          onValueChange={(kind) => setForm({ kind: kind as ResourceKind })}
          options={[
            { value: "room", label: m.company_resource_kind_room() },
            { value: "equipment", label: m.company_resource_kind_equipment() },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="resource-location">{m.company_resource_location()}</Label>
        <Input
          id="resource-location"
          value={form.location}
          onChange={(e) => setForm({ location: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="resource-capacity">{m.company_resource_capacity()}</Label>
        <Input
          id="resource-capacity"
          type="number"
          min={1}
          max={10000}
          value={form.capacity}
          onChange={(e) => setForm({ capacity: e.target.value })}
        />
      </div>
    </div>
  </>
);

const DelegatesField = ({
  company,
  selected,
  onChange,
}: {
  company: Company;
  selected: string[];
  onChange: (ids: string[]) => void;
}) => {
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...new Set([...selected, id])] : selected.filter((item) => item !== id));
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1 text-[13px] font-medium">{m.company_resource_delegates()}</legend>
      <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2.5">
        {company.employees.map((employee) => (
          <CheckOption
            key={employee.id}
            checked={selected.includes(employee.id)}
            onChange={(checked) => toggle(employee.id, checked)}
            label={`${employee.fullName} (${employee.email})`}
          />
        ))}
      </div>
    </fieldset>
  );
};

export const ResourceDialog = ({
  company,
  resource,
  onSaved,
  onClose,
}: {
  company: Company;
  resource?: Resource;
  onSaved: () => void;
  onClose: () => void;
}) => {
  const toast = useToast();
  const [form, setFormState] = useState<FormState>(() => initialForm(company, resource));
  const setForm = (patch: Partial<FormState>) => setFormState((prev) => ({ ...prev, ...patch }));
  const create = useCompanyChange(createResource);
  const update = useCompanyChange(updateResource);
  const remove = useCompanyChange(deleteResource);
  const busy = create.isPending || update.isPending || remove.isPending;
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const done = {
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: fail,
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const common = {
      description: form.description.trim(),
      kind: form.kind,
      capacity: positiveInt(form.capacity),
      location: form.location.trim(),
      delegateIds: form.delegateIds,
      booking: toBooking(form),
    };
    if (resource) update.mutate({ id: resource.id, ...common }, done);
    else {
      create.mutate(
        { local: form.local.trim().toLowerCase(), domainId: form.domainId, ...common },
        done,
      );
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={resource ? resource.description || resource.email : m.company_resource_new()}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ResourceBasics company={company} resource={resource} form={form} setForm={setForm} />
        <BookingFields form={form} setForm={setForm} />
        <DelegatesField
          company={company}
          selected={form.delegateIds}
          onChange={(delegateIds) => setForm({ delegateIds })}
        />
        <DialogActions>
          {resource ? (
            <ConfirmButton
              danger
              label={m.company_resource_delete()}
              question={m.company_resource_delete_confirm({
                name: resource.description || resource.email,
              })}
              disabled={busy}
              onConfirm={() => remove.mutate(resource.id, done)}
            />
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            {m.contacts_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {resource ? m.company_save() : m.company_create()}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
