/**
 * A new masked address: what it is for, optionally the website, the start of the address and how
 * long it lives. Stalwart makes the address (src/jmap/masked-email.ts); it is shown once made.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createMaskedEmail,
  EXPIRY_CHOICES,
  type Expiry,
  isValidPrefix,
  type NewMaskedEmail,
} from "@/jmap/masked-email";
import { m } from "@/paraglide/messages";

export const MASKED_KEY = ["settings", "masked-email"];

const EXPIRY_LABEL: Record<Expiry, () => string> = {
  never: m.masked_expiry_never,
  day: m.masked_expiry_day,
  week: m.masked_expiry_week,
  month: m.masked_expiry_month,
  year: m.masked_expiry_year,
};

const EMPTY: NewMaskedEmail = { description: "", site: "", prefix: "", expiry: "never" };

export const NewMaskedEmailForm = ({ onCreated }: { onCreated: (email: string) => void }) => {
  const client = useClient();
  const [input, setInput] = useState<NewMaskedEmail>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (value: NewMaskedEmail) => createMaskedEmail(client, value),
    onSettled: () => queryClient.invalidateQueries({ queryKey: MASKED_KEY }),
  });
  const prefixOk = isValidPrefix(input.prefix.trim());
  const change = (field: keyof NewMaskedEmail) => (value: string) =>
    setInput((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prefixOk) return;
    setProblem(null);
    try {
      onCreated(await create.mutateAsync(input));
      setInput(EMPTY);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-t border-border pt-4">
      <h4 className="m-0 text-[14px] font-semibold">{m.masked_add()}</h4>
      <Label>
        {m.masked_description()}
        <Input
          value={input.description}
          onChange={(e) => change("description")(e.target.value)}
          placeholder={m.masked_description_placeholder()}
          maxLength={100}
          required
        />
      </Label>
      <Label>
        {m.masked_site()}
        <Input
          value={input.site}
          onChange={(e) => change("site")(e.target.value)}
          placeholder={m.masked_site_placeholder()}
          maxLength={255}
        />
      </Label>
      <Label>
        {m.masked_prefix()}
        <Input
          value={input.prefix}
          onChange={(e) => change("prefix")(e.target.value)}
          aria-invalid={!prefixOk}
          maxLength={64}
          autoCapitalize="none"
          spellCheck={false}
        />
        <span className={prefixOk ? "text-[12px]" : "text-[12px] text-danger"}>
          {prefixOk ? m.masked_prefix_hint() : m.masked_prefix_invalid()}
        </span>
      </Label>
      <Label>
        {m.masked_expiry()}
        <Select
          value={input.expiry}
          onValueChange={change("expiry")}
          options={EXPIRY_CHOICES.map((choice) => ({
            value: choice,
            label: EXPIRY_LABEL[choice](),
          }))}
        />
      </Label>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        className="self-start"
        disabled={create.isPending || !prefixOk}
      >
        {m.masked_create()}
      </Button>
    </form>
  );
};
