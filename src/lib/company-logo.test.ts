import { describe, expect, it } from "vitest";
import { checkLogo, LOGO_MAX_BYTES, logoSource, sniffLogo } from "./company-logo";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const base64 = (bytes: number[] | Uint8Array) => Buffer.from(bytes).toString("base64");
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffLogo, as sniff_media_type in crates/common/src/enterprise/logo.rs", () => {
  it.each([
    [new Uint8Array(PNG), "image/png"],
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    [text("GIF89a"), "image/gif"],
    [text("RIFF\0\0\0\0WEBPVP8 "), "image/webp"],
    [new Uint8Array([0, 0, 1, 0, 1, 0]), "image/x-icon"],
    [text('﻿  <SVG xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"],
    [text('<?xml version="1.0"?><svg/>'), "image/svg+xml"],
    [text("%PDF-1.7"), null],
  ])("tells %s", (bytes, type) => {
    expect(sniffLogo(bytes)).toBe(type);
  });
});

describe("checkLogo", () => {
  it("takes the type from the content, not from the file's claim", () => {
    expect(checkLogo(`data:image/gif;base64,${base64(PNG)}`)).toEqual({
      ok: true,
      type: "image/png",
      uri: `data:image/png;base64,${base64(PNG)}`,
    });
  });

  it("refuses what Stalwart would not show", () => {
    expect(checkLogo("https://firma.test/logo.png")).toEqual({ ok: false, problem: "format" });
    expect(checkLogo("data:image/png;base64,***")).toEqual({ ok: false, problem: "format" });
    expect(checkLogo(`data:application/pdf;base64,${base64(text("%PDF-1.7"))}`)).toEqual({
      ok: false,
      problem: "type",
    });
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    expect(checkLogo(`data:image/png;base64,${base64(big)}`)).toEqual({
      ok: false,
      problem: "size",
    });
  });
});

describe("logoSource", () => {
  it("shows a data URI, a web address or bare base64 Stalwart also takes", () => {
    expect(logoSource(null)).toBeNull();
    expect(logoSource("https://firma.test/logo.png")).toBe("https://firma.test/logo.png");
    expect(logoSource(`data:image/png;base64,${base64(PNG)}`)).toContain("data:image/png");
    expect(logoSource(base64(PNG))).toBe(`data:image/png;base64,${base64(PNG)}`);
    expect(logoSource("not a logo")).toBeNull();
  });
});
