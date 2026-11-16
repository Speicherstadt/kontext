/**
 * The company logo in Stalwart (Enterprise, `x:Enterprise`, `logo`): Stalwart puts it into its
 * calendar mails and serves it at /logo, for every domain without a logo of its own. It takes a
 * `data:` URI with base64, a bare base64 image or an http(s) address, at most 1 MiB, PNG, JPEG,
 * GIF, WebP, ICO or SVG (LogoSource::parse, allowed_media_type, sniff_media_type in
 * crates/common/src/enterprise/logo.rs of stalwartlabs/stalwart v1.1.0). Kontext uploads the file
 * as a `data:` URI, so Stalwart needs no download, and checks it the same way beforehand: Stalwart
 * itself only notices a bad logo when it sends a mail, and then sends its own.
 */

/** MAX_LOGO_SIZE in logo.rs. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/** What the file picker offers; PNG reads best in mail programs (many show no SVG). */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon";

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const isSvg = (bytes: Uint8Array) => {
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).replace(/^﻿/, "").trimStart();
  return head.slice(0, 4).toLowerCase() === "<svg" || head.startsWith("<?xml");
};

/** The image type by its first bytes, as sniff_media_type does it; null for anything else. */
export const sniffLogo = (bytes: Uint8Array): string | null => {
  if (startsWith(bytes, [0x89, ...ascii("PNG\r\n\x1a\n")])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF8"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, [0, 0, 1, 0])) return "image/x-icon";
  if (isSvg(bytes)) return "image/svg+xml";
  return null;
};

export type LogoProblem = "format" | "size" | "type";

const decodeBase64 = (text: string): Uint8Array | null => {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  try {
    return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
};

/**
 * A `data:…;base64,…` URI as Stalwart would take it: the image type by its content (a file's
 * own claim does not count), the URI rebuilt with it. Or what is wrong with it.
 */
export const checkLogo = (
  uri: string,
): { ok: true; uri: string; type: string } | { ok: false; problem: LogoProblem } => {
  const match = /^data:([^,]*);base64,(.*)$/is.exec(uri.trim());
  if (!match) return { ok: false, problem: "format" };
  if (match[2]!.length > Math.ceil(LOGO_MAX_BYTES / 3) * 4 + 4)
    return { ok: false, problem: "size" };
  const bytes = decodeBase64(match[2]!);
  if (!bytes) return { ok: false, problem: "format" };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, problem: "size" };
  const type = sniffLogo(bytes);
  if (!type) return { ok: false, problem: "type" };
  return { ok: true, uri: `data:${type};base64,${match[2]!.replace(/\s+/g, "")}`, type };
};

/** What an `<img>` can show of Stalwart's value: a data URI or a web address; else nothing. */
export const logoSource = (logo: string | null): string | null => {
  const value = logo?.trim() ?? "";
  if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return value;
  if (!value) return null;
  // The first 510 bytes are enough to tell the type.
  const bytes = decodeBase64(value.replace(/\s+/g, "").slice(0, 680));
  const type = bytes ? sniffLogo(bytes) : null;
  return type ? `data:${type};base64,${value.replace(/\s+/g, "")}` : null;
};
