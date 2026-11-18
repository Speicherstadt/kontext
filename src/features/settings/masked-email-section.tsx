/**
 * Settings → Maskierte Adressen: an address of its own for each website, switched off or deleted
 * when spam comes (src/jmap/masked-email.ts). Every edition of Stalwart has them since 1.1.1; an
 * older Community Stalwart refuses them with "forbidden", and the page then says what is needed.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/features/company/fields";
import {
  deleteMaskedEmail,
  isUnavailable,
  listMaskedEmails,
  type MaskedEmail,
  maskedState,
  setMaskedEmailEnabled,
} from "@/jmap/masked-email";
import { cn } from "@/lib/cn";
import { readingDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { MASKED_KEY, NewMaskedEmailForm } from "./masked-email-form";
import { useSave } from "./queries";
import { SettingsCard } from "./settings-page";

const CopyButton = ({ email }: { email: string }) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(email).catch(() => undefined);
    toast.show(m.masked_copied());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" onClick={() => void copy()} aria-label={m.masked_copy({ email })}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </Button>
  );
};

/** For which site, and until when: one line under the address. */
const details = (entry: MaskedEmail, now: Date): string => {
  const state = maskedState(entry, now);
  const parts = [
    [entry.description, entry.forDomain].filter(Boolean).join(" · "),
    m.agents_created({ date: readingDate(entry.createdAt) }),
    entry.expiresAt
      ? (state === "expired" ? m.masked_expired : m.masked_expires)({
          date: readingDate(entry.expiresAt),
        })
      : "",
    state === "off" ? m.masked_off() : "",
  ];
  return parts.filter(Boolean).join(" · ");
};

const MaskedEmailRow = ({ entry }: { entry: MaskedEmail }) => {
  const client = useClient();
  const toast = useToast();
  const toggle = useSave(
    (enable: boolean) => setMaskedEmailEnabled(client, entry.id, enable),
    [MASKED_KEY],
  );
  const remove = useSave(() => deleteMaskedEmail(client, entry.id), [MASKED_KEY]);
  const failed = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const expired = maskedState(entry, new Date()) === "expired";
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        <span
          className={cn("text-[14px] font-medium break-all", expired && "text-muted line-through")}
        >
          {entry.email}
        </span>
        <span className="text-[12px] text-muted">{details(entry, new Date())}</span>
      </div>
      <CopyButton email={entry.email} />
      <Switch
        checked={entry.enable}
        label={m.masked_active({ email: entry.email })}
        disabled={toggle.isPending || expired}
        onChange={(enable) => toggle.mutate(enable, { onError: failed })}
      />
      <ConfirmButton
        danger
        label={m.masked_delete()}
        question={m.masked_delete_question({ email: entry.email })}
        disabled={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onError: failed })}
      />
    </li>
  );
};

export const MaskedEmailSection = () => {
  const client = useClient();
  const toast = useToast();
  const { data: list, error } = useQuery({
    queryKey: MASKED_KEY,
    queryFn: () => listMaskedEmails(client),
    retry: false,
  });
  return (
    <SettingsCard title={m.settings_masked()} description={m.masked_hint()}>
      {isUnavailable(error) ? (
        <p className="m-0 text-[14px] text-muted">{m.masked_unavailable()}</p>
      ) : error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {m.common_error({ message: error.message })}
        </p>
      ) : list?.length ? (
        <ul aria-label={m.masked_list()} className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((entry) => (
            <MaskedEmailRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : list ? (
        <p className="m-0 text-[13px] text-muted">{m.masked_none()}</p>
      ) : null}
      {isUnavailable(error) ? null : (
        <NewMaskedEmailForm onCreated={(email) => toast.show(m.masked_created({ email }))} />
      )}
    </SettingsCard>
  );
};
