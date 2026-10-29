// scripts/abujhd/qr_decode.ts
// Step Q: decode every QR code on the receipt pages into DATA/qr.json. A ZATCA code is base64 TLV: 1 seller name, 2 seller VAT
// number, 3 timestamp, 4 invoice total, 5 VAT; a Phase-2 (e-invoicing) code adds 6 invoice hash, 7 ECDSA signature of that hash,
// 8 the seller device's public key, 9 ZATCA's signature of the device certificate. These are machine-read, not AI-read: b_match.py
// treats a decoded total as verified. A code that does not decode is recorded as nothing at all, never guessed. Pages whose bytes are
// unchanged reuse the cached result.
// Run: bun scripts/abujhd/qr_decode.ts --data data/<client>
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { readBarcodes } from 'zxing-wasm/reader';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseZatca, type Zatca } from '../../src/lib/zatca';

export { parseZatca };

export const DECODER = 'zxing-wasm 3.1.6, jsqr 1.4.0 fallback; signatures: secp256k1 and P-256 (DER)';

export interface QrCode { box: [number, number, number, number]; raw: string; zatca: Zatca | null; decoder: 'zxing' | 'jsqr' }
interface PageResult { sha256: string; width: number; height: number; codes: QrCode[] }
interface QrFile { decoder: string; built_at: string; pages: Record<string, PageResult> }

function sample(png: PNG, x0: number, y0: number, w: number, h: number, scale: number) {
  const W = Math.floor(w * scale), H = Math.floor(h * scale);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((y0 + Math.floor(y / scale)) * png.width + x0 + Math.floor(x / scale)) * 4, di = (y * W + x) * 4;
    out[di] = png.data[si]; out[di + 1] = png.data[si + 1]; out[di + 2] = png.data[si + 2]; out[di + 3] = 255;
  }
  return { data: out, width: W, height: H };
}

/** zxing over the whole page and over five half-size windows at twice the size; on a page where zxing reads no ZATCA code, jsQR's
 *  sliding windows as well (it reads some low-contrast codes zxing misses). Every distinct payload once. */
async function decodePage(png: PNG): Promise<QrCode[]> {
  const found = new Map<string, QrCode>();
  const add = (text: string, box: [number, number, number, number], decoder: QrCode['decoder']) => {
    if (text && !found.has(text)) found.set(text, { box: box.map(Math.round) as QrCode['box'], raw: text, zatca: parseZatca(text), decoder });
  };
  const w = Math.floor(png.width / 2), h = Math.floor(png.height / 2);
  const windows: Array<[number, number, number, number, number]> = [[0, 0, png.width, png.height, 1],
    ...[[0, 0], [w, 0], [0, h], [w, h], [Math.floor(w / 2), Math.floor(h / 2)]].map(([x, y]) => [x, y, w, h, 2] as [number, number, number, number, number])];
  for (const [x, y, ww, hh, scale] of windows) {
    const img = sample(png, x, y, ww, hh, scale);
    const res = await readBarcodes({ ...img, colorSpace: 'srgb' } as ImageData, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 20 });
    for (const r of res) {
      const p = r.position;
      const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x], ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
      add(r.text, [x + Math.min(...xs) / scale, y + Math.min(...ys) / scale, x + Math.max(...xs) / scale, y + Math.max(...ys) / scale], 'zxing');
    }
  }
  if ([...found.values()].some(c => c.zatca)) return [...found.values()];
  for (const frac of [1, 0.5, 0.34]) {
    const fw = Math.floor(png.width * frac), fh = Math.floor(png.height * frac);
    const stepX = frac === 1 ? png.width : Math.floor(fw / 2), stepY = frac === 1 ? png.height : Math.floor(fh / 2);
    for (let y = 0; y + fh <= png.height; y += stepY) {
      for (let x = 0; x + fw <= png.width; x += stepX) {
        for (const scale of [1, 2]) {
          if (fw * scale > 2600) continue;
          const img = sample(png, x, y, fw, fh, scale);
          const q = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (!q?.data) continue;
          const c = [q.location.topLeftCorner, q.location.topRightCorner, q.location.bottomLeftCorner, q.location.bottomRightCorner];
          add(q.data, [x + Math.min(...c.map(p => p.x)) / scale, y + Math.min(...c.map(p => p.y)) / scale,
            x + Math.max(...c.map(p => p.x)) / scale, y + Math.max(...c.map(p => p.y)) / scale], 'jsqr');
        }
      }
    }
  }
  return [...found.values()];
}

async function main() {
  const i = process.argv.indexOf('--data');
  const data = resolve(i > 0 ? process.argv[i + 1] : 'data/abujhd');
  const pagesDir = join(data, 'pages'), outFile = join(data, 'qr.json');
  const cached: QrFile | null = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  const reuse = cached?.decoder === DECODER ? cached.pages : {};
  const pages: Record<string, PageResult> = {};
  let decoded = 0, zatca = 0, signed = 0;
  for (const name of readdirSync(pagesDir).filter(n => /^page-\d+\.png$/.test(n)).sort()) {
    const bytes = readFileSync(join(pagesDir, name));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (reuse[name]?.sha256 === sha256) pages[name] = reuse[name];
    else {
      const png = PNG.sync.read(bytes);
      pages[name] = { sha256, width: png.width, height: png.height, codes: await decodePage(png) };
    }
    decoded += pages[name].codes.length;
    zatca += pages[name].codes.filter(c => c.zatca).length;
    signed += pages[name].codes.filter(c => c.zatca?.signature === 'verified').length;
  }
  const out: QrFile = { decoder: DECODER, built_at: new Date().toISOString().slice(0, 19), pages };
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`qr: ${Object.keys(pages).length} pages, ${decoded} codes, ${zatca} ZATCA, ${signed} with a verified signature`);
}

if (process.argv[1]?.endsWith('qr_decode.ts')) await main();   // run as a script, not when a test imports parseZatca
