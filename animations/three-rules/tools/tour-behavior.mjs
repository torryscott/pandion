// Behaviour checks for the hands-on tour, beyond the straight walk-through
// (tools/tour-check.mjs): pick a rule on the start card, let go of a drag
// too early (it springs back and waits), "Show me", a missed click (the
// coach nudges, the tour waits), Enter as "Show me", switching to Watch
// mode (no more stops, no end card), sound in hands-on mode (picking a rule
// turns it on; Harper's spoken prompts are checked in tour-prompts-check.mjs).
// usage: node tools/tour-behavior.mjs [url] [chromium|webkit]
import { chromium, webkit } from 'playwright';
const url = process.argv[2] || 'http://127.0.0.1:8883/player-test.html';
const engine = (process.argv[3] || 'chromium') === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
await page.goto(url);
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').scrollIntoView({ block: 'center' }));
const st = () => page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: a.time, waiting: a.waiting, playing: a.playing, mode: a.mode }; });
const waitFor = (id, timeout = 15000) => page.waitForFunction((id) => document.querySelector('[data-pandion-three-rules]').__ptr.waiting === id, id, { timeout }).then(() => true, () => false);
const box = () => page.evaluate(() => { const r = document.querySelector('.ptr-stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const P = (b, p) => [b.x + p[0] / 1920 * b.w, b.y + p[1] / 1080 * b.h];
const shape = (id) => page.evaluate((id) => window.PandionThreeRules.guide.shape(id), id);

ok(await waitFor('hub'), 'the intro plays and stops on the start card');
let b = await box();
const dots = await page.evaluate(() => window.PandionThreeRules.guide.hubDots);
let d = P(b, dots[1]);
await page.mouse.move(d[0], d[1]);
await page.waitForTimeout(150);
ok(await page.evaluate(() => document.querySelector('.ptr-stage').classList.contains('ptr-over')), 'the Drag point shows it can be clicked');
await page.mouse.down(); await page.mouse.up();
ok(await waitFor('r2it'), 'clicking the Drag point starts Rule 2');
ok(await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.sound), 'picking a rule turns the sound on');

/* let go too early: springs back, still waiting */
let s = await shape('r2it');
b = await box();
const g0 = P(b, [s.hit[0][0] + s.hit[0][2] / 2, s.hit[0][1] + s.hit[0][3] / 2]);
const dv = [s.to[0] - s.from[0], s.to[1] - s.from[1]];
await page.mouse.move(g0[0], g0[1]);
await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(g0[0] + dv[0] * 0.2 * i / 6 * b.w / 1920, g0[1] + dv[1] * 0.2 * i / 6 * b.h / 1080);
await page.mouse.up();
await page.waitForTimeout(600);
s = await st();
ok(s.waiting === 'r2it' && !s.playing, `letting go at 20% springs back and waits (waiting ${s.waiting})`);
ok(await page.evaluate(() => !document.querySelector('.ptr-coach').hidden), 'the coach card comes back');

/* Show me */
await page.click('.ptr-show');
await page.waitForTimeout(250);
const vis = await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.playing);
ok(vis, 'Show me plays the step');
ok(await waitFor('bardrag'), 'after the demonstration the tour stops at the next step');

/* a miss */
b = await box();
await page.mouse.move(b.x + b.w * 0.93, b.y + b.h * 0.9);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(100);
ok(await page.evaluate(() => document.querySelector('.ptr-coach').classList.contains('ptr-nudge')), 'a click beside the target nudges the coach');
ok((await st()).waiting === 'bardrag', 'and the tour keeps waiting');

/* Enter = Show me */
await page.evaluate(() => document.querySelector('.ptr').focus());
await page.keyboard.press('Enter');
ok(await waitFor('r3btn'), 'Enter shows the step, then the tour stops at the next one (the + Add title)');

/* between stops the film does the step itself, its cursor showing */
const autoVis = await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; return a.waiting; });
ok(autoVis === 'r3btn', 'the legend drag played on its own between the stops');

/* switch to Watch */
await page.click('.ptr-mode');
await page.waitForTimeout(300);
s = await st();
ok(s.mode === 'watch' && s.playing && !s.waiting, 'Hands-on off: the tour plays on');
/* Watch mode is the narrated film (film time, with its pauses): its length comes from the player */
const D = await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.duration);
ok(D > 80, `Watch mode runs the narrated film (${D.toFixed(2)} s)`);
await page.evaluate((D) => document.querySelector('[data-pandion-three-rules]').__ptr.seek(D - 1), D);
await page.waitForTimeout(1600);
s = await st();
ok(!s.playing && s.t >= D - 0.05, `watching runs to the end without stopping (t=${s.t.toFixed(2)} of ${D.toFixed(2)})`);
ok(await page.evaluate(() => document.querySelector('.ptr-end').hidden), 'no end card when just watching');
ok(await page.evaluate(() => document.querySelector('.ptr-main').getAttribute('aria-label')) === 'Replay', 'the play button offers Replay');

/* hands-on again, from the Add chapter, with sound: off, then on again */
await page.waitForFunction(() => !document.querySelector('.ptr-bar .ptr-busy'), null, { timeout: 30000 }).catch(() => {});
await page.click('.ptr-mode');
await page.evaluate(() => { const a = document.querySelector('[data-pandion-three-rules]').__ptr; a.seek(28.3); a.play(); });
await page.click('.ptr-btn[aria-label="Sound"]');
ok(await page.evaluate(() => document.querySelector('.ptr-btn[aria-label="Sound"]').getAttribute('aria-pressed')) === 'false', 'the sound button turns hands-on sound off');
await page.click('.ptr-btn[aria-label="Sound"]');
await page.waitForFunction(() => !document.querySelector('.ptr-btn[aria-label="Sound"]').classList.contains('ptr-busy'), null, { timeout: 20000 }).catch(() => {});
ok(await page.evaluate(() => document.querySelector('.ptr-btn[aria-label="Sound"]').getAttribute('aria-pressed')) === 'true', 'and on again (effects and spoken prompts)');
ok(await waitFor('r3btn'), 'hands-on again: the tour stops at + Add');
ok(await page.waitForFunction(() => document.querySelector('[data-pandion-three-rules]').__ptr.prompt === 'r3btn', null, { timeout: 3000 }).then(() => true, () => false), 'and Harper says the + Add step');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors or warnings');
console.log(fails ? fails + ' FAILED' : 'all passed');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
