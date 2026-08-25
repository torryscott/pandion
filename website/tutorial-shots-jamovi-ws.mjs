// The workshop's four jamovi screenshots, on the Student wellbeing
// survey dataset:
//   j-ws-type.png     the exam_score measure-type fix
//   j-ws-hmc.png      Help Me Choose reading the two variables (task 2)
//   j-ws-roles.png    the filled Compare Groups panel + drawn chart
//   j-ws-omnibus.png  the Statistics panel's Omnibus tab
//
//   node website/tutorial-shots-jamovi-ws.mjs
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
    'assets/tutorial/sample-student-wellbeing.csv');
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
        .some(e => (e.textContent || '').trim() === 'student_id'),
    null, { timeout: 30000 });
await p.waitForTimeout(1500);

// --------------------------- shot 2: fix score's measure type
// jamovi imports the integer score column as Nominal. That typing is
// the single most common student stumble, and (separately) the module
// currently errors on a factor Y, so the tutorial teaches the fix as
// its own step: open the variable editor, set Continuous.
{
    // 19 columns: the spreadsheet virtualizes, so exam_score's header
    // does not exist in the DOM until the grid scrolls it into view
    for (let i = 0; i < 30; i++) {
        const found = await p.$('[class*="column-header"]:has-text("exam_score")');
        if (found) break;
        await p.evaluate(() => {
            [...document.querySelectorAll('*')]
                .filter(e => e.clientWidth > 400
                    && e.scrollWidth > e.clientWidth + 100)
                .forEach(e => { e.scrollLeft += 260; });
        });
        await p.waitForTimeout(250);
    }
    const head = await p.$('[class*="column-header"]:has-text("exam_score")');
    if (!head) problems.push('exam_score column header not found');
    else {
        await head.dblclick();
        await p.waitForTimeout(1500);
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
            const cur = await measureSel.evaluate(e =>
                e.selectedOptions[0] ? e.selectedOptions[0].textContent.trim() : '');
            console.log('  exam_score imported as: ' + cur);
            if (cur === 'Continuous') problems.push(
                'exam_score imported Continuous: rewrite the workshop task 1 jamovi copy');
            const bb = await measureSel.boundingBox();
            await ringAt({ x: bb.x, y: bb.y, w: bb.width, h: bb.height },
                { cursor: true, pad: 5 });
            await shot('j-ws-type.png', { x: 240, y: 96, width: 960, height: 360 });
            await clearRings();
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

// ------------------------------- shot: Help Me Choose (workshop task 2)
// Created BEFORE the chart, matching the workshop order, so the shot's
// results column truthfully holds only the wizard. Two variables go
// into its box; the data route renders the recommendation cards.
{
    await p.click('.jmv-ribbon-tab:has-text("Plots")');
    await p.waitForTimeout(600);
    await p.click('[data-name="pandion plots"]');
    await p.waitForTimeout(700);
    // j-ws-menu: the open menu with Help Me Choose ringed, on THIS
    // dataset's spreadsheet (the generic j-menu shot shows other data).
    {
        const menuRect = await p.evaluate(() => {
            const items = [...document.querySelectorAll(
                '.jmv-ribbon-menu-item[data-ns="pandion"]')]
                .filter(e => e.offsetParent !== null);
            if (!items.length) return null;
            let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
            for (const e of items) {
                const r = e.getBoundingClientRect();
                x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
                x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
            }
            return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        });
        if (!menuRect) problems.push('pandion menu items not visible for j-ws-menu');
        else {
            const hmcR = await rectOf(
                '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="helpmechoose"]');
            if (hmcR) await ringAt(hmcR, { cursor: true, pad: 3 });
            await shot('j-ws-menu.png', {
                x: Math.max(0, menuRect.x - 300), y: 0,
                width: Math.min(1440 - Math.max(0, menuRect.x - 300), menuRect.w + 640),
                height: Math.min(900, menuRect.y + menuRect.h + 60) });
            await clearRings();
        }
    }
    await p.evaluate(() => {
        const el = [...document.querySelectorAll(
            '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="helpmechoose"]')]
            .find(e => e.offsetParent !== null)
            || document.querySelector(
            '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="helpmechoose"]');
        if (el) el.dispatchEvent(new MouseEvent('click',
            { bubbles: true, cancelable: true, view: window }));
        else window.__noHmcItem = true;
    });
    if (await p.evaluate(() => window.__noHmcItem))
        problems.push('Help Me Choose menu item not found');
    await p.waitForTimeout(4000);
    let hmcOptions = null;
    for (let i = 0; i < 20 && !hmcOptions; i++) {
        for (const f of p.frames()) {
            try {
                if (await f.evaluate(() =>
                    document.querySelectorAll('.silky-variable-target').length) > 0) {
                    hmcOptions = f; break;
                }
            } catch { /* frame mid-load */ }
        }
        if (!hmcOptions) await p.waitForTimeout(1000);
    }
    if (!hmcOptions) problems.push('wizard options frame not found');
    else {
        const put = async (varName) => {
            const item = await hmcOptions.$(
                `.silky-list-item-value:has-text("${varName}")`);
            if (!item) { problems.push('wizard supplier item not found: ' + varName); return; }
            await item.click();
            await p.waitForTimeout(400);
            const btns = await hmcOptions.$$('button.jmv-variable-transfer');
            if (!btns[0]) { problems.push('wizard transfer button missing'); return; }
            await btns[0].click();
            await p.waitForTimeout(1000);
        };
        await put('study_method');
        await put('exam_score');
    }
    let hmcResults = null;
    for (let i = 0; i < 60 && !hmcResults; i++) {
        for (const f of p.frames()) {
            try {
                const ok = await f.evaluate(() => {
                    const r = document.querySelector('#hmcRoot');
                    return !!r && /Compare Groups/i.test(r.textContent || '')
                        && /Why this fits/i.test(r.textContent || '');
                });
                if (ok) { hmcResults = f; break; }
            } catch { /* cross-origin churn */ }
        }
        if (!hmcResults) await p.waitForTimeout(1000);
    }
    if (!hmcResults) problems.push('wizard recommendation never rendered');
    else {
        const fe = await hmcResults.frameElement();
        await fe.scrollIntoViewIfNeeded();
        await p.waitForTimeout(1200);
        await shot('j-ws-hmc.png');
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
// Two analyses now exist, each with its own options iframe; the wizard's
// has ONE variable target, plotbuilder's has several -- select on count.
let optionsFrame = null;
for (let i = 0; i < 20 && !optionsFrame; i++) {
    for (const f of p.frames()) {
        try {
            if (await f.evaluate(() =>
                document.querySelectorAll('.silky-variable-target').length) >= 2) {
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
    await assign('study_method', 0);
    await assign('exam_score', 1);
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


// --------------------------------- shot: the classic working view
// The wizard's results sit ABOVE the chart in the results column now,
// so scroll the chart's own frame to the top before shooting.
if (resultsFrame) {
    const feR = await resultsFrame.frameElement();
    await feR.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(1000);
}
await shot('j-ws-roles.png');

// ------------------------- shot: the Statistics panel's Omnibus tab
const frameClip = async () => {
    const fe = await resultsFrame.frameElement();
    await fe.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const fb = await fe.boundingBox();
    return { x: Math.max(0, fb.x - 8), y: Math.max(0, fb.y - 8),
             width: Math.min(1440 - Math.max(0, fb.x - 8), fb.width + 16),
             height: 860 };
};
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
        // settle + scroll FIRST, then measure, ring and shoot in one
        // breath: the panel opening reflows the iframe, and a ring
        // placed before the final scroll drifts off its button
        await p.waitForTimeout(1200);
        const feO = await resultsFrame.frameElement();
        await feO.scrollIntoViewIfNeeded();
        await p.waitForTimeout(500);
        const fbO = await feO.boundingBox();
        const sig2 = await resultsFrame.evaluate(() => {
            const b = [...document.querySelectorAll('button[title="Statistics"]')]
                .find(e => e.offsetParent !== null);
            if (!b) return null;
            const r = b.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        });
        if (sig2) {
            await ringAt({ x: fbO.x + sig2.x, y: fbO.y + sig2.y,
                           w: sig2.w, h: sig2.h }, { cursor: true, pad: 4 });
        }
        await shot('j-ws-omnibus.png', {
            x: Math.max(0, fbO.x - 8), y: Math.max(0, fbO.y - 8),
            width: Math.min(1440 - Math.max(0, fbO.x - 8), fbO.width + 16),
            height: 860 });
        await clearRings();
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
console.log('\nall jamovi workshop shots drew');
