import { describe, expect, it } from "vitest";
import { sentCopyOf, withSentCopy } from "./sent-copy";

describe("sentCopyOf", () => {
  it("keeps a shared mailbox's mails in it unless set otherwise", () => {
    expect(sentCopyOf({}, "info")).toBe("group");
    expect(sentCopyOf({ info: "both" }, "info")).toBe("both");
  });
});

describe("withSentCopy", () => {
  it("stores a choice and leaves the default out", () => {
    expect(withSentCopy({ rechnung: "sender" }, "info", "both")).toEqual({
      rechnung: "sender",
      info: "both",
    });
    expect(withSentCopy({ info: "both" }, "info", "group")).toEqual({});
  });
});
