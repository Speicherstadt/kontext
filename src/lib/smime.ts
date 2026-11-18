import {
  contentPart,
  type Envelope,
  type MimeAttachment,
  outerEnvelope,
  protectHeaders,
  withHeaders,
} from "./mime";

import {
  binaryToBytes,
  bytesToBinary,
  certToPem,
  checkSignedData,
  decryptEnveloped,
  envelopeEntity,
  type OwnSmime,
  type SmimeSignature,
  signEntity,
  smimeKind,
} from "./smime-crypto";

export * from "./smime-crypto";

const postal = async () => (await import("postal-mime")).default;

export type SmimeRead = {
  /** The real subject, from the protected headers inside; null when there are none. */
  subject: string | null;
  text: string;
  html: string | null;
  attachments: MimeAttachment[];
  signature: SmimeSignature;
  encrypted: boolean;
};

const bytesOf = (content: string | ArrayBuffer | Uint8Array) =>
  typeof content === "string" ? new TextEncoder().encode(content) : new Uint8Array(content);

/** The pkcs7 part of a mail: smime.p7m or smime.p7s, by type or name. */
const pkcs7Part = async (raw: string, kind: "mime" | "signature") => {
  const parsed = await (await postal()).parse(raw);
  const part = parsed.attachments.find(
    (file) =>
      new RegExp(`pkcs7-${kind}`, "i").test(file.mimeType) ||
      (file.filename ?? "").toLowerCase() === (kind === "mime" ? "smime.p7m" : "smime.p7s"),
  );
  return part ? bytesOf(part.content) : null;
};

/** The signed part of a multipart/signed entity, byte for byte (RFC 8551 §3.5.3). */
const signedPart = (raw: string, contentType: string) => {
  const boundary = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
  if (!boundary) return null;
  const text = raw.replace(/\r?\n/g, "\r\n");
  const start = text.indexOf(`--${boundary}\r\n`);
  if (start < 0) return null;
  const bodyStart = start + boundary.length + 4;
  const end = text.indexOf(`\r\n--${boundary}`, bodyStart);
  return end > 0 ? text.slice(bodyStart, end) : null;
};

const headerOf = (entity: string, name: string) => {
  const head = entity.replace(/\r?\n/g, "\r\n").split("\r\n\r\n")[0] ?? "";
  return (
    head
      .replace(/\r\n[ \t]+/g, " ")
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      ?.slice(name.length + 1)
      .trim() ?? ""
  );
};

const parsed = async (
  entity: string,
  signature: SmimeSignature,
  encrypted: boolean,
): Promise<SmimeRead> => {
  const inner = await (await postal()).parse(
    /^mime-version:/im.test(entity) ? entity : `MIME-Version: 1.0\r\n${entity}`,
  );
  return {
    subject: inner.subject ?? null,
    text: inner.text ?? "",
    html: inner.html ?? null,
    attachments: inner.attachments
      .filter((file) => !/pkcs7-signature/i.test(file.mimeType))
      .map((file) => ({
        name: file.filename ?? "Anhang",
        type: file.mimeType,
        bytes: bytesOf(file.content),
      })),
    signature,
    encrypted,
  };
};

/**
 * The content under a signature. Encrypted, then signed (RFC 8551 §3.7 allows either order), it
 * is decrypted with one's certificate and keeps the outer signature; without the certificate it
 * stays as it is, the encrypted part a file, so the signature still shows.
 */
const readSigned = async (
  entity: string,
  signature: SmimeSignature,
  own: OwnSmime | null,
  depth: number,
): Promise<SmimeRead> => {
  if (depth < 2 && own && smimeKind(headerOf(entity, "Content-Type")) === "encrypted") {
    const read = await readSmime(entity, own, depth + 1);
    return read.signature.state === "none" ? { ...read, signature } : read;
  }
  return parsed(entity, signature, false);
};

/**
 * Reads an S/MIME mail (its whole raw text): decrypted with one's certificate where it is
 * encrypted, the signature checked where it is signed, either order.
 */
export const readSmime = async (
  raw: string,
  own: OwnSmime | null,
  depth = 0,
): Promise<SmimeRead> => {
  const contentType = headerOf(raw, "Content-Type");
  const kind = smimeKind(contentType);
  const decoder = new TextDecoder();
  if (kind === "encrypted") {
    if (!own) throw new Error("Kein eigenes Zertifikat");
    const der = await pkcs7Part(raw, "mime");
    if (!der) throw new Error("Kein verschlüsselter Inhalt");
    const inner = decoder.decode(await decryptEnveloped(der, own));
    if (depth < 2 && smimeKind(headerOf(inner, "Content-Type"))) {
      return { ...(await readSmime(inner, own, depth + 1)), encrypted: true };
    }
    return parsed(inner, { state: "none" }, true);
  }
  if (kind === "signed" && /multipart\/signed/i.test(contentType)) {
    const signed = signedPart(raw, contentType);
    const der = await pkcs7Part(raw, "signature");
    if (!signed || !der) return parsed(raw, { state: "invalid" }, false);
    const { signature } = await checkSignedData(der, new TextEncoder().encode(signed));
    return readSigned(signed, signature, own, depth);
  }
  if (kind === "signed") {
    const der = await pkcs7Part(raw, "mime");
    const result = der ? await checkSignedData(der, null) : null;
    if (!result?.content) return parsed(raw, { state: "invalid" }, false);
    return readSigned(decoder.decode(result.content), result.signature, own, depth);
  }
  return parsed(raw, { state: "none" }, false);
};

/**
 * A mail signed with one's certificate and encrypted to the recipients' and one's own (so the
 * copy in Sent stays readable): the raw text to send.
 */
export const smimeMail = async ({
  envelope,
  content,
  recipientCerts,
  own,
  id,
}: {
  envelope: Envelope;
  content: { text: string; html: string; attachments: MimeAttachment[] };
  recipientCerts: string[];
  own: OwnSmime;
  id: string;
}): Promise<string> => {
  const signed = await signEntity(protectHeaders(contentPart(content, id), envelope), own, id);
  const ownPem = await certToPem(own.cert);
  return withHeaders(
    outerEnvelope(envelope),
    await envelopeEntity(signed, [...recipientCerts, ownPem]),
  );
};

/** A mail signed with one's certificate and not encrypted: the raw text to send. */
export const smimeSignedMail = async ({
  envelope,
  content,
  own,
  id,
}: {
  envelope: Envelope;
  content: { text: string; html: string; attachments: MimeAttachment[] };
  own: OwnSmime;
  id: string;
}): Promise<string> => withHeaders(envelope, await signEntity(contentPart(content, id), own, id));

export { binaryToBytes, bytesToBinary };
