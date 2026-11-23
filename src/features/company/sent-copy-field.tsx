/** „Gesendete Mails ablegen“ of a shared mailbox (lib/sent-copy.ts), in its dialog. */
import { Label } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { DEFAULT_SENT_COPY, type SentCopy } from "@/lib/sent-copy";
import { m } from "@/paraglide/messages";

const choices = (): SelectOption<SentCopy>[] => [
  {
    value: "group",
    label: m.company_sent_copy_group(),
    hint: m.company_sent_copy_group_hint(),
    badge: m.company_default(),
  },
  { value: "both", label: m.company_sent_copy_both(), hint: m.company_sent_copy_both_hint() },
  {
    value: "sender",
    label: m.company_sent_copy_sender(),
    hint: m.company_sent_copy_sender_hint(),
  },
];

export const SentCopyField = ({
  value = DEFAULT_SENT_COPY,
  onChange,
}: {
  value?: SentCopy;
  onChange: (value: SentCopy) => void;
}) => (
  <Label>
    {m.company_sent_copy()}
    <Select value={value} onValueChange={onChange} options={choices()} />
  </Label>
);
