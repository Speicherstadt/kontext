/**
 * Where the composer's draft lies. A draft cannot move between accounts (Email/set works in one
 * account, RFC 8621 §4.6), so when the sender changes to or from a shared mailbox's address, the
 * next save writes the draft in the new account and then removes the one left in the old.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { JmapClient } from "@/jmap/client";
import { draftSwap, type SavedDraft } from "@/lib/send-route";
import type { ComposerState } from "./composer-state";

type Place = { state: ComposerState; client: JmapClient; queryClient: QueryClient };

/** Destroys a saved draft in its own account. */
export const removeDraft = async (client: JmapClient, draft: SavedDraft) => {
  await client.call("Email/set", { accountId: draft.accountId, destroy: [draft.id] });
};

/**
 * The draft is now `id` in `accountId` (null: there is none any more); one left behind in
 * another account goes. Failing to remove it leaves a stray draft there, nothing worse.
 */
export const settleDraft = async (
  { state, client, queryClient }: Place,
  accountId: string,
  id: string | null,
) => {
  const { leftBehind } = draftSwap(state.savedDraft.current, accountId);
  state.savedDraft.current = id ? { accountId, id } : null;
  if (!leftBehind) return;
  await removeDraft(client, leftBehind).catch(() => undefined);
  void queryClient.invalidateQueries({ queryKey: [leftBehind.accountId, "emails"] });
};
