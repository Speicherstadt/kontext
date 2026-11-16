// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Invocation } from "./management";
import {
  createStalwartSso,
  DIRECTORY_DESCRIPTION,
  type DirectorySettings,
  directoryObject,
  pickDirectory,
  SCIM_KEY_DESCRIPTION,
  toSettings,
  toSsoDomain,
} from "./sso";

const settings: DirectorySettings = {
  issuerUrl: " https://login.microsoftonline.com/t1/v2.0 ",
  claimUsername: "",
  usernameDomain: "",
  claimName: "name",
  claimGroups: "",
  audience: "kontext-app",
  tokenCheck: "jwt",
};

/** A Stalwart that answers each method with what `answers` gives and records the calls. */
const fakeStalwart = (answers: (call: Invocation) => Record<string, unknown>) => {
  const calls: Invocation[] = [];
  const request = async (methodCalls: Invocation[]) => {
    calls.push(...methodCalls);
    return methodCalls.map((call) => [call[0], answers(call), call[2]] as Invocation);
  };
  return { calls, sso: createStalwartSso(request) };
};

describe("the OIDC directory", () => {
  it("is Kontext's by name, or the only OIDC directory there is", () => {
    const ldap = { id: "a", "@type": "Ldap" };
    const ours = { id: "b", "@type": "Oidc", description: DIRECTORY_DESCRIPTION };
    const theirs = { id: "c", "@type": "Oidc", description: "Keycloak" };
    expect(pickDirectory([ldap, theirs, ours])?.id).toBe("b");
    expect(pickDirectory([ldap, theirs])?.id).toBe("c");
    expect(pickDirectory([theirs, { ...theirs, id: "d" }])).toBeNull();
    expect(pickDirectory([ldap])).toBeNull();
  });

  it("is written with full rights for unscoped tokens and the audience as accepted", () => {
    expect(directoryObject(settings)).toEqual({
      description: DIRECTORY_DESCRIPTION,
      issuerUrl: "https://login.microsoftonline.com/t1/v2.0",
      claimUsername: "preferred_username",
      usernameDomain: null,
      claimName: "name",
      claimGroups: null,
      acceptedAudiences: { "kontext-app": true },
      opaqueTokenValidation: "none",
      unscopedTokens: "full",
    });
    expect(directoryObject({ ...settings, tokenCheck: "userInfo" }).opaqueTokenValidation).toBe(
      "userInfo",
    );
  });

  it("is read back into the form's values", () => {
    expect(
      toSettings({
        id: "b",
        "@type": "Oidc",
        issuerUrl: "https://accounts.google.com",
        claimUsername: "email",
        acceptedAudiences: { "123.apps.googleusercontent.com": true },
        opaqueTokenValidation: "userInfo",
      }),
    ).toEqual({
      issuerUrl: "https://accounts.google.com",
      claimUsername: "email",
      usernameDomain: "",
      claimName: "",
      claimGroups: "",
      audience: "123.apps.googleusercontent.com",
      tokenCheck: "userInfo",
    });
  });
});

describe("toSsoDomain", () => {
  it("tells Kontext's directory from another one and reads SCIM", () => {
    expect(toSsoDomain({ id: "d1", name: "firma.de", directoryId: "b" }, "b")).toEqual({
      id: "d1",
      name: "firma.de",
      sso: true,
      otherDirectory: false,
      scim: false,
    });
    expect(
      toSsoDomain({ id: "d2", name: "x.de", directoryId: "a", allowScimProvisioning: true }, "b"),
    ).toMatchObject({ sso: false, otherDirectory: true, scim: true });
    expect(toSsoDomain({ id: "d3", name: "y.de", directoryId: null }, null)).toMatchObject({
      sso: false,
      otherDirectory: false,
    });
  });
});

describe("createStalwartSso", () => {
  it("creates the directory once and changes it after, each time reloading Stalwart", async () => {
    const { calls, sso } = fakeStalwart(() => ({ created: { d: { id: "b" } } }));
    expect(await sso.saveDirectory(null, settings)).toEqual({ ok: true, value: null });
    expect(calls[0]).toEqual([
      "x:Directory/set",
      { create: { d: { "@type": "Oidc", ...directoryObject(settings) } } },
      "0",
    ]);
    expect(calls[1]![1]).toEqual({ create: { r: { "@type": "ReloadSettings" } } });
    await sso.saveDirectory("b", settings);
    expect(calls[2]).toEqual([
      "x:Directory/set",
      { update: { b: directoryObject(settings) } },
      "0",
    ]);
  });

  it("passes Stalwart's refusal on", async () => {
    const { sso } = fakeStalwart(() => ({
      notCreated: { d: { type: "invalidProperties", description: "Invalid issuer URL" } },
    }));
    expect(await sso.saveDirectory(null, settings)).toEqual({
      ok: false,
      error: "Invalid issuer URL",
    });
  });

  it("sets per domain the directory and SCIM, null to take the directory away", async () => {
    const { calls, sso } = fakeStalwart(() => ({ updated: {} }));
    await sso.setDomains("b", [
      { id: "d1", sso: true, scim: true },
      { id: "d2", sso: false, scim: false },
    ]);
    expect(calls[0]).toEqual([
      "x:Domain/set",
      {
        update: {
          d1: { directoryId: "b", allowScimProvisioning: true },
          d2: { directoryId: null, allowScimProvisioning: false },
        },
      },
      "0",
    ]);
  });

  it("reads directory and domains; null when the key may not", async () => {
    const { sso } = fakeStalwart(([method]) =>
      method === "x:Directory/get"
        ? {
            list: [
              {
                id: "b",
                "@type": "Oidc",
                description: DIRECTORY_DESCRIPTION,
                issuerUrl: "https://i",
              },
            ],
          }
        : { list: [{ id: "d1", name: "firma.de", directoryId: "b", allowScimProvisioning: true }] },
    );
    const view = await sso.read();
    expect(view?.directoryId).toBe("b");
    expect(view?.domains).toEqual([
      { id: "d1", name: "firma.de", sso: true, otherDirectory: false, scim: true },
    ]);
    const refused = createStalwartSso(async () => {
      throw new Error("forbidden");
    });
    expect(await refused.read()).toBeNull();
  });

  it("makes the SCIM token with the SCIM rights, without deleting when that is refused", async () => {
    const created: Record<string, unknown>[] = [];
    const { calls, sso } = fakeStalwart(([method, args]) => {
      if (method === "x:ApiKey/get")
        return {
          list: [
            { id: "1", description: "Kontext" },
            { id: "7", description: SCIM_KEY_DESCRIPTION, createdAt: "2026-11-01T10:00:00Z" },
          ],
        };
      if (args.create) {
        const key = (args.create as { k: { permissions: { permissions: Record<string, true> } } })
          .k;
        created.push(key.permissions.permissions);
        return key.permissions.permissions.sysAccountDestroy
          ? { notCreated: { k: { type: "forbidden", description: "sysAccountDestroy" } } }
          : { created: { k: { id: "8", secret: "API_neu" } } };
      }
      return { destroyed: ["7"] };
    });
    expect(await sso.scimKey()).toEqual({ createdAt: "2026-11-01T10:00:00Z" });
    expect(await sso.newScimKey()).toEqual({
      ok: true,
      value: { secret: "API_neu", canDelete: false },
    });
    expect(created[1]).toEqual({
      authenticate: true,
      scimAccess: true,
      sysAccountGet: true,
      sysAccountCreate: true,
      sysAccountUpdate: true,
    });
    // Only the old SCIM token goes, never the server's own key.
    expect(calls.at(-1)).toEqual(["x:ApiKey/set", { destroy: ["7"] }, "0"]);
  });
});
