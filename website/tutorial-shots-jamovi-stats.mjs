// The learn-statistics guide's four jamovi screenshots:
//   j-st-errorbars.png  the error-bar panel on the Type strip
//   j-st-omnibus.png    the Statistics panel's Omnibus tab
//   j-st-pairs.png      the Compare pairs tab
//   j-st-brackets.png   two placed significance brackets
//
//   node website/tutorial-shots-jamovi-stats.mjs
//
//
// Self-contained: launches its OWN jamovi instance (with a debug port so
// the server's access key can be recovered), renders the jamovi CLIENT in
// headless Chromium, drives it, screenshots, and kills only the instance
// it launched. Torry's own jamovi sessions are never touched; the script
// refuses to start if any jamovi is already running, rather than guess
// which process is whose.
//
// Why headless Chromium and not the Electron window: CDP screenshots hang
// on jamovi's Electron, and macOS screen capture needs a permission this
// environment does not hold. jamovi's UI is a localhost web page (the
// same client that serves jamovi cloud), so a normal browser renders it
// pixel-perfectly, and the whole standalone-tutorial annotation approach
// carries over.
//
// The pandion module must be side-loaded (scripts/jmv-build-install.sh);
// the script asserts it before shooting. Writes j-*.png to
// assets/tutorial/, consumed by start-jamovi.html.
//
// PRIVACY: the backstage file browser shows the machine's real files and
// recent documents. It is used for NAVIGATION only and never shot.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright(mod) {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))(mod); }
        catch { /* try the next shared dependency location */ }
    }
    console.error(mod + ' not found');
    process.exit(2);
}

const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'assets/tutorial');
const CSV = path.resolve(new URL('.', import.meta.url).pathname,
    'assets/tutorial/sample-dose-response.csv');
const JAMOVI = '/Applications/jamovi.app/Contents/MacOS/jamovi';
const DEBUG_PORT = 9337;
const { chromium } = loadPlaywright('playwright');
const { ws: WebSocketImpl } = loadPlaywright('playwright-core/lib/utilsBundle');
const problems = [];

// ---------------------------------------------------------------- launch
const already = spawn('pgrep', ['-f', 'jamovi.app/Contents/MacOS/jamovi']);
const alreadyOut = await new Promise(res => {
    let s = ''; already.stdout.on('data', d => s += d);
    already.on('close', () => res(s.trim()));
});
if (alreadyOut) {
    console.error('a jamovi is already running (pid ' + alreadyOut.split('\n')[0]
        + '); close it first so this script cannot disturb a real session');
    process.exit(3);
}
if (!fs.existsSync(JAMOVI)) { console.error('jamovi.app not found'); process.exit(2); }

// The module's palette/style library is per-machine (R config dir), so a
// developer's saved palettes would appear under a SAVED heading in the
// Theme flyout and ship inside the tutorial screenshots. Sideline the
// library for the run and restore it afterwards; a student's fresh
// install has no SAVED section, so this is the truthful state.
// Every namespace the library can READ: the current one plus the
// legacy dirs its migration copies from (copy-never-move, so they are
// still populated). Sidelining only the current dir made the module
// happily re-import the pre-rename "plotstudio" palettes into the shot.
const RDIR = path.join(process.env.HOME,
    'Library/Preferences/org.R-project.R/R');
const LIBS = ['pandion', 'plotstudio', 'graphbuilder']
    .flatMap(ns => [path.join(RDIR, ns), path.join(process.env.HOME, '.' + ns)])
    .filter(d => true);
const bakOf = d => d + '.tutorial-shots-backup';
for (const d of LIBS) {                  // self-heal from a crashed run
    if (fs.existsSync(bakOf(d))) {
        if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
        fs.renameSync(bakOf(d), d);
        console.log('  restored ' + path.basename(d) + ' from an interrupted run');
    }
}
const sidelined = [];
for (const d of LIBS) {
    if (fs.existsSync(d)) { fs.renameSync(d, bakOf(d)); sidelined.push(d); }
}
if (sidelined.length) console.log('  library sidelined ('
    + sidelined.map(d => path.basename(d)).join(', ') + ')');
function restoreLib() {
    try {
        for (const d of sidelined) {
            if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
            if (fs.existsSync(bakOf(d))) fs.renameSync(bakOf(d), d);
        }
        if (sidelined.length) console.log('  library restored');
    } catch (e) { console.error('  LIBRARY RESTORE FAILED: ' + e.message); }
}
process.on('exit', restoreLib);
process.on('SIGINT', () => { restoreLib(); process.exit(130); });

const jam = spawn(JAMOVI, ['--remote-debugging-port=' + DEBUG_PORT],
    { stdio: 'ignore', detached: false });
console.log('  jamovi launched, pid ' + jam.pid);

// The server's port and per-session access key are recovered from the
// Electron window over raw CDP: the URL carries the port, the cookie
// carries the key. (connectOverCDP fails on this Electron; raw ws works.)
async function discover() {
    for (let tries = 0; tries < 40; tries++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const list = await (await fetch(
                'http://127.0.0.1:' + DEBUG_PORT + '/json/list')).json();
            const page = list.find(t => t.type === 'page'
                && /127\.0\.0\.1:\d+/.test(t.url || ''));
            if (!page) continue;
            const sock = new WebSocketImpl(page.webSocketDebuggerUrl);
            await new Promise((res, rej) => {
                sock.on('open', res); sock.on('error', rej); });
            const cookie = await new Promise((res) => {
                sock.on('message', raw => {
                    const m = JSON.parse(raw);
                    if (m.id === 1) res(m.result.result.value);
                });
                sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
                    params: { expression: 'document.cookie', returnByValue: true } }));
            });
            sock.close();
            const port = page.url.match(/127\.0\.0\.1:(\d+)/)[1];
            const key = (cookie.match(/access_key=([0-9a-f]+)/) || [])[1];
            if (port && key) return { port, key };
        } catch { /* server not up yet */ }
    }
    return null;
}
const found = await discover();
if (!found) {
    console.error('could not discover the jamovi server (port/key)');
    try { process.kill(jam.pid); } catch (e) {}
    process.exit(1);
}
console.log('  server on :' + found.port);

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', e => problems.push('pageerror: ' + e.message.slice(0, 100)));
await p.goto('http://127.0.0.1:' + found.port + '/?access_key=' + found.key,
    { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(9000);

// The module must actually be installed, or every later step lies.
const hasPandion = await (await fetch(
    'http://127.0.0.1:' + found.port + '/modules/pandion')).status === 200;
if (!hasPandion) problems.push('pandion module not installed in this jamovi');

// ------------------------------------------------------------ annotation
// Ring + cursor drawn into the MAIN document. Coordinates are given
// absolutely, so marks can point into cross-origin iframes: the caller
// composes iframe-element position + in-frame position.
async function ringAt(rect, opts) {
    await p.evaluate(({ rect, opts }) => {
        let ov = document.getElementById('tut-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'tut-overlay';
            ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
        }
        // ALWAYS (re)append last: jamovi's menu and editor layers share
        // the max z-index, and at equal z the later DOM sibling paints
        // on top. Rings drawn before a popup opened were underneath it.
        document.body.appendChild(ov);
        const pad = (opts && opts.pad) != null ? opts.pad : 6;
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;box-sizing:border-box;'
            + 'border:3px solid #375CA0;border-radius:10px;'
            + 'box-shadow:0 0 0 3px rgba(255,255,255,0.9),0 2px 14px rgba(25,46,73,0.3);'
            + `left:${rect.x - pad}px;top:${rect.y - pad}px;`
            + `width:${rect.w + 2 * pad}px;height:${rect.h + 2 * pad}px;`;
        ov.appendChild(d);
        if (opts && opts.cursor) {
            const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            s.setAttribute('style', 'position:absolute;overflow:visible;'
                + `left:${rect.x + rect.w * 0.62}px;top:${rect.y + rect.h * 0.68}px;`);
            s.innerHTML = '<path d="M0 0 L0 17 L4.8 13.4 L7.6 19.6 L10 18.5 L7.3 12.4 L12.4 12 Z"'
                + ' fill="#1c1c1c" stroke="#ffffff" stroke-width="1.4"/>';
            ov.appendChild(s);
        }
    }, { rect, opts: opts || {} });
}
const clearRings = () => p.evaluate(() =>
    document.getElementById('tut-overlay')?.remove());
async function rectOf(sel, text) {
    // jamovi keeps DUPLICATE copies of many controls in the DOM (module
    // store lists, the Variables tab's own editor), and some pass an
    // offsetParent check while sitting outside the viewport. The ring
    // must anchor to the copy actually ON SCREEN.
    return await p.evaluate(({ sel, text }) => {
        const els = [...document.querySelectorAll(sel)]
            .filter(e => e.offsetParent !== null)
            .filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top >= 0
                    && r.bottom <= window.innerHeight
                    && r.left >= 0 && r.right <= window.innerWidth;
            });
        const el = text
            ? els.find(e => (e.textContent || '').includes(text)) : els[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, { sel, text: text || null });
}
async function frameRect(frame, sel) {
    // in-frame rect + the iframe element's own position = page rect
    const inner = await frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, sel);
    if (!inner) return null;
    const fe = await frame.frameElement();
    const box = await fe.boundingBox();
    return { x: box.x + inner.x, y: box.y + inner.y, w: inner.w, h: inner.h };
}
async function shot(name, clip) {
    await p.mouse.move(2, 898);
    await p.waitForTimeout(400);
    await p.screenshot(clip ? { path: path.join(OUT, name), clip }
                            : { path: path.join(OUT, name) });
    console.log(`  ${name}  ${Math.round(fs.statSync(path.join(OUT, name)).size / 1024)} KB`);
}

// ------------------------------------------------- open the sample CSV
// Through the backstage's Browse button, answered with Playwright's file
// chooser, so no navigation through the machine's real folders is ever
// needed (and the backstage, which shows real files, is never shot).
await p.click('.jmv-ribbon-appmenu');
await p.waitForTimeout(800);
await p.evaluate(() => {
    [...document.querySelectorAll('.silky-bs-op-button')]
        .find(e => (e.textContent || '').trim() === 'Open').click();
});
await p.waitForTimeout(500);
await p.evaluate(() => {
    [...document.querySelectorAll('.silky-bs-op-place')]
        .filter(e => e.offsetParent !== null)
        .find(e => (e.textContent || '').trim() === 'This PC').click();
});
await p.waitForTimeout(900);
const chooserP = p.waitForEvent('filechooser', { timeout: 10000 })
    .catch(() => null);
await p.click('.silky-bs-fslist-browse-button');
const chooser = await chooserP;
if (!chooser) problems.push('Browse did not open a file chooser');
else await chooser.setFiles(CSV);
// Loaded when the spreadsheet shows the CSV's columns.
await p.waitForFunction(() =>
    [...document.querySelectorAll('[class*="column-header"]')]
        .some(e => (e.textContent || '').trim() === 'condition'),
    null, { timeout: 30000 });
await p.waitForTimeout(1500);

// --------------------------- shot 2: fix score's measure type
// jamovi imports the integer score column as Nominal. That typing is
// the single most common student stumble, and (separately) the module
// currently errors on a factor Y, so the tutorial teaches the fix as
// its own step: open the variable editor, set Continuous.
{
    const head = await p.$('[class*="column-header"]:has-text("score")');
    if (!head) problems.push('score column header not found');
    else {
        await head.dblclick();
        await p.waitForTimeout(1500);
        // ONE source of truth: the same locator that changes the type
        // also anchors the ring, so they can never disagree about which
        // of jamovi's duplicate editors is the live one.
        const visSel = p.locator('select:visible');
        const nSel = await visSel.count();
        let measureSel = null;
        for (let i = 0; i < nSel; i++) {
            const has = await visSel.nth(i).evaluate(e =>
                [...e.options].some(o => o.textContent.trim() === 'Continuous'));
            if (has) { measureSel = visSel.nth(i); break; }
        }
        if (!measureSel) problems.push('measure-type select not found');
        else {
            await measureSel.selectOption({ label: 'Continuous' });
            await p.waitForTimeout(1200);
        }
        await p.keyboard.press('Escape');
        await p.waitForTimeout(800);
        const editorGone = await p.evaluate(() => {
            const ed = document.querySelector('[class*="variable-editor"]');
            return !ed || ed.offsetParent === null;
        });
        if (!editorGone) {
            // the round collapse arrow at the editor's top right
            await p.evaluate(() => {
                const b = [...document.querySelectorAll('button,[role="button"],div')]
                    .find(e => e.offsetParent !== null
                        && /collapse|hide/i.test(e.className.toString()));
                if (b) b.click();
            });
            await p.waitForTimeout(800);
        }
    }
}

// --------------------------------------------- create Compare Groups
await p.click('.jmv-ribbon-tab:has-text("Plots")');
await p.waitForTimeout(600);
await p.click('[data-name="pandion plots"]');
await p.waitForTimeout(700);
// Create the analysis: a SINGLE synthetic click. A full pointer
// sequence is not needed here and risks multiple creates.
await p.evaluate(() => {
    const el = [...document.querySelectorAll(
        '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="plotbuilder"]')]
        .find(e => e.offsetParent !== null)
        || document.querySelector(
        '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="plotbuilder"]');
    el.dispatchEvent(new MouseEvent('click',
        { bubbles: true, cancelable: true, view: window }));
});
await p.waitForTimeout(4000);

// ------------------------------------------------ assign the two roles
let optionsFrame = null;
for (let i = 0; i < 20 && !optionsFrame; i++) {
    for (const f of p.frames()) {
        try {
            if (await f.evaluate(() =>
                document.querySelectorAll('.silky-variable-target').length) > 0) {
                optionsFrame = f; break;
            }
        } catch { /* frame mid-load */ }
    }
    if (!optionsFrame) await p.waitForTimeout(1000);
}
if (!optionsFrame) problems.push('analysis options frame not found');
else {
    // REAL clicks only: jamovi's ToolbarButton swallows synthetic events
    // (it guards on event.detail > 0), the same phantom-click rule the
    // chart engine itself uses. Select the item, click the transfer arrow.
    const assign = async (varName, targetIdx) => {
        const item = await optionsFrame.$(
            `.silky-list-item-value:has-text("${varName}")`);
        if (!item) { problems.push('supplier item not found: ' + varName); return; }
        await item.click();
        await p.waitForTimeout(400);
        const btns = await optionsFrame.$$('button.jmv-variable-transfer');
        if (!btns[targetIdx]) { problems.push('transfer button ' + targetIdx + ' missing'); return; }
        await btns[targetIdx].click();
        await p.waitForTimeout(1000);
    };
    await assign('condition', 0);
    await assign('score', 1);
    const roles = await optionsFrame.evaluate(() =>
        [...document.querySelectorAll('.silky-variable-target')]
            .map(t => (t.textContent || '').trim().slice(0, 30)));
    console.log('  roles now:', JSON.stringify(roles.slice(0, 2)));
    if (!roles[0] || !roles[1]) problems.push('role assignment did not take');
}

// Wait for the drawn chart in the results frame.
let resultsFrame = null;
await p.waitForFunction(() => true, null, { timeout: 100 }).catch(() => {});
for (let i = 0; i < 75 && !resultsFrame; i++) {
    for (const f of p.frames()) {
        try {
            const n = await f.evaluate(() => {
                const s = document.querySelector('svg[data-role="gb2-chart-svg"]');
                return s ? s.querySelectorAll('*').length : 0;
            });
            if (n > 40) { resultsFrame = f; break; }
        } catch { /* cross-origin churn while loading */ }
    }
    if (!resultsFrame) await p.waitForTimeout(1000);
}
if (!resultsFrame) problems.push('chart never drew in the results frame');
await p.waitForTimeout(1200);

// ---------------------------------------------------- the stats steps
// All four shots are the results iframe's region, the j-edit idiom.
const frameClip = async () => {
    const fe = await resultsFrame.frameElement();
    await fe.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const fb = await fe.boundingBox();
    return { x: Math.max(0, fb.x - 8), y: Math.max(0, fb.y - 8),
             width: Math.min(1440 - Math.max(0, fb.x - 8), fb.width + 16),
             height: 860 };
};

// --- j-st-errorbars: click an error bar, ring the Type band
if (resultsFrame) {
    const eb = await resultsFrame.evaluate(() => {
        const el = document.querySelector('[data-role="error-bar"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    });
    if (!eb) problems.push('no error bar in the jamovi chart');
    else {
        const fe = await resultsFrame.frameElement();
        const fb = await fe.boundingBox();
        await p.mouse.click(fb.x + eb.x, fb.y + eb.y);
        await resultsFrame.waitForFunction(() =>
            [...document.querySelectorAll('[data-role="stat-strip-label"]')]
                .some(e => e.offsetParent !== null), null, { timeout: 10000 })
            .catch(() => problems.push('jamovi eb panel did not open on Type'));
        // the panel settling reflows the iframe, so settle FIRST, scroll
        // FIRST, and only then measure + ring + shoot in one breath
        await p.waitForTimeout(1800);
        const feE = await resultsFrame.frameElement();
        await feE.scrollIntoViewIfNeeded();
        await p.waitForTimeout(500);
        const fbE = await feE.boundingBox();
        const band = await resultsFrame.evaluate(() => {
            const lbl = [...document.querySelectorAll('[data-role="stat-strip-label"]')]
                .find(e => e.offsetParent !== null);
            if (!lbl || !lbl.parentElement) return null;
            const r = lbl.parentElement.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        });
        if (band) {
            await ringAt({ x: fbE.x + band.x, y: fbE.y + band.y,
                           w: band.w, h: band.h }, { pad: 6 });
        }
        await shot('j-st-errorbars.png', {
            x: Math.max(0, fbE.x - 8), y: Math.max(0, fbE.y - 8),
            width: Math.min(1440 - Math.max(0, fbE.x - 8), fbE.width + 16),
            height: 860 });
        await clearRings();
        await resultsFrame.evaluate(() => {
            const ev = new KeyboardEvent('keydown',
                { key: 'Escape', bubbles: true, cancelable: true });
            document.dispatchEvent(ev); window.dispatchEvent(ev);
        });
        await p.waitForTimeout(900);
    }
}

// --- j-st-omnibus: the Statistics panel's Omnibus tab
if (resultsFrame) {
    const sig = await resultsFrame.evaluate(() => {
        const b = [...document.querySelectorAll('button[title="Statistics"]')]
            .find(e => e.offsetParent !== null);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!sig) problems.push('Statistics toolbar button not found in jamovi');
    else {
        const fe = await resultsFrame.frameElement();
        await fe.scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        const fb = await fe.boundingBox();
        await p.mouse.click(fb.x + sig.x, fb.y + sig.y);
        await resultsFrame.waitForFunction(() =>
            document.querySelectorAll('[data-st-pane]').length > 0,
            null, { timeout: 10000 })
            .catch(() => problems.push('jamovi stats panel did not open'));
        await p.waitForTimeout(900);
        const om = await resultsFrame.evaluate(() => {
            const t = [...document.querySelectorAll('[data-st-tab]')]
                .find(e => (e.textContent || '').trim() === 'Omnibus');
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (om) {
            const fb3 = await (await resultsFrame.frameElement()).boundingBox();
            await p.mouse.click(fb3.x + om.x, fb3.y + om.y);
            await p.waitForTimeout(900);
        }
        const sig2 = await resultsFrame.evaluate(() => {
            const b = [...document.querySelectorAll('button[title="Statistics"]')]
                .find(e => e.offsetParent !== null);
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        });
        if (sig2) {
            const fb4 = await (await resultsFrame.frameElement()).boundingBox();
            await ringAt({ x: fb4.x + sig2.x, y: fb4.y + sig2.y,
                           w: sig2.w, h: sig2.h }, { cursor: true, pad: 4 });
        }
        await shot('j-st-omnibus.png', await frameClip());
        await clearRings();

        // --- j-st-pairs: switch to Compare pairs, frame the panel
        const pr = await resultsFrame.evaluate(() => {
            const t = [...document.querySelectorAll('[data-st-tab]')]
                .find(e => (e.textContent || '').trim() === 'Compare pairs');
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (pr) {
            const fb5 = await (await resultsFrame.frameElement()).boundingBox();
            await p.mouse.click(fb5.x + pr.x, fb5.y + pr.y);
            await p.waitForTimeout(900);
        }
        // scroll so the whole pairs card (through the Place row) shows
        const paneRect = await resultsFrame.evaluate(() => {
            const el = [...document.querySelectorAll('[data-st-act="cmpplace"]')]
                .find(e => e.offsetParent !== null);
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            return true;
        });
        if (!paneRect) problems.push('Place brackets button not found in jamovi');
        await p.waitForTimeout(600);
        const fe6 = await resultsFrame.frameElement();
        const fb6 = await fe6.boundingBox();
        const placeBottom = await resultsFrame.evaluate(() => {
            const el = [...document.querySelectorAll('[data-st-act="cmpplace"]')]
                .find(e => e.offsetParent !== null);
            return el ? el.getBoundingClientRect().bottom : null;
        });
        const y6 = 96;
        const bottom6 = placeBottom != null
            ? Math.min(900, fb6.y + placeBottom + 40) : 876;
        const clip6 = { x: Math.max(0, fb6.x - 8), y: y6,
                        width: Math.min(1440 - Math.max(0, fb6.x - 8), fb6.width + 16),
                        height: Math.max(200, bottom6 - y6) };
        await shot('j-st-pairs.png', clip6);

        // --- j-st-brackets: tick two rows, place, close, shoot the chart
        await resultsFrame.evaluate(() => {
            const cks = [...document.querySelectorAll(
                '[data-st-pane="pairs"] input[type="checkbox"]')];
            cks.slice(0, 2).forEach(c => { if (!c.checked) c.click(); });
        });
        await p.waitForTimeout(500);
        await resultsFrame.evaluate(() => {
            const b = [...document.querySelectorAll('[data-st-act="cmpplace"]')]
                .find(e => e.offsetParent !== null);
            if (b) b.click();
        });
        await resultsFrame.waitForFunction(() => {
            const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
            return svg && svg.querySelectorAll('[data-ann-id]').length >= 2;
        }, null, { timeout: 15000 })
            .catch(() => problems.push('jamovi Place brackets drew nothing'));
        await p.waitForTimeout(1200);
        await resultsFrame.evaluate(() => {
            const x = [...document.querySelectorAll('[data-role="st-close-btn"]')]
                .find(e => e.offsetParent !== null);
            if (x) x.click();
        });
        await p.waitForTimeout(1500);
        const svgRect = await resultsFrame.evaluate(() => {
            const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
            if (!svg) return null;
            svg.scrollIntoView({ block: 'start' });
            return true;
        });
        await p.waitForTimeout(600);
        if (svgRect) {
            const fe7 = await resultsFrame.frameElement();
            const fb7 = await fe7.boundingBox();
            const r7 = await resultsFrame.evaluate(() => {
                const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
                const r = svg.getBoundingClientRect();
                return { x: r.left, y: r.top, w: r.width, h: r.height };
            });
            await shot('j-st-brackets.png', {
                x: Math.max(0, fb7.x + r7.x - 10),
                y: Math.max(0, fb7.y + r7.y + 2),
                width: Math.min(1440, r7.w + 20),
                height: Math.min(900 - Math.max(0, fb7.y + r7.y + 2), r7.h + 14) });
        } else problems.push('jamovi chart svg vanished before the bracket shot');
    }
}

await browser.close();
try { process.kill(jam.pid); } catch (e) {}
console.log('  jamovi instance stopped');
if (problems.length) {
    console.error('\nPROBLEMS (a step may not match its picture):');
    console.error([...new Set(problems)].join('\n'));
    process.exit(1);
}
console.log('\nall jamovi statistics tutorial shots drew');
