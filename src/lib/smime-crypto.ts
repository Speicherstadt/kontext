/**
 * The S/MIME building blocks (RFC 8551) under smime.ts: certificates, the .p12 file, checking
 * SignedData, decrypting EnvelopedData, signing and encrypting a MIME entity. See smime.ts.
 */
import type { asn1 as forgeAsn1, pkcs7, pki, util } from "node-forge";
import { type CertInfo, describeAsn1, ecdsaVerifies, ecKeyOf, serialOf } from "./smime-cert";

type Asn1 = forgeAsn1.Asn1;

export type { CertInfo };

const loadForge = async () => (await import("node-forge")).default;

export type SmimeKind = "encrypted" | "signed" | null;

/**
 * S/MIME by its Content-Type: enveloped data, or a signature (detached or wrapped). RFC 8551 §3.2.2
 * also names authEnveloped-data (RFC 5083): encrypted too, though node-forge cannot open it, so
 * the mail says it cannot be decrypted rather than showing the cipher text as a file.
 */
export const smimeKind = (contentType: string | null | undefined): SmimeKind => {
  const type = (contentType ?? "").toLowerCase();
  const pkcs7 = /application\/(x-)?pkcs7-mime/.test(type);
  if (pkcs7 && /smime-type\s*=\s*"?(auth)?enveloped-data/.test(type)) return "encrypted";
  if (pkcs7 && /smime-type\s*=\s*"?signed-data/.test(type)) return "signed";
  if (pkcs7 && !/smime-type/.test(type)) return "encrypted";
  if (type.includes("multipart/signed") && /pkcs7-signature/.test(type)) return "signed";
  return null;
};

/**
 * Signed over an encrypted entity (encrypted, then signed; RFC 8551 §3.7), read as an encrypted
 * mail: the signed content, the first part of the multipart/signed (RFC 1847 §2.1), is itself the
 * smime.p7m. A .p7m file somewhere inside a signed mail (a CAdES-signed invoice) is not.
 */
export const signedOverEncrypted = (email: {
  contentType: string | null;
  bodyStructure: { subParts?: { type: string; name: string | null }[] | null } | null;
}) => {
  const signed = email.bodyStructure?.subParts?.[0];
  return (
    smimeKind(email.contentType) === "signed" &&
    /multipart\/signed/i.test(email.contentType ?? "") &&
    Boolean(signed) &&
    smimeKind(signed!.type) === "encrypted" &&
    (signed!.name ?? "smime.p7m").toLowerCase() === "smime.p7m"
  );
};

export const bytesToBinary = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return binary;
};
export const binaryToBytes = (binary: string) => Uint8Array.from(binary, (c) => c.charCodeAt(0));

const describeCert = async (cert: pki.Certificate): Promise<CertInfo> => {
  const forge = await loadForge();
  return describeAsn1(forge, forge.pki.certificateToAsn1(cert));
};

export const certToPem = async (cert: pki.Certificate) =>
  (await loadForge()).pki.certificateToPem(cert);

export const certFromPem = async (pem: string) => (await loadForge()).pki.certificateFromPem(pem);

/** A certificate's DER from PEM; the first one in the text. */
const pemToDer = (forge: typeof import("node-forge"), pem: string) => {
  const block = forge.pem.decode(pem).find((entry) => entry.type === "CERTIFICATE");
  if (!block) throw new Error("Kein Zertifikat");
  return block.body;
};

/** A certificate file someone gives (.cer, .crt, .pem; DER or PEM), with any kind of key. */
export const readCertificate = async (
  data: Uint8Array,
): Promise<{ pem: string; info: CertInfo }> => {
  const forge = await loadForge();
  const text = new TextDecoder().decode(data);
  const der = text.includes("-----BEGIN CERTIFICATE-----")
    ? pemToDer(forge, text)
    : bytesToBinary(data);
  return {
    pem: forge.pem.encode({ type: "CERTIFICATE", body: der }),
    info: describeAsn1(forge, forge.asn1.fromDer(der)),
  };
};

export const certInfo = async (pem: string) => {
  const forge = await loadForge();
  return describeAsn1(forge, forge.asn1.fromDer(pemToDer(forge, pem)));
};

const OIDS = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  sha1: "1.3.14.3.2.26",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2",
  signingTime: "1.2.840.113549.1.9.5",
  keyBag: "1.2.840.113549.1.12.10.1.1",
  shroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
  certBag: "1.2.840.113549.1.12.10.1.3",
  aes256Cbc: "2.16.840.1.101.3.4.1.42",
  sha512: "2.16.840.1.101.3.4.2.3",
};

/** WebCrypto's names of the digests a signature may use, by OID. */
const WEB_HASHES: Record<string, string> = {
  [OIDS.sha1]: "SHA-1",
  [OIDS.sha256]: "SHA-256",
  [OIDS.sha384]: "SHA-384",
  [OIDS.sha512]: "SHA-512",
};

/**
 * An RSA signature (PKCS#1 v1.5, RFC 8017 §8.2) over `data` by the key in `spki`, checked by
 * WebCrypto, which hashes `data` itself and parses the signature strictly. Never with node-forge:
 * its `publicKey.verify` takes forged PKCS#1 signatures (GHSA-86w9-cpqp-85rv, all versions up to
 * 1.4.0, no fix yet); forge only builds and unpacks messages here.
 */
const rsaVerifies = async (
  spki: Uint8Array<ArrayBuffer>,
  hash: string,
  signature: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<boolean> => {
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash };
  const key = await crypto.subtle.importKey("spki", spki, algorithm, false, ["verify"]);
  return crypto.subtle.verify(algorithm, key, signature, data);
};

export type OwnSmime = { key: pki.rsa.PrivateKey; cert: pki.Certificate; info: CertInfo };

/** One's certificate and key from a .p12 file and its password; throws on a wrong password. */
export const openP12 = async (data: Uint8Array, password: string): Promise<OwnSmime> => {
  const forge = await loadForge();
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytesToBinary(data)), password);
  const bags = (type: string) => p12.getBags({ bagType: type })[type] ?? [];
  const key = (bags(OIDS.shroudedKeyBag)[0] ?? bags(OIDS.keyBag)[0])?.key as
    | pki.rsa.PrivateKey
    | undefined;
  const certs = bags(OIDS.certBag)
    .map((bag) => bag.cert)
    .filter((cert): cert is pki.Certificate => Boolean(cert));
  // The certificate that belongs to the key.
  const cert = certs.find(
    (candidate) => key && (candidate.publicKey as pki.rsa.PublicKey).n.equals(key.n),
  );
  if (!key || !cert) throw new Error("Kein Schlüssel mit Zertifikat in der Datei");
  return { key, cert, info: await describeCert(cert) };
};

export type SmimeSignature =
  | {
      state: "valid";
      email: string;
      info: CertInfo;
      pem: string;
      /** The other certificates the signature brought (intermediates), for the trust check. */
      chain: string[];
    }
  | { state: "invalid" }
  /** Signed with a key that cannot be checked here (a curve WebCrypto lacks): neither good nor forged. */
  | { state: "unsupported" }
  | { state: "none" };

/**
 * Checks a CMS SignedData (RFC 5652) over `content`: the digest in its signed attributes, and the
 * signature over those attributes with the signer's certificate in it. Whether a known authority
 * issued the certificate is not judged here; its issuer is shown.
 */
export const checkSignedData = async (
  der: Uint8Array,
  detachedContent: Uint8Array | null,
): Promise<{ signature: SmimeSignature; content: Uint8Array | null }> => {
  const forge = await loadForge();
  const { asn1 } = forge;
  try {
    const info = asn1.fromDer(bytesToBinary(der));
    const signedData = (info.value as Asn1[])[1]!.value[0] as Asn1;
    const parts = signedData.value as Asn1[];
    const encap = parts[2]!.value as Asn1[];
    // Content wrapped inside (opaque signing): an OCTET STRING, possibly in pieces.
    const octets = (encap[1]?.value as Asn1[] | undefined)?.[0];
    const wrapped = octets
      ? binaryToBytes(
          Array.isArray(octets.value)
            ? (octets.value as Asn1[]).map((piece) => piece.value as string).join("")
            : (octets.value as string),
        )
      : null;
    const content = detachedContent ?? wrapped;
    if (!content) return { signature: { state: "none" }, content: null };
    const certsNode = parts.find(
      (part) => part.tagClass === asn1.Class.CONTEXT_SPECIFIC && part.type === 0,
    );
    // Every certificate as PEM; forge reads only those with RSA keys, EC ones go by their DER.
    const brought = ((certsNode?.value as Asn1[]) ?? []).map((node) => {
      const pemText = forge.pem.encode({ type: "CERTIFICATE", body: asn1.toDer(node).getBytes() });
      try {
        return { pem: pemText, node, cert: forge.pki.certificateFromAsn1(node) };
      } catch {
        return { pem: pemText, node, cert: null };
      }
    });
    const signerInfo = (parts.at(-1)!.value as Asn1[])[0]!.value as Asn1[];
    const sid = signerInfo[1]!;
    const serial = forge.util
      .createBuffer((sid.value as Asn1[])[1]!.value as string)
      .toHex()
      .replace(/^0+/, "");
    const signer = brought.find((entry) => serialOf(forge, entry.node) === serial) ?? brought[0];
    const ecKey = signer && !signer.cert ? ecKeyOf(forge, signer.node) : null;
    // Neither RSA nor a curve WebCrypto knows: say so, not "forged".
    if (signer && !signer.cert && !ecKey) return { signature: { state: "unsupported" }, content };
    const digestOid = asn1.derToOid((signerInfo[2]!.value as Asn1[])[0]!.value as string);
    const md = () =>
      digestOid === OIDS.sha1
        ? forge.md.sha1.create()
        : digestOid === OIDS.sha384
          ? forge.md.sha384.create()
          : digestOid === OIDS.sha512
            ? forge.md.sha512.create()
            : forge.md.sha256.create();
    const attrs = signerInfo.find(
      (part) => part.tagClass === asn1.Class.CONTEXT_SPECIFIC && part.type === 0,
    );
    const signature = signerInfo.at(-1)!.value as string;
    if (!signer || !attrs) return { signature: { state: "invalid" }, content };
    // The digest of the content must be the one signed.
    const contentDigest = md();
    contentDigest.update(bytesToBinary(content));
    const signedDigest = (attrs.value as Asn1[])
      .map((attr) => attr.value as Asn1[])
      .find((attr) => asn1.derToOid(attr[0]!.value as string) === OIDS.messageDigest)?.[1]?.value as
      | Asn1[]
      | undefined;
    if (signedDigest?.[0]?.value !== contentDigest.digest().getBytes()) {
      return { signature: { state: "invalid" }, content };
    }
    // The signature is over the attributes, encoded as a SET.
    const set = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrs.value as Asn1[]);
    const hash = WEB_HASHES[digestOid] ?? "SHA-256";
    const signed = binaryToBytes(asn1.toDer(set).getBytes());
    const ok = signer.cert
      ? await rsaVerifies(
          binaryToBytes(asn1.toDer(forge.pki.publicKeyToAsn1(signer.cert.publicKey)).getBytes()),
          hash,
          binaryToBytes(signature),
          signed,
        )
      : await ecdsaVerifies(forge, ecKey!, hash, binaryToBytes(signature), signed);
    if (!ok) return { signature: { state: "invalid" }, content };
    const described = describeAsn1(forge, signer.node);
    return {
      signature: {
        state: "valid",
        email: described.emails[0] ?? "",
        info: described,
        pem: signer.pem,
        chain: brought.filter((entry) => entry !== signer).map((entry) => entry.pem),
      },
      content,
    };
  } catch {
    return { signature: { state: "invalid" }, content: detachedContent };
  }
};

/** Decrypts an EnvelopedData with one's key: the inner MIME entity. */
export const decryptEnveloped = async (der: Uint8Array, own: OwnSmime): Promise<Uint8Array> => {
  const forge = await loadForge();
  const message = forge.pkcs7.messageFromAsn1(
    forge.asn1.fromDer(bytesToBinary(der)),
  ) as pkcs7.PkcsEnvelopedData;
  const recipient = message.findRecipient(own.cert);
  if (!recipient) throw new Error("Nicht an dieses Zertifikat verschlüsselt");
  message.decrypt(recipient, own.key as unknown as pki.rsa.PrivateKey);
  return binaryToBytes((message.content as util.ByteStringBuffer).getBytes());
};

const base64Lines = (binary: string) => (btoa(binary).match(/.{1,76}/g) ?? []).join("\r\n");

/** A MIME entity signed (multipart/signed, detached, SHA-256). */
export const signEntity = async (entity: string, own: OwnSmime, id: string): Promise<string> => {
  const forge = await loadForge();
  const canonical = entity.replace(/\r?\n/g, "\r\n");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(forge.util.encodeUtf8(canonical));
  p7.addCertificate(own.cert);
  p7.addSigner({
    key: own.key,
    certificate: own.cert,
    digestAlgorithm: OIDS.sha256,
    authenticatedAttributes: [
      { type: OIDS.contentType, value: OIDS.data },
      { type: OIDS.messageDigest },
      { type: OIDS.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const signature = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const boundary = `sig-${id}`;
  return [
    `Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    canonical,
    `--${boundary}`,
    'Content-Type: application/pkcs7-signature; name="smime.p7s"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="smime.p7s"',
    "",
    base64Lines(signature),
    `--${boundary}--`,
    "",
  ].join("\r\n");
};

/** A MIME entity encrypted to these certificates (AES-256-CBC, RSA key transport). */
export const envelopeEntity = async (entity: string, certPems: string[]): Promise<string> => {
  const forge = await loadForge();
  const p7 = forge.pkcs7.createEnvelopedData();
  for (const pem of certPems) p7.addRecipient(forge.pki.certificateFromPem(pem));
  p7.content = forge.util.createBuffer(forge.util.encodeUtf8(entity));
  p7.encrypt(undefined, OIDS.aes256Cbc);
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return [
    'Content-Type: application/pkcs7-mime; smime-type=enveloped-data; name="smime.p7m"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="smime.p7m"',
    "",
    base64Lines(der),
    "",
  ].join("\r\n");
};
