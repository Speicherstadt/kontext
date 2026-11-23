/**
 * Firmenverwaltung → Telefonie → Mailbox: when nobody answers in time, the box picks up, plays the
 * greeting and records a message, which arrives as a mail in the chosen mailbox and stays at the
 * call in Kontext.
 */
import { useState } from "react";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";
import { OwnerSelect } from "./owner-select";
import { SoundSelect } from "./sounds";

const RING_SECONDS = [15, 20, 25, 30, 45, 60];

export const MailboxForm = ({
  mailbox,
  sounds,
}: {
  mailbox: Admin["mailbox"];
  sounds: Admin["sounds"];
}) => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(mailbox.enabled);
  const [ringSeconds, setRingSeconds] = useState(mailbox.ringSeconds);
  const [greeting, setGreeting] = useState(mailbox.greeting ?? "");
  const [deliverTo, setDeliverTo] = useState(mailbox.deliverTo ?? "");
  const save = useAdminChange(() =>
    send("PUT", "/mailbox", {
      enabled,
      ringSeconds,
      greeting: greeting || null,
      deliverTo: deliverTo || null,
    }),
  );
  return (
    <SettingsCard title={m.phone_mailbox()} description={m.phone_mailbox_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        {m.phone_mailbox_enabled()}
      </label>
      <Label>
        {m.phone_mailbox_after()}
        <Select
          value={String(ringSeconds)}
          onValueChange={(seconds) => setRingSeconds(Number(seconds))}
          options={RING_SECONDS.map((seconds) => ({
            value: String(seconds),
            label: m.phone_mailbox_seconds({ seconds }),
          }))}
          disabled={!enabled}
        />
      </Label>
      <Label>
        {m.phone_mailbox_greeting()}
        <SoundSelect
          sounds={sounds}
          none={m.phone_mailbox_beep_only()}
          value={greeting}
          onValueChange={setGreeting}
          disabled={!enabled}
        />
      </Label>
      <Label>
        {m.phone_mailbox_deliver()}
        <OwnerSelect
          none={m.phone_mailbox_deliver_none()}
          value={deliverTo}
          onValueChange={setDeliverTo}
          disabled={!enabled}
        />
      </Label>
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
