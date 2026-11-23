import { describe, expect, it } from "vitest";
import type { Identity, Mailbox } from "@/model/jmap";
import { draftSwap, type GroupAccount, groupSenders, sendRoute } from "./send-route";

const identity = (id: string, email: string, name = ""): Identity => ({
  id,
  name,
  email,
  replyTo: null,
  bcc: null,
  textSignature: "",
  htmlSignature: "",
});

const folder = (id: string, role: string | null): Mailbox => ({
  id,
  name: id,
  parentId: null,
  role,
  sortOrder: 0,
  totalEmails: 0,
  unreadEmails: 0,
});

const ownBoxes = [folder("own-drafts", "drafts"), folder("own-sent", "sent")];
const infoBoxes = [folder("info-drafts", "drafts"), folder("info-sent", "sent")];
const own = { accountId: "own", mailboxes: ownBoxes, isOwn: true };
const jonas = identity("j", "jonas@weber.test", "Jonas Weber");
const infoInOwn = identity("i-own", "info@weber.test", "Jonas Weber");
const infoOfGroup = identity("i-group", "INFO@weber.test", "Weber Haustechnik");
const info: GroupAccount = { accountId: "info", identities: [infoOfGroup], mailboxes: infoBoxes };

describe("sendRoute", () => {
  it("sends the own address through the own account", () => {
    expect(sendRoute(jonas, own, [info])).toEqual({
      accountId: "own",
      identity: jonas,
      mailboxes: ownBoxes,
    });
  });

  it("sends a group address through the group's account, with its identity and folders", () => {
    expect(sendRoute(infoInOwn, own, [info])).toEqual({
      accountId: "info",
      identity: infoOfGroup,
      mailboxes: infoBoxes,
    });
  });

  it("stays in the own account where the group's identities can't be read", () => {
    const readOnly = { ...info, identities: [] };
    expect(sendRoute(infoInOwn, own, [readOnly]).accountId).toBe("own");
  });

  it("stays in the own account when the group has no Drafts or Sent folder", () => {
    const noSent = { ...info, mailboxes: [folder("info-drafts", "drafts")] };
    expect(sendRoute(infoInOwn, own, [noSent]).accountId).toBe("own");
  });

  it("keeps the account chosen already when writing from a shared mailbox", () => {
    const shared = { accountId: "info", mailboxes: infoBoxes, isOwn: false };
    expect(sendRoute(infoOfGroup, shared, [info])).toEqual({
      accountId: "info",
      identity: infoOfGroup,
      mailboxes: infoBoxes,
    });
  });

  it("has no identity before one is picked", () => {
    expect(sendRoute(undefined, own, [info]).identity).toBeUndefined();
  });
});

describe("groupSenders", () => {
  it("names each address of a shared mailbox one may write in as the recipient sees it", () => {
    const readOnly = { ...info, accountId: "rechnung", identities: [] };
    expect(groupSenders([info, readOnly], "Jonas Weber")).toEqual([
      { email: "INFO@weber.test", name: "Jonas Weber (Weber Haustechnik)" },
    ]);
  });
});

describe("draftSwap", () => {
  it("replaces a draft in the same account", () => {
    expect(draftSwap({ accountId: "own", id: "d1" }, "own")).toEqual({
      replaces: "d1",
      leftBehind: null,
    });
  });

  it("leaves a draft of another account to be removed after the save", () => {
    expect(draftSwap({ accountId: "own", id: "d1" }, "info")).toEqual({
      replaces: null,
      leftBehind: { accountId: "own", id: "d1" },
    });
  });

  it("has nothing to replace without a draft", () => {
    expect(draftSwap(null, "own")).toEqual({ replaces: null, leftBehind: null });
  });
});
