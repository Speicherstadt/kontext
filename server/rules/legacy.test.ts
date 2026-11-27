import { describe, expect, it } from "vitest";
import { readLegacyReply } from "./legacy";

/** As Stalwart 1.1.1 wrote it (build_script in crates/jmap/src/vacation/set.rs). */
const script = (body: string, subject = ':subject "Urlaub \\"Sommer\\"" ') =>
  [
    'require ["vacation", "relational", "date"];',
    "",
    'if currentdate :value "ge" "iso8601" "2026-07-01T00:00:00Z" {',
    'if currentdate :value "le" "iso8601" "2026-07-20T00:00:00Z" {',
    `vacation :mime ${subject}"${body}";`,
    "}",
    "}",
    "",
  ].join("\r\n");

describe("readLegacyReply", () => {
  it("reads subject, dates and a text in 7bit", async () => {
    const body =
      "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\nBin bis Montag weg.\r\n";
    expect(await readLegacyReply(script(body))).toEqual({
      subject: 'Urlaub "Sommer"',
      fromDate: "2026-07-01T00:00:00Z",
      toDate: "2026-07-20T00:00:00Z",
      textBody: "Bin bis Montag weg.",
      htmlBody: null,
    });
  });

  it("decodes umlauts in base64 and works without subject", async () => {
    const text = Buffer.from("Grüße, ich bin zurück am Montag.").toString("base64");
    const body = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${text}\r\n`;
    const reply = await readLegacyReply(script(body, ""));
    expect(reply?.subject).toBeNull();
    expect(reply?.textBody).toBe("Grüße, ich bin zurück am Montag.");
  });

  it("is null for a script that sends no reply", async () => {
    expect(await readLegacyReply('require ["fileinto"];\r\nfileinto "Archiv";\r\n')).toBeNull();
  });
});
