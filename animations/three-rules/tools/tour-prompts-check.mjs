// Harper's spoken prompts in hands-on mode, on the Learn page itself: nothing
// is fetched before Try it yourself; that click turns the sound on and loads
// the prompts file; at every stop she starts that stop's clip (the right span
// of the file, a beat after the coach card, at the narration's gain) and she
// fades out the moment the viewer acts; a drag let go too early does not
// make her repeat herself; muting stops her and keeps her quiet (and Try it
// yourself then leaves the sound off); sound turned on at a stop speaks that
// stop; the end card gets its line; Watch mode never plays a prompt.
// usage: node tools/tour-prompts-check.mjs <learn page url> [chromium|webkit]
import { chromium, webkit } from 'playwright';
const url = process.argv[2];
const engineName = process.argv[3] || 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], promptReq = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('response', r => { if (r.url().includes('pandion-three-rules-prompts')) promptReq.push(r.url().split('/').pop() + ' ' + r.status()); });
/* log every buffer source that plays the prompts file (mono, about 29 s):
 * when (relative to now), offset, duration, its gain, and when it is stopped */
await page.addInitScript(() => {
  window.__src = [];
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop, conn = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...r) { if (this instanceof AudioBufferSourceNode) this.__to = d; return conn.call(this, d, ...r); };
  AudioBufferSourceNode.prototype.start = function (when, off, len) {
    const b = this.buffer;
    if (b && b.numberOfChannels === 1 && b.duration > 20) {
      this.__rec = { lead: (when || 0) - this.context.currentTime, off, len, gain: this.__to && this.__to.gain ? this.__to.gain.value : null, at: performance.now(), stopLead: null };
      window.__src.push(this.__rec);
    }
    return start.call(this, when, off, len);
  };
  AudioBufferSourceNode.prototype.stop = function (when) {
    if (this.__rec) this.__rec.stopLead = (when || 0) - this.context.currentTime;
    return stop.call(this, when);
  };
});
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const api = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, waiting: a.waiting, playing: a.playing, sound: a.sound, prompt: a.prompt, spoken: a.spoken, ready: a.promptsReady, mode: a.mode }; });
const srcs = () => page.evaluate(() => window.__src.map(r => ({ ...r })));
const waitFor = (fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const waitGate = (id, timeout = 25000) => waitFor((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === id, id, timeout);
const stageBox = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
const center = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
const shape = (id) => page.evaluate((id) => window.PandionThreeRules.guide.shape(id), id);
const CLIPS = { r1it: [0.600, 3.125], bar: [3.725, 5.290], swatch: [5.890, 7.210], type: [7.810, 10.445], r2it: [11.045, 14.085],
  bardrag: [14.685, 17.140], r3btn: [17.740, 19.995], points: [20.595, 22.010], legR: [22.610, 25.940], end: [26.540, 28.860] };
async function clickGate(id) {
  const s = await shape(id), b = await stageBox(), c = toPage(b, center(s.beacon));
  await page.mouse.move(c[0], c[1], { steps: 3 });
  await page.mouse.down(); await page.mouse.up();
}
async function dragGate(id, frac) {
  const s = await shape(id), b = await stageBox();
  const grab = center((s.grab || s.hit)[0]), d = [s.to[0] - s.from[0], s.to[1] - s.from[1]];
  const a = toPage(b, grab), e = toPage(b, [grab[0] + d[0] * frac, grab[1] + d[1] * frac]);
  await page.mouse.move(a[0], a[1], { steps: 3 });
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(a[0] + (e[0] - a[0]) * i / 14, a[1] + (e[1] - a[1]) * i / 14); await page.waitForTimeout(16); }
  await page.waitForTimeout(100);
  await page.mouse.up();
}
function checkClip(rec, id, label) {
  const c = CLIPS[id];
  ok(rec && Math.abs(rec.off - c[0]) < 0.002 && Math.abs(rec.len - (c[1] - c[0])) < 0.002,
    `${label}: plays the "${id}" clip (${rec ? rec.off.toFixed(3) + ' + ' + rec.len.toFixed(3) + ' s' : 'nothing'})`);
  ok(rec && rec.lead > 0.2 && rec.lead < 0.36, `${label}: starts a beat after the coach card (${rec ? rec.lead.toFixed(3) : '-'} s)`);
  ok(rec && Math.abs(rec.gain - 1.26) < 1e-6, `${label}: at the narration's gain (${rec ? rec.gain : '-'})`);
}

await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
ok(await waitGate('hub'), 'the intro plays and stops on the start card');
let s = await api();
ok(!s.sound && promptReq.length === 0, 'sound off and no prompts fetched before Try it yourself');

/* Try it yourself: sound on, prompts fetched, the first stop is spoken */
await page.click('.ptr-hub-go');
s = await api();
ok(s.sound, 'Try it yourself turns the sound on');
ok(await waitGate('r1it'), 'the tour stops at the first step');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.prompt === 'r1it', null, 3000), 'Harper speaks the first step');
ok(promptReq.length === 1 && /prompts\.webm 200$/.test(promptReq[0]), `fetched ${promptReq.join(', ')}`);
let S = await srcs();
checkClip(S[0], 'r1it', 'first stop');
/* acting mid-prompt fades her out */
await page.waitForTimeout(500);
await clickGate('r1it');
s = await api();
S = await srcs();
ok(s.prompt === null && S[0].stopLead !== null && S[0].stopLead > 0.05 && S[0].stopLead < 0.2, `clicking the word fades her out (stop in ${S[0].stopLead === null ? '-' : S[0].stopLead.toFixed(3)} s)`);

/* the next stop: the bar */
ok(await waitGate('bar'), 'the tour stops at the bar');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.spoken.length === 2, null, 3000), 'the bar prompt starts');
S = await srcs();
checkClip(S[1], 'bar', 'bar stop');
/* let her finish, then act: nothing to stop */
await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.prompt === null, null, 4000);
ok((await api()).prompt === null, 'the clip ends on its own');
await clickGate('bar');

/* mute at the swatch: she stops, and stays quiet at the next stop */
ok(await waitGate('swatch'), 'the tour stops at the swatch');
await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.spoken.length === 3, null, 3000);
await page.waitForTimeout(300);
await page.click('.ptr-btn[aria-label="Sound"]');
s = await api();
S = await srcs();
ok(!s.sound && s.prompt === null && S[2].stopLead !== null, 'muting stops her at once');
await page.click('.ptr-show');
ok(await waitGate('type'), 'Show me, then the tour stops at the typing step');
await page.waitForTimeout(800);
s = await api();
ok(s.spoken.length === 3 && s.prompt === null, `muted: the typing step is silent (spoken: ${s.spoken.join(', ')})`);
/* sound back on at a stop: she says that stop */
await page.click('.ptr-btn[aria-label="Sound"]');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.prompt === 'type', null, 3000), 'sound back on at a stop speaks it');
await page.focus('.ptr-type');   /* the sound button took the focus */
await page.keyboard.type('Dose', { delay: 60 });
ok((await api()).prompt === 'type', 'typing does not stop her');
await page.keyboard.press('Enter');
ok((await api()).prompt === null, 'Enter (the step done) fades her out');

/* a drag let go too early: she does not repeat herself */
ok(await waitGate('r2it'), 'the tour stops at the Rule 2 title');
await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.spoken.length === 5, null, 3000);
await dragGate('r2it', 0.2);
await page.waitForTimeout(700);
s = await api();
ok(s.waiting === 'r2it' && s.spoken.length === 5, `let go at 20%: back at the stop, no repeat (spoken ${s.spoken.length})`);
await dragGate('r2it', 1.04);
ok(await waitGate('bardrag'), 'finishing the drag moves on to the bar drag');
await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.spoken.length === 6, null, 3000);
S = await srcs();
checkClip(S[S.length - 1], 'bardrag', 'bar-drag stop');

/* the end card gets its line */
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(a.duration - 1.2); a.play(); });
ok(await waitFor(() => { const e = document.querySelector('.ptr-end'); return e && !e.hidden; }, null, 6000), 'the end card appears');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.prompt === 'end', null, 3000), 'Harper says the end card line');
S = await srcs();
checkClip(S[S.length - 1], 'end', 'end card');

/* Watch mode never plays a prompt */
const before = (await api()).spoken.length;
await page.click('.ptr-end-watch');
await waitFor(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.mode === 'watch' && a.playing; }, null, 30000);
s = await api();
ok(s.prompt === null, 'Watch mode: the end line stops when the narrated film starts');
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(20); a.play(); });
await page.waitForTimeout(1500);
s = await api();
ok(s.spoken.length === before && s.prompt === null, 'Watch mode plays no prompts');

/* a viewer who muted: Try it yourself leaves the sound off */
await page.click('.ptr-btn[aria-label="Narration and sound"]');
await page.click('.ptr-mode');   /* back to hands-on */
s = await api();
ok(!s.sound && s.mode === 'try', 'muted, then back to hands-on');
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(0); a.play(); });
ok(await waitGate('hub', 30000), 'replayed to the start card');
await page.click('.ptr-hub-go');
ok(await waitGate('r1it'), 'at the first step again');
await page.waitForTimeout(700);
s = await api();
ok(!s.sound && s.prompt === null && s.spoken.length === before, 'after muting, Try it yourself keeps the sound off');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors or warnings');
console.log(fails ? fails + ' FAILED' : 'all passed');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
