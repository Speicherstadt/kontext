import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/auth/session";
import { CAPABILITIES } from "@/jmap/client";
import { listPrincipals, principalName } from "@/jmap/principals";

/** Everyone in the company (people and shared mailboxes); changes rarely. */
export const usePrincipals = () => {
  const client = useClient();
  const { data: session } = useSession();
  const accountId = session?.primaryAccounts[CAPABILITIES.principals];
  return useQuery({
    queryKey: [accountId, "principals"],
    queryFn: () => listPrincipals(client, accountId!),
    enabled: Boolean(accountId),
    staleTime: 10 * 60_000,
  });
};

/** The other people of the company (no shared mailboxes), by name. */
export const useColleagues = () => {
  const { data: session } = useSession();
  const { data = [], isPending } = usePrincipals();
  const colleagues = data
    .filter((p) => p.type === "individual" && p.email !== session?.username)
    .sort((a, b) => principalName(a).localeCompare(principalName(b), "de"));
  return { colleagues, isPending };
};

/** The signed-in person: their own account id, which is also how tasks are assigned. */
export const useMe = (): string => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.mail] ?? "";
};

/** The company's people, to assign a task to. */
export const usePeople = (): { id: string; name: string; email: string }[] => {
  const { data = [] } = usePrincipals();
  return (
    data
      .filter((principal) => principal.type === "individual")
      // The full name where Stalwart has one ("Jonas Weber"), else the login.
      .map((principal) => ({
        id: principal.id,
        name: principal.description || principal.name || principal.email || "",
        email: principal.email ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
  );
};
