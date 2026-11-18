// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { allowsInsecureRedirect } from "./provider";

vi.mock("../db", async () => ({
  schema: { ...(await import("../db/schema")), ...(await import("../db/oauth-schema")) },
}));

describe("redirects over plain http", () => {
  it("are accepted to the own machine", () => {
    for (const uri of [
      "http://localhost:28097/api/auth/callback/oidc",
      "http://127.0.0.1:8080/callback",
      "http://[::1]:3000/callback",
    ]) {
      expect(allowsInsecureRedirect(new URL(uri))).toBe(true);
    }
  });

  it("are refused anywhere else", () => {
    for (const uri of [
      "http://dokumente.firma.de/api/auth/callback/oidc",
      "http://192.168.1.50:8000/callback",
      "http://localhost.evil.example/callback",
      "http://127.0.0.2/callback",
    ]) {
      expect(allowsInsecureRedirect(new URL(uri))).toBe(false);
    }
  });
});
