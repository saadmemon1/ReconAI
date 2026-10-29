import { describe, test, expect } from 'bun:test';
import { p256 } from '@noble/curves/p256';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { parseZatca } from '../zatca';

type Field = [number, string | Buffer];
const tlv = (fields: Field[]) =>
  Buffer.concat(fields.map(([tag, v]) => { const b = typeof v === 'string' ? Buffer.from(v, 'utf8') : v; return Buffer.concat([Buffer.from([tag, b.length]), b]); })).toString('base64');
const BASE: Field[] = [[1, 'Modern Distribution Co.'], [2, '310231837700003'], [3, '2026-09-02T09:01:34'], [4, '57.50'], [5, '7.50']];

// SubjectPublicKeyInfo headers: what a ZATCA QR's tag 8 carries in front of the 65-byte point
const SPKI = { k1: '3056301006072a8648ce3d020106052b8104000a034200', p256: '3059301306072a8648ce3d020106082a8648ce3d030107034200' };
function phase2(curve: typeof secp256k1 | typeof p256, spki: string, signSha: boolean, tamper = false) {
  const priv = curve.utils.randomPrivateKey();
  const hash = sha256(Buffer.from('<Invoice>...</Invoice>'));
  const sig = curve.sign(signSha ? sha256(hash) : hash, priv, { prehash: false }).toDERRawBytes();
  const hashB64 = Buffer.from(tamper ? sha256(Buffer.from('another invoice')) : hash).toString('base64');
  return tlv([...BASE, [6, hashB64], [7, Buffer.from(sig).toString('base64')], [8, Buffer.concat([Buffer.from(spki, 'hex'), Buffer.from(curve.getPublicKey(priv, false))])], [9, Buffer.from([0x30, 0x00])]]);
}

describe('parseZatca', () => {
  test('reads the five ZATCA fields of a phase-1 code', () => {
    expect(parseZatca(tlv(BASE))).toEqual({
      seller: 'Modern Distribution Co.', vat_no: '310231837700003', time: '2026-09-02T09:01:34', total: 57.5, vat: 7.5,
      phase: 1, signature: null, signature_scheme: null, invoice_hash: null, public_key: null,
    });
  });
  test('keeps an empty VAT number (a seller that is not VAT-registered)', () => {
    expect(parseZatca(tlv([[1, 'مؤسسة'], [2, ''], [3, 't'], [4, '280.00'], [5, '0.00']]))).toMatchObject({ vat_no: '', total: 280, vat: 0 });
  });
  test('is null for anything that is not a ZATCA code: a URL, an activation number, a truncated payload', () => {
    expect(parseZatca('https://zajil-express.com/ar/a')).toBeNull();
    expect(parseZatca('59716401477378')).toBeNull();
    const code = tlv([[1, 'X'], [2, '300000000000003'], [4, '10.00']]);
    expect(parseZatca(code.slice(0, code.length - 4))).toBeNull();
  });
  test('a total that is not a number is null, not a guess', () => {
    expect(parseZatca(tlv([[1, 'X'], [2, '300000000000003'], [3, 't'], [4, 'ten'], [5, '1.30']]))?.total).toBeNull();
  });
});

describe('phase-2 signature', () => {
  test('verifies on secp256k1 when the invoice hash itself is signed (as the STC receipt does)', () => {
    expect(parseZatca(phase2(secp256k1, SPKI.k1, false))).toMatchObject({ phase: 2, signature: 'verified', signature_scheme: 'secp256k1, the invoice hash' });
  });
  test('verifies on P-256 when SHA-256 of the invoice hash is signed (as most suppliers here do)', () => {
    expect(parseZatca(phase2(p256, SPKI.p256, true))).toMatchObject({ signature: 'verified', signature_scheme: 'P-256, SHA-256 of the invoice hash' });
  });
  test('a signature that does not fit is "not checked", never "invalid": it may cover the XML the QR does not carry', () => {
    expect(parseZatca(phase2(p256, SPKI.p256, true, true))).toMatchObject({ phase: 2, signature: 'not_checked' });
  });
});
