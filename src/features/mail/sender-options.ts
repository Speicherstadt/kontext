/**
 * The senders of the composer as choices: the login address first, then the account's other
 * addresses (aliases, and the addresses of the shared mailboxes one belongs to, which go out
 * through that mailbox), then one's other mailboxes (Gmail, GMX, …). In a shared mailbox the
 * mailbox's addresses. Wherever a mail goes out through a shared mailbox, its option says the
 * name the recipient will see ("Jonas Weber (Info)").
 */
import type { SelectEntry, SelectOption } from "@/components/ui/select";
import { externalIdOf } from "@/external-accounts/api";
import type { Identity } from "@/jmap/types";
import { sameAddress } from "@/lib/addresses";
import { sharedSenderName } from "@/lib/compose";

export type SenderTexts = {
  own: string;
  other: string;
  alias: string;
  group: string;
  appearsAs: (name: string) => string;
};

type Context = {
  /** The address signed in with; its identity comes first and has no badge. */
  login: string;
  /**
   * The addresses of shared mailboxes (group accounts); one may send as them. `sendsAs`: the name
   * the recipient sees when the mail goes out through that mailbox (lib/send-route.ts).
   */
  groups: { email: string; sendsAs?: string }[];
  /** Set when writing from a shared mailbox: its name and the person writing. */
  shared: { mailbox: string; person: string } | null;
  texts: SenderTexts;
};

const option = (identity: Identity, hint: string, badge?: string): SelectOption => ({
  value: identity.id,
  label: identity.name || identity.email,
  hint: identity.name ? hint : undefined,
  badge,
});

const byLoginFirst = (login: string) => (a: Identity, b: Identity) =>
  Number(sameAddress(b.email, login)) - Number(sameAddress(a.email, login));

export const senderOptions = (identities: Identity[], context: Context): SelectEntry[] => {
  const { login, groups, shared, texts } = context;
  if (shared) {
    const options = identities.map((identity) => {
      const name = sharedSenderName(shared.person, identity.name);
      return {
        ...option(identity, identity.email),
        hint: `${identity.email} · ${texts.appearsAs(name)}`,
      };
    });
    return [{ label: shared.mailbox, options }];
  }
  const own = identities.filter((identity) => !externalIdOf(identity)).sort(byLoginFirst(login));
  const other = identities.filter((identity) => externalIdOf(identity));
  const groupOf = (email: string) => groups.find((group) => sameAddress(group.email, email));
  const badgeOf = (email: string) => {
    if (sameAddress(email, login)) return undefined;
    return groupOf(email) ? texts.group : texts.alias;
  };
  const hintOf = (email: string) => {
    const sendsAs = groupOf(email)?.sendsAs;
    return sendsAs ? `${email} · ${texts.appearsAs(sendsAs)}` : email;
  };
  const ownOptions = own.map((identity) =>
    option(identity, hintOf(identity.email), badgeOf(identity.email)),
  );
  if (!other.length) return ownOptions;
  return [
    { label: texts.own, options: ownOptions },
    { label: texts.other, options: other.map((identity) => option(identity, identity.email)) },
  ];
};
