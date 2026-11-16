import { describe, expect, it } from "vitest";
import { initialSettings, managedBy, type SsoView } from "./sso-api";

const domains: SsoView["domains"] = [
  { id: "d1", name: "firma.de", sso: true, otherDirectory: false, scim: true },
  { id: "d2", name: "Zweit.de", sso: false, otherDirectory: false, scim: false },
];

describe("managedBy", () => {
  it("goes by the domain of the address", () => {
    expect(managedBy("anna@firma.de", domains)).toEqual({ sso: true, scim: true });
    expect(managedBy("max@zweit.de", domains)).toEqual({ sso: false, scim: false });
    expect(managedBy("jemand@anders.de", domains)).toEqual({ sso: false, scim: false });
  });
});

describe("initialSettings", () => {
  it("starts with what suits most providers, or with what is saved, never a secret", () => {
    expect(initialSettings(undefined)).toMatchObject({
      scopes: "openid email profile offline_access",
      claimUsername: "preferred_username",
      claimName: "name",
      tokenCheck: "jwt",
      clientSecret: "",
    });
    const view = {
      directory: {
        issuerUrl: "https://accounts.google.com",
        claimUsername: "email",
        usernameDomain: "",
        claimName: "",
        claimGroups: "",
        audience: "",
        tokenCheck: "userInfo",
      },
      client: { clientId: "123", scopes: "openid email", hasSecret: true },
    } as unknown as SsoView;
    expect(initialSettings(view)).toMatchObject({
      issuerUrl: "https://accounts.google.com",
      clientId: "123",
      clientSecret: "",
      claimUsername: "email",
      tokenCheck: "userInfo",
    });
  });
});
