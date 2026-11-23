/**
 * "Rückgängig" and "Nicht senden": stops a mail the server still holds and opens it again as a
 * draft. Too late (already out) says so instead. A copy made in the own Sent (`both`) goes too.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/directory/queries";
import { isJmapError } from "@/jmap/client";
import { removeSentCopies } from "@/jmap/sent-copy";
import { type HeldMail, unsend } from "@/jmap/submissions";
import { m } from "@/paraglide/messages";

export const useTakeBack = () => {
  const client = useClient();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  return useCallback(
    async (
      accountId: string,
      held: Pick<HeldMail, "submissionId" | "emailId">,
      draftsId: string,
    ) => {
      try {
        await unsend(client, accountId, held, draftsId);
        void queryClient.invalidateQueries({ queryKey: [accountId] });
        // Sent through a shared mailbox, a copy in the own Sent goes too (jmap/sent-copy.ts).
        if (accountId !== me) {
          const copy = { fromAccountId: accountId, emailId: held.emailId, accountId: me };
          await removeSentCopies(client, copy).catch((error) => console.warn("Kopie", error));
          void queryClient.invalidateQueries({ queryKey: [me] });
        }
        toast.show(m.mail_unsent());
        await navigate({
          to: "/mail/$accountId/$mailboxId",
          params: { accountId, mailboxId: draftsId },
          search: { compose: "draft", email: held.emailId },
        });
      } catch (error) {
        const late = isJmapError(error) && error.type === "cannotUnsend";
        toast.show(
          late ? m.mail_unsend_too_late() : m.common_error({ message: (error as Error).message }),
          "error",
        );
      }
    },
    [client, navigate, toast, queryClient, me],
  );
};
