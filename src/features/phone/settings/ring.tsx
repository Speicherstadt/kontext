/**
 * Firmenverwaltung → Telefonie → Wer klingelt: the people who hear calls in Kontext (and may see
 * the list and call out), all at once or one after another, and a mobile phone that rings too
 * after a while.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { useCompany } from "@/company-core/queries";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { moved } from "@/lib/move";
import { readableNumber } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";

const STEPS = [10, 15, 20, 30];
const AFTER = [0, 10, 15, 20, 30, 45];

export const RingForm = ({ admin }: { admin: Admin }) => {
  const toast = useToast();
  const { data: company } = useCompany();
  const [chosen, setChosen] = useState(admin.ring);
  const [mode, setMode] = useState(admin.ringMode);
  const [stepSeconds, setStepSeconds] = useState(admin.ringStepSeconds);
  const [forwarding, setForwarding] = useState(Boolean(admin.forward));
  const [number, setNumber] = useState(admin.forward ? readableNumber(admin.forward.number) : "");
  const [afterSeconds, setAfterSeconds] = useState(admin.forward?.afterSeconds ?? 15);
  const save = useAdminChange(() =>
    send("PUT", "/ring", {
      members: chosen,
      mode,
      stepSeconds,
      forward: forwarding && number.trim() ? { number: number.trim(), afterSeconds } : null,
    }),
  );
  const employees = (company?.employees ?? []).filter((employee) => employee.active);
  const nameOf = (id: string) => employees.find((employee) => employee.id === id)?.fullName ?? id;
  return (
    <SettingsCard title={m.phone_ring()} description={m.phone_ring_hint()}>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{m.phone_ring()}</legend>
        {employees.map((employee) => (
          <label key={employee.id} className="flex items-center gap-2 text-[14px]">
            <Checkbox
              checked={chosen.includes(employee.id)}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, employee.id]
                    : current.filter((id) => id !== employee.id),
                )
              }
            />
            {employee.fullName}
          </label>
        ))}
      </fieldset>
      <Label>
        {m.phone_ring_mode()}
        <Select
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "all", label: m.phone_ring_all() },
            { value: "order", label: m.phone_ring_order() },
          ]}
        />
      </Label>
      {mode === "order" ? (
        <>
          <ol
            aria-label={m.phone_ring_sequence()}
            className="m-0 flex flex-col gap-1 pl-5 text-[14px]"
          >
            {chosen.map((id, index) => (
              <li key={id}>
                <span className="flex items-center gap-1">
                  <span className="flex-1">{nameOf(id)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={m.phone_ring_up({ name: nameOf(id) })}
                    disabled={index === 0}
                    onClick={() => setChosen((current) => moved(current, index, -1))}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={m.phone_ring_down({ name: nameOf(id) })}
                    disabled={index === chosen.length - 1}
                    onClick={() => setChosen((current) => moved(current, index, 1))}
                  >
                    <ArrowDown size={14} />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          <Label>
            {m.phone_ring_step()}
            <Select
              value={String(stepSeconds)}
              onValueChange={(seconds) => setStepSeconds(Number(seconds))}
              options={STEPS.map((seconds) => ({
                value: String(seconds),
                label: m.phone_seconds({ seconds }),
              }))}
            />
          </Label>
        </>
      ) : null}
      <label className="flex items-center gap-2 text-[14px]">
        <Checkbox checked={forwarding} onChange={(event) => setForwarding(event.target.checked)} />
        {m.phone_forward()}
      </label>
      {forwarding ? (
        <div className="flex flex-wrap gap-2">
          <Label className="min-w-0 flex-1">
            {m.phone_forward_number()}
            <Input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              inputMode="tel"
              placeholder="0171 1234567"
            />
          </Label>
          <Label>
            {m.phone_forward_after()}
            <Select
              value={String(afterSeconds)}
              onValueChange={(seconds) => setAfterSeconds(Number(seconds))}
              options={AFTER.map((seconds) => ({
                value: String(seconds),
                label: seconds ? m.phone_seconds({ seconds }) : m.phone_forward_at_once(),
              }))}
            />
          </Label>
        </div>
      ) : null}
      {forwarding ? <p className="m-0 text-[12px] text-muted">{m.phone_forward_hint()}</p> : null}
      <Button
        variant="primary"
        className="self-start"
        disabled={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast.show(m.company_saved());
        }}
      >
        {m.company_save()}
      </Button>
    </SettingsCard>
  );
};
