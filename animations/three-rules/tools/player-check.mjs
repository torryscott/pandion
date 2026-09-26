// Behavioural check of the player: autoplay, sound render in worker, seek, end state.
import { chromium, webkit } from 'playwright';
const url = process.argv[2];
const engine = process.argv[3] === 'webkit' ? webkit : chromium;
const browser = await engine.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(1500);
const s1 = await page.evaluate(() => { const p = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: p.time, playing: p.playing }; });
await page.click('.ptr-btn[aria-pressed]');
const t0 = Date.now();
await page.waitForFunction(() => !document.querySelector('.ptr-btn[aria-pressed]').classList.contains('ptr-busy'), null, { timeout: 15000 });
const renderMs = Date.now() - t0;
await page.waitForTimeout(800);
const s2 = await page.evaluate(() => { const p = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: p.time, playing: p.playing, pressed: document.querySelector('.ptr-btn[aria-pressed]').getAttribute('aria-pressed') }; });
// jump to Add chapter
await page.click('.ptr-chap:nth-child(4)');
await page.waitForTimeout(400);
const s3 = await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.time);
// seek near the end and let it finish
await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.seek(47.8));
await page.waitForTimeout(1500);
const s4 = await page.evaluate(() => { const p = document.querySelector('[data-pandion-three-rules]').__ptr; return { t: p.time, playing: p.playing, btn: document.querySelector('.ptr-main').getAttribute('aria-label'), cover: document.querySelector('.ptr-cover').hidden }; });
// keyboard: focus region, space toggles
await page.focus('.ptr');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const s5 = await page.evaluate(() => document.querySelector('[data-pandion-three-rules]').__ptr.playing);
console.log(JSON.stringify({ autoplay: s1, soundRenderMs: renderMs, afterSound: s2, afterChapter: s3.toFixed(2), atEnd: s4, spaceRestarts: s5 }));
console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
await browser.close();
