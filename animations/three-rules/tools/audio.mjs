// Render the soundtrack in headless Chromium (same code the page runs) and
// save it as a 16-bit WAV. usage: node tools/audio.mjs [out.wav] [sampleRate]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'out/score.wav'));
const sr = +(process.argv[3] || 48000);
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=0.1');
const res = await page.evaluate((sr) => {
  const t0 = performance.now();
  const r = renderSoundtrack({ sampleRate: sr, duration: DURATION, cues: SFX, finale: FINALE });
  const ms = performance.now() - t0;
  const n = r.left.length;
  const pcm = new Int16Array(n * 2);
  let peak = 0, clip = 0;
  for (let i = 0; i < n; i++) {
    const l = r.left[i], rr = r.right[i];
    peak = Math.max(peak, Math.abs(l), Math.abs(rr));
    if (Math.abs(l) >= 0.999 || Math.abs(rr) >= 0.999) clip++;
    pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
    pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(rr * 32767)));
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), ms, n, peak, clip };
}, sr);
const data = Buffer.from(res.b64, 'base64');
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([hdr, data]));
console.log(`rendered ${(res.n / sr).toFixed(2)} s in ${res.ms.toFixed(0)} ms, peak ${res.peak.toFixed(3)}, clipped samples ${res.clip}`);
if (errors.length) console.log('ERRORS', errors);
await browser.close();
