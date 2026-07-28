// Punch list item 9: nothing in the app ever says it is busy.
//
// One @keyframes in a 3071-line stylesheet, used once. No spinner, skeleton,
// progress element, aria-busy or cursor:progress anywhere. Torry's constraint
// shapes the fix more than the bug does: NEVER flash on work that is already
// instant. Measured, a render is 6-10 ms and a 20k x 20 import is 132 ms, so
// nothing ordinary comes near a 400 ms threshold - which leaves exactly two
// cases, and this probe holds the line on both directions:
//   * the affordance APPEARS for cold boot and a large import, and
//   * it stays away for everything a student does normally.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const errors = [];
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

// ---- 1. cold boot says so, from FIRST PAINT ----
// This is the one busy state that cannot be delay-gated: the delay is the
// whole point of it. So it must be in the markup, before any script runs.
{
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    // Hold the shell script so the pre-script state is observable at all.
    let release;
    const held = new Promise(r => { release = r; });
    await page.route('**/ps-shell.js', async route => {
        await held;
        await route.continue();
    });
    await page.goto(pageUrl, { waitUntil: 'commit' });
    await page.waitForSelector('#ps-boot', { timeout: 8000 });
    const booting = await page.evaluate(() => {
        const b = document.getElementById('ps-boot');
        const cs = getComputedStyle(b);
        return { shown: cs.display !== 'none' && cs.opacity !== '0',
                 says: b.innerText.trim(),
                 live: b.getAttribute('role') };
    });
    ok(booting.shown, 'a boot indicator is on screen before the shell script runs');
    ok(/Pandion|Starting/i.test(booting.says),
       `and it says what is happening ("${booting.says.replace(/\n/g, ' ')}")`);
    ok(booting.live === 'status', 'the boot indicator is announced to assistive tech');
    release();
    await page.waitForFunction(() => !document.getElementById('ps-boot'),
                               null, { timeout: 25000 });
    ok(true, 'and it is removed once the app is actually wired, not merely painted');
    await ctx.close();
}

// ---- 2. everyday work shows NOTHING ----
// The requirement that shaped this item: no flash on edits that are instant.
{
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pageUrl);
    await page.waitForTimeout(500);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(400);
    }
    // Watch continuously rather than sampling: a flash is exactly the thing a
    // single check after the fact would miss.
    await page.evaluate(() => {
        window.__psBusyFlashes = 0;
        const b = document.getElementById('ps-busy');
        new MutationObserver(() => {
            if (b.classList.contains('ps-busy-on')) window.__psBusyFlashes++;
        }).observe(b, { attributes: true, attributeFilter: ['class'] });
    });
    await page.evaluate(() => {
        window.PS_SHELL.setModule('plotbuilder');
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
    await page.waitForTimeout(1200);
    const flashes = await page.evaluate(() => window.__psBusyFlashes);
    ok(flashes === 0,
       `ordinary work never flashes a busy state (${flashes} appearances)`);

    // A small import is ordinary too: under the size trigger, nothing shows.
    const smallFlashes = await page.evaluate(async () => {
        const rows = ['group,score'];
        for (let i = 0; i < 300; i++) rows.push(`g${i % 3},${i}`);
        const file = new File([rows.join('\n')], 'small.csv', { type: 'text/csv' });
        const dt = new DataTransfer();
        dt.items.add(file);
        document.dispatchEvent(new DragEvent('drop',
            { dataTransfer: dt, bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 1200));
        return window.__psBusyFlashes;
    });
    ok(smallFlashes === 0,
       `a small import stays silent too (${smallFlashes} appearances)`);

    // ---- 3. a large import DOES say so, and paints before it blocks ----
    const bigResult = await page.evaluate(async () => {
        const rows = ['group,score,hours,site,batch,note'];
        // Comfortably over the 2 MB trigger: ~45 bytes x 120k rows.
        for (let i = 0; i < 120000; i++)
            rows.push(`group_${i % 4},${i % 97}.${i % 10},${i % 13}.5,` +
                      `site_${i % 6},batch_${i % 20},obs-${i}`);
        const text = rows.join('\n');
        const file = new File([text], 'big.csv', { type: 'text/csv' });
        const dt = new DataTransfer();
        dt.items.add(file);
        let sawBusy = false;
        const b = document.getElementById('ps-busy');
        const obs = new MutationObserver(() => {
            if (b.classList.contains('ps-busy-on')) sawBusy = true;
        });
        obs.observe(b, { attributes: true, attributeFilter: ['class'] });
        document.dispatchEvent(new DragEvent('drop',
            { dataTransfer: dt, bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 6000));
        obs.disconnect();
        return { sawBusy, bytes: file.size,
                 cleared: !b.classList.contains('ps-busy-on') };
    });
    ok(bigResult.bytes > 2 * 1024 * 1024,
       `setup: the fixture is over the size trigger ` +
       `(${(bigResult.bytes / 1048576).toFixed(1)} MB)`);
    ok(bigResult.sawBusy,
       `a large import (${(bigResult.bytes / 1048576).toFixed(1)} MB) says it ` +
       `is working before it blocks the main thread`);
    ok(bigResult.cleared, 'and the busy state is cleared when the work is done');
    await ctx.close();
}

// ---- 4. the DELAY GATE itself, in both directions ----
// The snapshot pass is the one async consumer of the gate. On this machine a
// panel renders in ~10 ms, so a real layout finishes far inside the threshold
// and the gate correctly shows nothing - which means a probe built only on
// real timings can never exercise the "appears" branch, and would pass with
// the gate removed entirely (it did: an earlier version of this file had
// exactly that hole). The render is slowed deliberately here so both
// branches are genuinely tested.
{
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pageUrl);
    await page.waitForTimeout(500);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(400);
    }
    const layoutIds = await page.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.setModule('plotbuilder');
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
        await sleep(700);
        const mk = async () => {
            window.PS_SHELL.addChart('plotbuilder');
            window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
            await sleep(600);
            return window.PS_SHELL.chart().id;
        };
        const a = window.PS_SHELL.chart().id, b = await mk(), c = await mk();
        window.PS_SHELL.addLayout();
        await sleep(400);
        const lay = window.PS_SHELL.chart();
        lay.items = [a, b, c].map((id, i) => ({
            id: 'i' + i, kind: 'chart', chartId: id,
            x: 10, y: 10 + i * 150, w: 280, h: 140 }));
        window.PS_SHELL.switchChart(a);
        await sleep(700);
        return { a, lay: lay.id };
    });

    async function passShowsBusy(slowMs) {
        return page.evaluate(async ({ ids, slowMs }) => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const real = window.GraphBuilder2.render;
            if (slowMs) {
                window.GraphBuilder2.render = function () {
                    const until = Date.now() + slowMs;
                    while (Date.now() < until) { /* block, as a heavy chart does */ }
                    return real.apply(this, arguments);
                };
            }
            let saw = false;
            const b = document.getElementById('ps-busy');
            const obs = new MutationObserver(() => {
                if (b.classList.contains('ps-busy-on')) saw = true;
            });
            obs.observe(b, { attributes: true, attributeFilter: ['class'] });
            window.PS_SHELL.switchChart(ids.a);
            await sleep(600);
            window.PS_SHELL.dropSnapshots();
            window.PS_SHELL.switchChart(ids.lay);
            await sleep(4000);
            obs.disconnect();
            window.GraphBuilder2.render = real;
            return { saw, cleared: !b.classList.contains('ps-busy-on') };
        }, { ids: layoutIds, slowMs });
    }

    const fast = await passShowsBusy(0);
    ok(!fast.saw,
       'a snapshot pass that finishes inside the threshold shows nothing');
    // 500 ms per panel, not 220: with two panels to draw, 220 lands the
    // pass right on the 400 ms threshold and the result is a coin toss.
    const slow = await passShowsBusy(500);
    ok(slow.saw,
       'a snapshot pass that genuinely takes time does say it is working');
    ok(slow.cleared, 'and it clears when the pass ends');
    await ctx.close();
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('BUSY CHECK PASS');
await browser.close();
