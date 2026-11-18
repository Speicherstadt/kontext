import { createFileRoute } from "@tanstack/react-router";
import { MailPage } from "@/features/mail/mail-page";
import { mailSearchSchema } from "@/features/mail/search-params";

export const Route = createFileRoute("/_app/mail/$accountId/$mailboxId")({
  validateSearch: mailSearchSchema,
  component: MailRoute,
});

function MailRoute() {
  const { accountId, mailboxId } = Route.useParams();
  const search = Route.useSearch();
  return <MailPage accountId={accountId} mailboxParam={mailboxId} search={search} />;
}
