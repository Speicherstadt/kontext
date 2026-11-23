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
const own = { accountId: "own", mailboxes: ownBoxes };
const fromOwn = { ...own, sentCopy: "group" as const };
const jonas = identity("j", "jonas@weber.test", "Jonas Weber");
const infoInOwn = identity("i-own", "info@weber.test", "Jonas Weber");
const infoOfGroup = identity("i-group", "INFO@weber.test", "Weber Haustechnik");
const info: GroupAccount = {
  accountId: "info",
  identities: [infoOfGroup],
  mailboxes: infoBoxes,
  sentCopy: "group",
};
const inInfo = { accountId: "info", mailboxes: infoBoxes, sentCopy: "group" as const };
const ownSent = { accountId: "own", sentId: "own-sent" };

describe("sendRoute", () => {
  it("sends the own address through the own account", () => {
    expect(sendRoute(jonas, fromOwn, own, [info])).toEqual({
      accountId: "own",
      identity: jonas,
      mailboxes: ownBoxes,
      copyTo: null,
    });
  });

  it("sends a group address through the group's account, with its identity and folders", () => {
    expect(sendRoute(infoInOwn, fromOwn, own, [info])).toEqual({
      accountId: "info",
      identity: infoOfGroup,
      mailboxes: infoBoxes,
      copyTo: null,
    });
  });

  it("copies to the own Sent where the mailbox keeps its mails in both places", () => {
    const both = { ...info, sentCopy: "both" as const };
    expect(sendRoute(infoInOwn, fromOwn, own, [both])).toMatchObject({
      accountId: "info",
      copyTo: ownSent,
    });
  });

  it("sends through the own account where the mailbox keeps its mails with the sender", () => {
    const sender = { ...info, sentCopy: "sender" as const };
    expect(sendRoute(infoInOwn, fromOwn, own, [sender])).toEqual({
      accountId: "own",
      identity: infoInOwn,
      mailboxes: ownBoxes,
      copyTo: null,
    });
  });

  it("stays in the own account where the group's identities can't be read", () => {
    const readOnly = { ...info, identities: [] };
    expect(sendRoute(infoInOwn, fromOwn, own, [readOnly]).accountId).toBe("own");
  });

  it("stays in the own account when the group has no Drafts or Sent folder", () => {
    const noSent = { ...info, mailboxes: [folder("info-drafts", "drafts")] };
    expect(sendRoute(infoInOwn, fromOwn, own, [noSent]).accountId).toBe("own");
  });

  it("keeps the account chosen already when writing from a shared mailbox", () => {
    expect(sendRoute(infoOfGroup, inInfo, own, [])).toEqual({
      accountId: "info",
      identity: infoOfGroup,
      mailboxes: infoBoxes,
      copyTo: null,
    });
  });

  it("copies from a shared mailbox to the own Sent with both, and stays there with sender", () => {
    expect(sendRoute(infoOfGroup, { ...inInfo, sentCopy: "both" }, own, []).copyTo).toEqual(
      ownSent,
    );
    expect(sendRoute(infoOfGroup, { ...inInfo, sentCopy: "sender" }, own, [])).toMatchObject({
      accountId: "info",
      copyTo: null,
    });
  });

  it("copies nowhere without an own Sent folder", () => {
    const noSent = { ...own, mailboxes: [folder("own-drafts", "drafts")] };
    expect(sendRoute(infoOfGroup, { ...inInfo, sentCopy: "both" }, noSent, []).copyTo).toBeNull();
  });

  it("has no identity before one is picked", () => {
    expect(sendRoute(undefined, fromOwn, own, [info])).toMatchObject({
      identity: undefined,
      copyTo: null,
    });
  });
});

describe("groupSenders", () => {
  it("names each address of a shared mailbox one sends through as the recipient sees it", () => {
    const readOnly = { ...info, accountId: "rechnung", identities: [] };
    const sender = { ...info, accountId: "buero", sentCopy: "sender" as const };
    expect(groupSenders([info, readOnly, sender], "Jonas Weber")).toEqual([
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
