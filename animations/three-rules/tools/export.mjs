// Export the film to MP4 (H.264 + AAC), frame-exact, from the same renderer.
// usage: node tools/export.mjs [out.mp4] [fps] [width]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const ffmpeg = require('ffmpeg-static');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'out/pandion-three-rules.mp4'));
const fps = +(process.argv[3] || 60);
const width = +(process.argv[4] || 1920);
const scale = width / 1920;
const wav = path.join(ROOT, 'out/score-48k.wav');
if (!fs.existsSync(wav) || process.env.REAUDIO) {
  await new Promise((res, rej) => { const p = spawn(process.execPath, [path.join(ROOT, 'tools/audio.mjs'), wav, '48000'], { stdio: 'inherit' }); p.on('exit', c => c === 0 ? res() : rej(new Error('audio'))); });
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.join(ROOT, 'dev.html')).href + '?static=1&scale=' + scale);
await page.waitForTimeout(400);
const duration = await page.evaluate(() => DURATION);
const total = duration + 2.0; // hold the final frame while the last chord rings
const nFrames = Math.round(total * fps);
const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', 'pipe:0',
  '-i', wav, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), out];
const ff = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', d => { ffErr += d.toString(); if (ffErr.length > 20000) ffErr = ffErr.slice(-10000); });
const t0 = Date.now();
for (let i = 0; i < nFrames; i++) {
  const t = i / fps;
  const b64 = await page.evaluate((t) => { window.__render(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);
  const buf = Buffer.from(b64, 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % (fps * 5) === 0) process.stdout.write(`frame ${i}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}
ff.stdin.end();
const code = await new Promise(r => ff.on('exit', r));
await browser.close();
if (code !== 0) { console.log(ffErr.slice(-3000)); process.exit(1); }
if (errors.length) console.log('PAGE ERRORS', errors);
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB', `in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
