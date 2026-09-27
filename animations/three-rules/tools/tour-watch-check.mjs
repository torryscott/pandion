// Watch mode is the narrated film (ElevenLabs v3, Harper Lawson). On the Learn
// page itself: Just watch on the start card turns narration on and fetches the
// Opus voice (never before), plays the film from the top with captions, holds
// the last frame until the last word; the Hands-on switch trades clocks both
// ways; and (Chromium, when given the offline master) the mix the player
// builds matches the narration pipeline's mix.
// usage: node tools/tour-watch-check.mjs <learn page url> [chromium|webkit] [offline mix-48k.wav]
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const url = process.argv[2];
const engineName = process.argv[3] || 'chromium';
const masterWav = process.argv[4] || null;
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], voiceReq = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('response', r => { if (r.url().includes('pandion-three-rules-voice')) voiceReq.push(r.url().split('/').pop() + ' ' + r.status()); });
await page.addInitScript(() => {
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (d, t) { if (d && d.sampleRate) window.__voiceLen = d.voice ? d.voice.data.length / d.sampleRate : 0; return post.call(this, d, t); };
});
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const P = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, playing: a.playing, mode: a.mode, waiting: a.waiting, D: a.duration, sound: a.sound, ended: a.ended, vEnd: a.voiceEnd, cc: a.captions }; });
const cap = () => page.evaluate(() => { const c = document.querySelector('.ptr-cap'); return { shown: getComputedStyle(c).display !== 'none', text: c.textContent }; });
await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
await page.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'hub', null, { timeout: 20000 });
ok(voiceReq.length === 0, 'no voice download before Just watch');
await page.click('.ptr-hub-watch');
await page.waitForFunction(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.sound && a.playing && !document.querySelector('.ptr-bar .ptr-busy'); }, null, { timeout: 30000 });
let s = await P();
ok(s.mode === 'watch' && s.sound && s.t < 3, `Just watch plays the narrated film from the top, sound on (t=${s.t.toFixed(2)})`);
ok(s.D > 80 && s.D < 95, `Watch mode runs the narrated film (${s.D.toFixed(2)} s)`);
ok(voiceReq.some(r => /pandion-three-rules-voice\.webm 200$/.test(r)) && !voiceReq.some(r => r.includes('.flac')), `fetched ${voiceReq.join(', ')}`);
const vl = await page.evaluate(() => window.__voiceLen);
ok(vl > s.D && vl < s.D + 6, `the worker mixed a ${vl.toFixed(2)} s voice under the ${s.D.toFixed(2)} s film`);
const btn = await page.evaluate(() => { const b = document.querySelector('.ptr-bar .ptr-snd'); const c = document.querySelector('.ptr-ccb'); return { text: b && b.innerText.trim(), aria: b && b.getAttribute('aria-label'), cc: getComputedStyle(c).display !== 'none', ccPressed: c.getAttribute('aria-pressed') }; });
ok(btn.text === 'Narration' && btn.aria === 'Narration and sound', `the sound button reads "${btn.text}"`);
ok(btn.cc && btn.ccPressed === 'true', 'captions button shown, captions on');
await page.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.time > 2.2, null, { timeout: 10000 });
let c = await cap();
ok(c.shown && /Every chart in Pandion follows three simple rules/.test(c.text), `caption under the picture: "${c.text}"`);
/* captions off and on */
await page.click('.ptr-ccb');
c = await cap();
ok(!c.shown, 'CC off hides the caption band');
await page.click('.ptr-ccb');
c = await cap();
ok(c.shown, 'CC on shows it again');
/* the Rule 1 line, later in the film */
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(19.5); a.play(); });
await page.waitForTimeout(600);
c = await cap();
ok(/every outlined bar follows/.test(c.text), `Rule 1 caption: "${c.text}"`);
/* the end: the last frame holds until the last word, then it ends */
s = await P();
await page.evaluate((D) => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(D - 1.2); a.play(); }, s.D);
await page.waitForTimeout(1800);
let e1 = await P();
ok(e1.playing && e1.t > e1.D && e1.vEnd > e1.D, `holds the last frame while the tagline finishes (t=${e1.t.toFixed(2)}, film ${e1.D.toFixed(2)}, voice ends ${e1.vEnd.toFixed(2)})`);
await page.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.ended, null, { timeout: 8000 }).catch(() => {});
e1 = await P();
ok(e1.ended && !e1.playing, 'then the film ends');
ok(await page.evaluate(() => document.querySelector('.ptr-end').hidden), 'no end card after watching');
/* Hands-on and back, mid-film: the clocks trade */
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(30); a.play(); });
await page.waitForTimeout(400);
const before = await P();
await page.click('.ptr-mode');
let h = await P();
ok(h.mode === 'try' && h.D < 50 && h.t < before.t, `Hands-on: story clock (t ${before.t.toFixed(2)} film -> ${h.t.toFixed(2)} story)`);
await page.waitForFunction(() => !!document.querySelector('[data-pandion-three-rules]').__ptr.waiting, null, { timeout: 15000 }).catch(() => {});
h = await P();
ok(!!h.waiting, `and the tour stops at its next step (${h.waiting})`);
await page.click('.ptr-mode');
await page.waitForTimeout(300);
const back = await P();
ok(back.mode === 'watch' && back.D > 80 && back.playing, `Watch again: film clock (t=${back.t.toFixed(2)})`);
/* the mix the player built matches the pipeline's offline master (Chromium: it decodes Opus sample exact) */
if (masterWav && engineName === 'chromium') {
  const mix = await page.evaluate(() => {
    const b = document.querySelector('[data-pandion-three-rules]').__ptr.narrationMix;
    const L = b.getChannelData(0), R = b.getChannelData(1), sr = b.sampleRate, w = Math.round(0.05 * sr), out = [];
    for (let i = 0; i + w <= L.length; i += w) { let a = 0; for (let k = i; k < i + w; k++) { const v = (L[k] + R[k]) / 2; a += v * v; } out.push(10 * Math.log10(a / w + 1e-12)); }
    return out;
  });
  const py = path.join(os.homedir(), 'Desktop/Pandion Learn Animation ElevenLabs/.venv-tts/bin/python');
  const ref = JSON.parse(execFileSync(py, ['-c', `
import sys, json, numpy as np, soundfile as sf
y, sr = sf.read(sys.argv[1], dtype='float64', always_2d=True); m = y.mean(axis=1); w = round(0.05 * sr)
n = len(m) // w
print(json.dumps((10 * np.log10((m[:n * w].reshape(n, w) ** 2).mean(axis=1) + 1e-12)).tolist()))`, masterWav]).toString());
  const n = Math.min(mix.length, ref.length);
  const a = [], b = [];
  for (let i = 0; i < n; i++) if (ref[i] > -60) { a.push(mix[i]); b.push(ref[i]); }
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  const r = sab / Math.sqrt(saa * sbb);
  ok(r > 0.98 && Math.abs(ma - mb) < 1, `the player's mix matches the offline master (envelope r=${r.toFixed(4)}, level ${(ma - mb).toFixed(2)} dB apart)`);
}
/* phones: Just watch in the step card carries on from that step, narrated, from the start of the sentence under way */
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: engineName === 'chromium', hasTouch: true });
  const ph = await ctx2.newPage();
  ph.on('pageerror', e => errors.push('phone: ' + e.message));
  await ph.goto(url);
  await ph.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
  await ph.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'hub', null, { timeout: 20000 });
  await ph.click('.ptr-hub-go');
  await ph.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'r1it', null, { timeout: 20000 });
  await ph.click('.ptr-watchrest');
  await ph.waitForFunction(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.sound && a.playing && a.mode === 'watch'; }, null, { timeout: 30000 });
  const q = await ph.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, D: a.duration }; });
  ok(q.D > 80 && q.t > 6.5 && q.t < 8, `phone: Just watch at the Rule 1 step carries on narrated from its sentence (t=${q.t.toFixed(2)})`);
  await ph.waitForTimeout(700);
  const pc = await ph.evaluate(() => document.querySelector('.ptr-cap').textContent);
  ok(/Want to change something\? Just click it\./.test(pc), `phone caption: "${pc}"`);
  await ctx2.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors or warnings');
console.log(fails ? fails + ' FAILED' : 'all passed');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
