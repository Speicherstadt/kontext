import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSso, ssoOutcomeOf, ssoStartUrl } from "./sso";

afterEach(() => vi.unstubAllGlobals());

describe("checkSso", () => {
  it("asks the server only for a whole address, false when it cannot tell", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ sso: true }));
    vi.stubGlobal("fetch", fetchFn);
    expect(await checkSso("anna")).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await checkSso(" anna@firma.de ")).toBe(true);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-in/sso/check");
    expect(JSON.parse(String(init.body))).toEqual({ email: "anna@firma.de" });
    vi.stubGlobal("fetch", async () => new Response("", { status: 429 }));
    expect(await checkSso("anna@firma.de")).toBe(false);
  });
});

describe("the way to the provider and back", () => {
  it("starts at the server with the address, and reads what went wrong", () => {
    expect(ssoStartUrl("anna@firma.de")).toBe("/api/auth/sign-in/sso?email=anna%40firma.de");
    expect(ssoOutcomeOf("failed")).toBe("failed");
    expect(ssoOutcomeOf("cancelled")).toBe("cancelled");
    expect(ssoOutcomeOf("<script>")).toBeNull();
    expect(ssoOutcomeOf(undefined)).toBeNull();
  });
});
