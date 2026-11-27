/**
 * Exchange und ActiveSync in der Firmenverwaltung (unter „Sicherheit der Mails“): schaltet
 * Stalwarts `x:Exchange.enable` um (server/company/exchange.ts).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getExchange, setExchange } from "@/company-core/api";
import { useCompanyChange } from "@/company-core/queries";
import { SettingsCard } from "@/components/settings-card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";

export const EXCHANGE_QUERY_KEY = ["company", "exchange"] as const;

export const ExchangeSection = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: EXCHANGE_QUERY_KEY,
    queryFn: getExchange,
  });
  const toggle = useCompanyChange(setExchange);
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  if (!data) return null;

  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_exchange()} description={m.company_exchange_hint()}>
        {data.known ? null : (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {m.company_exchange_unknown()}
          </p>
        )}
        <Switch
          checked={data.enabled}
          disabled={!data.known || toggle.isPending}
          onChange={(enabled) =>
            toggle.mutate(enabled, {
              onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXCHANGE_QUERY_KEY }),
              onError: fail,
            })
          }
        >
          <span className="text-[14px]">{m.company_exchange_enabled()}</span>
        </Switch>
      </SettingsCard>
    </div>
  );
};
