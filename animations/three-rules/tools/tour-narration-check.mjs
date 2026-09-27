// The narrated hands-on tour, on the Learn page: Try it yourself turns the
// sound on, and once her narration loads the tour runs through the narrated
// film's pauses and Harper speaks sentence by sentence around the stops.
// Part 1 walks all nine stops like a visitor who listens (acts a moment
// after she finishes), logging every voice clip the page starts (audio
// clock, which file, which span), and checks: the sentences come in the
// film's order with the hands-on rules applied (instructions left to the
// prompts, two sentences replaced), nothing she says overlaps anything else
// she says, every prompt waits for her sentence, the title stops say only
// "Your turn.", the captions show her words, the last frame holds for the
// tagline, then the end card's line. Part 2: a pause mid-sentence says that
// sentence again from its start; sound off drops back to the plain tour
// (no voice), and sound on at a stop brings the narration back.
// usage: node tools/tour-narration-check.mjs <learn page url> [chromium|webkit]
import { chromium, webkit } from 'playwright';
const url = process.argv[2];
const engineName = process.argv[3] || 'chromium';
const engine = engineName === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
/* every mono (voice) buffer started: which file (by length), audio start, offset, length, when stopped */
await page.addInitScript(() => {
  window.__v = [];
  const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function (when, off, len) {
    const b = this.buffer;
    if (b && b.numberOfChannels === 1) {
      this.__rec = { file: b.duration > 60 ? 'voice' : 'prompts', at: when || this.context.currentTime, off: +off, len: +len, cut: null };
      window.__v.push(this.__rec);
    }
    return start.call(this, when, off, len);
  };
  AudioBufferSourceNode.prototype.stop = function (when) {
    if (this.__rec) this.__rec.cut = (when || this.context.currentTime);
    return stop.call(this, when);
  };
});
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const api = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, waiting: a.waiting, playing: a.playing, sound: a.sound, narrated: a.narrated, narrLog: a.narrLog, spoken: a.spoken, saying: a.saying, busy: a.narrBusyUntil, now: a.audioTime, prompt: a.prompt }; });
const V = () => page.evaluate(() => window.__v.map(r => ({ ...r })));
const waitFor = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const stageBox = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const toPage = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
const center = r => [r[0] + r[2] / 2, r[1] + r[3] / 2];
async function act(id) {
  const g = await page.evaluate((id) => { const G = window.PandionThreeRules.guide; return { shape: G.shape(id), gate: G.gates.find(x => x.id === id) }; }, id);
  const b = await stageBox();
  if (g.gate.kind === 'click') {
    const c = toPage(b, center(g.shape.beacon));
    await page.mouse.move(c[0], c[1], { steps: 3 }); await page.mouse.down(); await page.mouse.up();
  } else if (g.gate.kind === 'type') {
    await page.keyboard.type('Dose Response', { delay: 30 }); await page.keyboard.press('Enter');
  } else {
    const grab = center((g.shape.grab || g.shape.hit)[0]), d = [g.shape.to[0] - g.shape.from[0], g.shape.to[1] - g.shape.from[1]];
    const a = toPage(b, grab), e = toPage(b, [grab[0] + d[0] * 1.04, grab[1] + d[1] * 1.04]);
    await page.mouse.move(a[0], a[1], { steps: 3 }); await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(a[0] + (e[0] - a[0]) * i / 14, a[1] + (e[1] - a[1]) * i / 14); await page.waitForTimeout(16); }
    await page.waitForTimeout(100); await page.mouse.up();
  }
}

await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
const N = await page.evaluate(() => window.PandionThreeRules.narration);
const CLIPS = await page.evaluate(() => { const m = {}; return m; });
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'hub'), 'the start card');
await page.click('.ptr-hub-go');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.narrated, null, 15000), 'Try it yourself: the tour turns narrated once her narration loads');

/* ---- part 1: the whole tour, acting once she has finished ---- */
const stops = [];
let prev = 'hub', capSeen = null, endHeldOk = null;
for (;;) {
  const got = await waitFor((prev) => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; const e = document.querySelector('.ptr-end'); return (a.waiting && a.waiting !== prev) || (e && !e.hidden); }, prev, 45000);
  if (!got) { ok(false, 'stuck after ' + prev); break; }
  let s = await api();
  if (!s.waiting) break;
  const id = s.waiting;
  stops.push({ id, now: s.now, busy: s.busy });
  /* she says the prompt once her sentence is done; wait until all is quiet */
  await waitFor(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.spoken.length && a.prompt === null && a.audioTime > a.narrBusyUntil; }, null, 12000);
  if (id === 'swatch' && capSeen === null) {
    /* the captions show what she says: the recolor line plays after this stop */
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
  await act(id);
  await waitFor((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting !== id, id, 5000);
  if (id === 'swatch') {
    await waitFor(() => /Every outlined bar follows/.test(document.querySelector('[data-pandion-three-rules]').__ptr.saying), null, 6000);
    capSeen = await page.evaluate(() => ({ saying: document.querySelector('[data-pandion-three-rules]').__ptr.saying, cap: document.querySelector('.ptr-cap').textContent, shown: getComputedStyle(document.querySelector('.ptr-cap')).display !== 'none' }));
  }
  if (id === 'legR') {
    /* the last frame holds while she says the tagline; the end card comes after */
    await waitFor(() => /Clear statistical figures/.test(document.querySelector('[data-pandion-three-rules]').__ptr.saying), null, 30000);
    endHeldOk = await page.evaluate(() => document.querySelector('.ptr-end').hidden);
  }
  prev = id;
}
await waitFor(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.spoken.includes('end') && a.prompt === null; }, null, 10000);
let s = await api();
const v = await V();
ok(stops.map(x => x.id).join(' ') === 'r1it bar swatch type r2it bardrag r3btn points legR', `all nine stops (${stops.map(x => x.id).join(' ')})`);
/* the sentences, in the film's order, from the Rule 1 title on, minus the instructions the prompts replace */
const want = [];
for (let i = 0; i < N.length; i++) if (i > 0 && !N[i].skip) want.push(i);
ok(s.narrLog.join(' ') === want.join(' '), `her sentences in order with the hands-on rules (${s.narrLog.join(' ')})`);
const skipped = N.map((c, i) => c.skip ? i : -1).filter(i => i >= 0);
ok(skipped.length === 3 && skipped.every(i => /^(Click any bar|Click one, and type|Grab a bar and drag)/.test(N[i].text)), `left to the prompts: ${skipped.map(i => '"' + N[i].text + '"').join(', ')}`);
const repl = N.map((c, i) => c.clip ? c.clip : null).filter(Boolean);
ok(repl.join(' ') === 'recolor landed', `replaced: ${repl.join(', ')}`);
const promptRecs = v.filter(r => r.file === 'prompts');
const recolor = promptRecs.find(r => Math.abs(r.off - 29.46) < 0.01), landed = promptRecs.find(r => Math.abs(r.off - 33.73) < 0.01);
ok(!!recolor && !!landed, 'the recolor and data-points lines come from the prompts file');
/* nothing she says overlaps anything else she says */
const spans = v.map(r => [r.at, Math.min(r.at + r.len, r.cut != null ? r.cut : Infinity)]).sort((a, b) => a[0] - b[0]);
let overlaps = 0, minGap = Infinity;
for (let i = 1; i < spans.length; i++) { const gap = spans[i][0] - spans[i - 1][1]; if (gap < -0.01) overlaps++; minGap = Math.min(minGap, gap); }
ok(overlaps === 0 && minGap >= 0.12, `none of her clips overlap (smallest gap ${minGap.toFixed(2)} s)`);
/* every prompt waits for her sentence: it starts at least 0.3 s after the words before it end */
let promptGapOk = true;
for (const r of promptRecs) {
  if (r === recolor || r === landed) continue;
  const before = spans.filter(x => x[1] <= r.at + 0.001).map(x => x[1]);
  if (before.length && r.at - Math.max(...before) < 0.28) promptGapOk = false;
}
ok(promptGapOk, 'every prompt starts after her sentence ends (0.3 s)');
/* the title stops say only "Your turn." */
const titles = promptRecs.filter(r => [0.6, 11.045, 17.74].some(o => Math.abs(r.off - o) < 0.01));
ok(titles.length === 3 && titles.every(r => r.len < 0.85), `title stops: "Your turn." only (${titles.map(r => r.len.toFixed(2)).join(', ')} s)`);
ok(capSeen && capSeen.shown && /Every outlined bar follows/.test(capSeen.cap), `captions show her words ("${capSeen && capSeen.cap}")`);
ok(endHeldOk === true, 'the end card waits until she has said the tagline');
const endRec = promptRecs.find(r => Math.abs(r.off - 26.54) < 0.01);
const tag = v.filter(r => r.file === 'voice').pop();
ok(endRec && tag && endRec.at >= tag.at + tag.len + 0.28, 'then the end card line');

/* ---- part 2: pause mid-sentence, sound off and on ---- */
await page.click('.ptr-end-again');
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'hub', null, 20000), 'Try it again: back at the start card');
await page.click('.ptr-hub-go');
ok(await waitFor(() => /Want to change something/.test(document.querySelector('[data-pandion-three-rules]').__ptr.saying), null, 10000), 'she asks the Rule 1 question again');
await page.waitForTimeout(700);
const before = (await V()).length;
await page.click('.ptr-main');   /* pause */
s = await api();
ok(!s.playing && s.busy === 0, 'pausing stops her mid-sentence');
await page.waitForTimeout(400);
await page.click('.ptr-main');   /* play on */
ok(await waitFor((n) => window.__v.length > n, before, 3000), 'playing on starts her again');
const again = (await V()).slice(before).find(r => r.file === 'voice');
const q = N.findIndex(c => /^Want to change something/.test(c.text));
ok(again && Math.abs(again.off - (N[q].f0 - 0.04)) < 0.01, `from the start of the interrupted sentence (offset ${again ? again.off.toFixed(2) : '-'})`);
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'r1it', null, 15000), 'on to the first stop');
await waitFor(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.prompt === null && a.audioTime > a.narrBusyUntil; }, null, 8000);
await page.click('.ptr-btn[aria-label="Sound"]');   /* sound off */
s = await api();
ok(!s.sound && !s.narrated, 'sound off: the plain tour again');
const n0 = (await V()).length;
await page.click('.ptr-show');   /* the film does the step, then plays on silently */
ok(await waitFor(() => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === 'bar', null, 15000), 'on to the bar stop');
ok((await V()).length === n0, 'no voice while the sound is off');
await page.click('.ptr-btn[aria-label="Sound"]');   /* sound on, at a stop */
ok(await waitFor(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.narrated && a.prompt === 'bar'; }, null, 5000), 'sound on at a stop: narrated again, and she says the step');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors or warnings');
console.log(fails ? fails + ' FAILED' : 'all passed');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
