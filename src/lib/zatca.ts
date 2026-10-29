// ZATCA QR payloads (base64 TLV): read the fields and check a phase-2 signature. Pure, shared by the QR decoder script
// (scripts/abujhd/qr_decode.ts) and the app's server, which checks a QR text a reviewer pastes in from a phone scan.
import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

export interface Zatca {
  seller: string; vat_no: string; time: string; total: number | null; vat: number | null;
  /** 1: tags 1-5 only, unsigned. 2: tags 6-9 present (e-invoicing phase 2). */
  phase: 1 | 2;
  /** Phase 2: 'verified' when tag 7 is a valid signature of the tag-6 invoice hash under the tag-8 public key, by one of the schemes seen
   *  in practice. It proves the code came from that device unaltered; it does not cover tags 4-5 (they sit outside the hash), which only
   *  the XML e-invoice can prove. 'not_checked' means no known scheme fits (a signature over the XML's signed properties cannot be checked
   *  from the QR alone): it is never reported as invalid. */
  signature: 'verified' | 'not_checked' | null;
  /** How it verified: the curve and what was signed, e.g. "P-256, SHA-256 of the invoice hash". */
  signature_scheme: string | null;
  invoice_hash: string | null;
  public_key: string | null;
}
const CURVES = [
  { oid: '2b8104000a', name: 'secp256k1', curve: secp256k1 },        // the curve ZATCA's onboarding uses
  { oid: '2a8648ce3d030107', name: 'P-256', curve: p256 },           // seen on several suppliers' devices
];

/** Tag 7 checked against tag 6 with the tag-8 key, on the curve the key names: the hash itself as the digest, or SHA-256 of it. */
export function checkSignature(tags: Record<number, Buffer>): Pick<Zatca, 'signature' | 'signature_scheme'> {
  if (!tags[6] || !tags[7] || !tags[8]) return { signature: null, signature_scheme: null };
  const key = tags[8].toString('hex');
  const c = CURVES.find(x => key.includes(x.oid));
  if (!c) return { signature: 'not_checked', signature_scheme: null };
  try {
    const hash = Buffer.from(tags[6].toString('utf8'), 'base64');
    const sig = Buffer.from(tags[7].toString('utf8'), 'base64');   // DER-encoded
    const point = tags[8].subarray(tags[8].length - 65);   // the SubjectPublicKeyInfo ends with the 65-byte uncompressed point
    for (const [what, digest] of [['the invoice hash', hash], ['SHA-256 of the invoice hash', sha256(hash)]] as const) {
      if (c.curve.verify(sig, digest, point, { prehash: false, lowS: false, format: 'der' })) return { signature: 'verified', signature_scheme: `${c.name}, ${what}` };
    }
  } catch { /* a malformed signature or key is not checkable, not proof of tampering */ }
  return { signature: 'not_checked', signature_scheme: c.name };
}

/** The ZATCA fields of a QR payload, or null when it is not a ZATCA TLV code (a URL, an activation number). */
export function parseZatca(text: string): Zatca | null {
  const t = text.trim();
  if (!/^[A-Za-z0-9+/=\s]+$/.test(t)) return null;
  const b = Buffer.from(t, 'base64');
  const tags: Record<number, Buffer> = {};
  let i = 0;
  while (i + 2 <= b.length) {
    const tag = b[i], len = b[i + 1];
    if (tag < 1 || tag > 9 || i + 2 + len > b.length) return null;
    tags[tag] = b.subarray(i + 2, i + 2 + len);
    i += 2 + len;
  }
  if (i !== b.length || !tags[1] || !tags[4]) return null;
  const s = (n: number) => tags[n]?.toString('utf8').trim() ?? '';
  const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  const phase = tags[6] || tags[7] || tags[8] ? 2 : 1;
  return {
    seller: s(1), vat_no: s(2), time: s(3), total: num(s(4)), vat: num(s(5)), phase,
    ...(phase === 2 ? checkSignature(tags) : { signature: null, signature_scheme: null }),
    invoice_hash: tags[6] ? s(6) : null, public_key: tags[8] ? tags[8].toString('hex') : null,
  };
}
