/**
 * Andere Programme und Handys: Aufgabenlisten über CalDAV (server/dav/routes.ts) und, wenn in der
 * Firmenverwaltung eingeschaltet, Outlook und Handy-Apps über Exchange / ActiveSync
 * (server/company/exchange.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useSession } from "@/auth/session";
import { getExchange } from "@/company-core/api";
import { SettingsCard } from "@/components/settings-card";
import { Button } from "@/components/ui/button";
import { EXCHANGE_QUERY_KEY } from "@/features/company/exchange-section";
import { m } from "@/paraglide/messages";

const Steps = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <h4 className="m-0 text-[14px] font-medium">{title}</h4>
    <ol className="m-0 flex flex-col gap-1 pl-5 text-[13px] text-muted">{children}</ol>
  </div>
);

const ExchangeGuide = ({ user, host }: { user: string; host: string }) => (
  <SettingsCard title={m.sync_exchange_title()} description={m.sync_exchange_hint()}>
    <p className="m-0 text-[13px] text-muted">{m.sync_exchange_credentials({ user, host })}</p>
    <Steps title={m.sync_exchange_outlook_title()}>
      <li>{m.sync_exchange_outlook_1()}</li>
      <li>{m.sync_exchange_outlook_2({ user })}</li>
      <li>{m.sync_exchange_outlook_3({ host })}</li>
    </Steps>
    <Steps title={m.sync_exchange_iphone_title()}>
      <li>{m.sync_exchange_iphone_1()}</li>
      <li>{m.sync_exchange_iphone_2({ user })}</li>
      <li>{m.sync_exchange_iphone_3({ host, user })}</li>
    </Steps>
    <Steps title={m.sync_exchange_android_title()}>
      <li>{m.sync_exchange_android_1()}</li>
      <li>{m.sync_exchange_android_2({ user, host })}</li>
    </Steps>
    <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">
      {m.sync_exchange_app_password()}
    </p>
  </SettingsCard>
);

export const SyncSection = () => {
  const { data: session } = useSession();
  const { data: exchange } = useQuery({
    queryKey: EXCHANGE_QUERY_KEY,
    queryFn: getExchange,
  });
  const address = `${window.location.origin}/dav/`;
  const host = window.location.host;
  const user = session?.username ?? "";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      {exchange?.enabled ? <ExchangeGuide user={user} host={host} /> : null}
      <SettingsCard title={m.sync_title()} description={m.sync_hint()}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">{m.sync_address()}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-subtle px-3 py-2 font-mono text-[13px]">
              {address}
            </code>
            <Button variant="outline" onClick={() => void copy()} aria-label={m.sync_copy()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? m.sync_copied() : m.sync_copy()}
            </Button>
          </div>
          <span className="text-[12px] text-muted">{m.sync_login({ user })}</span>
        </div>
        <Steps title="Thunderbird">
          <li>{m.sync_thunderbird_1()}</li>
          <li>{m.sync_thunderbird_2()}</li>
          <li>{m.sync_thunderbird_3()}</li>
        </Steps>
        <Steps title="Android">
          <li>{m.sync_android_1()}</li>
          <li>{m.sync_android_2()}</li>
        </Steps>
        <Steps title="iPhone und iPad">
          <li>{m.sync_apple_1()}</li>
          <li>{m.sync_apple_2({ host })}</li>
        </Steps>
        <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">
          {m.sync_two_factor()}
        </p>
      </SettingsCard>
    </div>
  );
};
