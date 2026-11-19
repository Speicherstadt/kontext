/** The middle column for one folder of one account. */
import { Users } from "lucide-react";
import { useCallback, useMemo } from "react";
import { usePersonalAccountId } from "@/account/queries";
import type { MailSearch } from "@/features/mail/search-params";
import type { Mailbox } from "@/jmap/types";
import { acceptsImport } from "@/lib/eml-import";
import { pinResurfaced, resurfacedFilter } from "@/lib/inboxes";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxName, mailboxRights } from "@/lib/mailboxes";
import { useThreadView } from "@/mail-core/thread-view";
import { m } from "@/paraglide/messages";
import { TrashActions } from "../deleted-items/trash-actions";
import { RESURFACED, useSnoozes } from "../snooze/queries";
import { EmlImportButton, useEmlImport } from "./eml-import";
import { canEmpty, EmptyFolder } from "./empty-folder";
import { FilterChips, ListFrame, type Row } from "./list-frame";
import { useEmailList, useHeldMails, useMailAccounts } from "./queries";
import { useMailSort } from "./sort-setting";

type Props = { accountId: string; mailbox: Mailbox; search: MailSearch };

/** The folder's mails as rows: Wiedervorlage pinned in the inbox, its dates in its own folder, "Geplant" in Sent. */
const useFolderRows = (
  accountId: string,
  mailbox: Mailbox,
  search: MailSearch,
  assigned: Assigned,
  me?: string | null,
) => {
  const filter = useMemo(
    () => ({
      mailboxId: mailbox.id,
      unreadOnly: search.unread,
      assignment: assigned && me ? { view: assigned, me } : undefined,
    }),
    [mailbox.id, search.unread, assigned, me],
  );
  const list = useEmailList(accountId, filter, { collapse: useThreadView(), sort: useMailSort() });
  // In the inbox, what came back from Wiedervorlage and is not read yet: on top, by itself.
  const isInbox = mailbox.role === "inbox";
  const backFilter = useMemo(() => resurfacedFilter(mailbox.id, RESURFACED), [mailbox.id]);
  // Not in an assignment view: what came back belongs to anyone (or is done).
  const back = useEmailList(isInbox && !assigned ? accountId : "", backFilter);
  // On Wiedervorlage: when each comes back, the next first.
  const isSnoozed = mailbox.role === "snoozed";
  const snoozes = useSnoozes(isSnoozed ? accountId : "");
  // In Sent, what the server still holds: marked in the list, or on its own ("Geplant").
  const isSent = mailbox.role === "sent";
  const held = useHeldMails(isSent ? accountId : "");
  const scheduled = isSent && Boolean(search.scheduled);
  const rows = useMemo((): Row[] => {
    const sendAt = new Map(held.map((mail) => [mail.emailId, mail.sendAt]));
    if (scheduled) {
      return held.flatMap((mail) =>
        mail.email ? [{ email: mail.email, sendAt: mail.sendAt }] : [],
      );
    }
    const listed: Row[] =
      list.data?.pages.flatMap((page) =>
        page.emails.map((email) => ({ email, sendAt: sendAt.get(email.id) })),
      ) ?? [];
    if (isSnoozed) {
      const until = (row: Row) => row.snoozedUntil ?? "\uffff";
      return listed
        .map((row) => ({ ...row, snoozedUntil: snoozes.get(row.email.id) }))
        .sort((a, b) => until(a).localeCompare(until(b)));
    }
    const backRows: Row[] = isInbox
      ? (back.data?.pages.flatMap((page) => page.emails.map((email) => ({ email }))) ?? [])
      : [];
    return pinResurfaced(backRows, listed, {
      back: m.mail_resurfaced(),
      rest: m.mail_resurfaced_rest(),
    });
  }, [list.data, held, scheduled, isSnoozed, snoozes, isInbox, back.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onNearEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { rows, list, onNearEnd, held, scheduled, isSnoozed, isSent };
};

type Assigned = MailSearch["assigned"];

/** A shared mailbox: "Alle / Ungelesen / Mir zugewiesen / Offen"; Sent: "Alle / Geplant". */
const folderFilters = (
  shared: boolean,
  isSent: boolean,
  search: MailSearch,
  assigned: Assigned,
  heldCount: number,
) => {
  if (shared && !isSent)
    return (
      <FilterChips
        options={[
          {
            label: m.mail_filter_all(),
            on: !search.unread && !assigned,
            set: { unread: undefined, assigned: undefined },
          },
          {
            label: m.mail_filter_unread(),
            on: Boolean(search.unread) && !assigned,
            set: { unread: true, assigned: undefined },
          },
          {
            label: m.mail_filter_mine(),
            on: assigned === "mine",
            set: { unread: undefined, assigned: "mine" },
          },
          {
            label: m.mail_filter_open(),
            on: assigned === "open",
            set: { unread: undefined, assigned: "open" },
          },
        ]}
      />
    );
  if (!isSent) return undefined;
  const scheduled = Boolean(search.scheduled);
  return (
    <FilterChips
      options={[
        { label: m.mail_filter_all(), on: !scheduled, set: { scheduled: undefined } },
        {
          label: heldCount
            ? m.mail_filter_scheduled_count({ count: heldCount })
            : m.mail_filter_scheduled(),
          on: scheduled,
          set: { scheduled: true },
        },
      ]}
    />
  );
};

/** What an empty list says, where it is not the usual "Keine E-Mails". */
const emptyText = (scheduled: boolean, isSnoozed: boolean, assigned: Assigned) => {
  if (scheduled) return m.mail_scheduled_empty();
  if (isSnoozed) return m.mail_snoozed_empty();
  if (assigned === "mine") return m.mail_mine_empty();
  if (assigned === "open") return m.mail_open_empty();
  return undefined;
};

/** Files dropped on the list: .eml imported into the folder, where it takes them. */
const useDropFiles = (accountId: string, mailbox: Mailbox) => {
  const importEml = useEmlImport();
  return acceptsImport(mailbox)
    ? (files: File[]) => void importEml({ accountId, mailboxId: mailbox.id }, files)
    : undefined;
};

export const MessageList = ({ accountId, mailbox, search }: Props) => {
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const me = usePersonalAccountId();
  const shared = Boolean(account && !account.isPersonal);
  const assigned = shared && me ? search.assigned : undefined;
  const { rows, list, onNearEnd, held, scheduled, isSnoozed, isSent } = useFolderRows(
    accountId,
    mailbox,
    search,
    assigned,
    me,
  );
  const { canRemove } = mailboxRights(mailbox);
  const dragMail = useCallback(
    (row: Row) => (canRemove ? { accountId, from: mailbox.id, email: row.email } : undefined),
    [canRemove, accountId, mailbox.id],
  );
  const onDropFiles = useDropFiles(accountId, mailbox);
  return (
    <ListFrame
      title={mailboxName(mailbox)}
      subtitle={
        account && !account.isPersonal ? (
          // Inline, not flex: a long address is cut with "…" like the rest of the title.
          <span title={mailboxNotice(account)}>
            <Users size={14} aria-hidden="true" className="mr-1 inline align-[-2px]" />
            {account.name}
          </span>
        ) : undefined
      }
      accountLabel={account?.name ?? ""}
      unread={mailbox.unreadEmails}
      rows={rows}
      isPending={list.isPending}
      isFetchingMore={list.isFetchingNextPage}
      onNearEnd={onNearEnd}
      search={search}
      showRecipient={mailbox.role === "sent" || mailbox.role === "drafts"}
      isDraft={mailbox.role === "drafts"}
      dragMail={dragMail}
      folderId={mailbox.id}
      inJunk={mailbox.role === "junk"}
      listAction={<EmlImportButton accountId={accountId} mailbox={mailbox} />}
      onDropFiles={onDropFiles}
      sortable={!scheduled && !isSnoozed}
      folderAction={
        <TrashActions accountId={accountId} mailbox={mailbox}>
          {canEmpty(mailbox) ? <EmptyFolder accountId={accountId} mailbox={mailbox} /> : null}
        </TrashActions>
      }
      filters={folderFilters(shared, isSent, search, assigned, held.length)}
      empty={emptyText(scheduled, isSnoozed, assigned)}
    />
  );
};
