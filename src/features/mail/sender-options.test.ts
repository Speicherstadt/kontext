import { describe, expect, it } from "vitest";
import type { SelectGroup, SelectOption } from "@/components/ui/select";
import { externalIdentity } from "@/external-accounts/api";
import type { Identity } from "@/jmap/types";
import { senderOptions } from "./sender-options";

const identity = (id: string, name: string, email: string): Identity => ({
  id,
  name,
  email,
  replyTo: null,
  bcc: null,
  textSignature: "",
  htmlSignature: "",
});

const texts = {
  own: "Eigene Adressen",
  other: "Weitere Postfächer",
  alias: "Alias",
  group: "Gruppe",
  appearsAs: (name: string) => `erscheint als „${name}“`,
};

const jonas = identity("i1", "Jonas Weber", "jonas@weber.test");
const alias = identity("i2", "Jonas Weber", "j.weber@weber.test");
const info = identity("i3", "Weber Haustechnik", "info@weber.test");
const context = { login: "jonas@weber.test", groups: ["info@weber.test"], shared: null, texts };

describe("senderOptions", () => {
  it("puts the login address first and marks aliases and shared mailboxes", () => {
    const options = senderOptions([info, alias, jonas], context) as SelectOption[];
    expect(options.map((o) => [o.label, o.hint, o.badge])).toEqual([
      ["Jonas Weber", "jonas@weber.test", undefined],
      ["Weber Haustechnik", "info@weber.test", "Gruppe"],
      ["Jonas Weber", "j.weber@weber.test", "Alias"],
    ]);
  });

  it("groups one's other mailboxes apart from the own addresses", () => {
    const gmail = externalIdentity(
      { id: "x1", name: "Jonas privat", email: "jonas@gmail.test" } as never,
      jonas,
    );
    const groups = senderOptions([jonas, gmail], context) as SelectGroup[];
    expect(groups.map((g) => [g.label, g.options.map((o) => o.label)])).toEqual([
      ["Eigene Adressen", ["Jonas Weber"]],
      ["Weitere Postfächer", ["Jonas privat"]],
    ]);
  });

  it("shows in a shared mailbox the name the recipient will see", () => {
    const shared = { mailbox: "info", person: "Jonas Weber" };
    const [group] = senderOptions([info], { ...context, shared }) as SelectGroup[];
    expect(group?.label).toBe("info");
    expect(group?.options[0]?.hint).toBe(
      "info@weber.test · erscheint als „Jonas Weber (Weber Haustechnik)“",
    );
  });

  it("names a sender without a name by its address, without repeating it", () => {
    const [only] = senderOptions(
      [identity("i4", "", "jonas@weber.test")],
      context,
    ) as SelectOption[];
    expect([only?.label, only?.hint]).toEqual(["jonas@weber.test", undefined]);
  });
});
