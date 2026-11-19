/**
 * The people and groups of the company (JMAP Sharing, RFC 9670): whom an address book can be
 * shared with, and which accounts in the session are shared mailboxes. In Stalwart a principal's
 * id is also its account id.
 */
import { type Principal, principalName } from "@/model/jmap";
import { CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.principals];

export type { Principal };

export const listPrincipals = async (
  client: JmapClient,
  accountId: string,
): Promise<Principal[]> => {
  const [, get] = await client.request(
    [
      ["Principal/query", { accountId }, "q"],
      [
        "Principal/get",
        { accountId, "#ids": { resultOf: "q", name: "Principal/query", path: "/ids" } },
        "g",
      ],
    ],
    USING,
  );
  return (get![1].list as Principal[]) ?? [];
};

export { principalName };
