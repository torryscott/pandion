// The learn-repeated-measures guide's two jamovi screenshots:
//   j-rm-data.png   the practice dataset in jamovi's spreadsheet
//   j-rm-roles.png  the Repeated Measures options panel filled + chart
//
//   node website/tutorial-shots-jamovi-rm.mjs
//
// Same self-contained machinery as tutorial-shots-jamovi.mjs (own jamovi
// instance with a debug port, headless Chromium against the localhost
// client, refuses to run beside a real jamovi session, palette/style
// libraries sidelined for the run). The RM panel's factor/cell/between
// state is set through the results iframe's jamovi-injected setOption,
// the same channel the chart's own editor uses, so the panel shows the
// real bound state.
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
    'assets/tutorial/sample-practice-sessions.csv');
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

const RDIR = path.join(process.env.HOME,
    'Library/Preferences/org.R-project.R/R');
const LIBS = ['pandion', 'plotstudio', 'graphbuilder']
    .flatMap(ns => [path.join(RDIR, ns), path.join(process.env.HOME, '.' + ns)]);
const bakOf = d => d + '.tutorial-shots-backup';
for (const d of LIBS) {
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

const hasPandion = await (await fetch(
    'http://127.0.0.1:' + found.port + '/modules/pandion')).status === 200;
if (!hasPandion) problems.push('pandion module not installed in this jamovi');

// ------------------------------------------------------------ annotation
async function ringAt(rect, opts) {
    await p.evaluate(({ rect, opts }) => {
        let ov = document.getElementById('tut-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'tut-overlay';
            ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
        }
        document.body.appendChild(ov);
        const pad = (opts && opts.pad) != null ? opts.pad : 6;
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;box-sizing:border-box;'
            + 'border:3px solid #375CA0;border-radius:10px;'
            + 'box-shadow:0 0 0 3px rgba(255,255,255,0.9),0 2px 14px rgba(25,46,73,0.3);'
            + `left:${rect.x - pad}px;top:${rect.y - pad}px;`
            + `width:${rect.w + 2 * pad}px;height:${rect.h + 2 * pad}px;`;
        ov.appendChild(d);
    }, { rect, opts: opts || {} });
}
const clearRings = () => p.evaluate(() =>
    document.getElementById('tut-overlay')?.remove());
async function shot(name, clip) {
    await p.mouse.move(2, 898);
    await p.waitForTimeout(400);
    await p.screenshot(clip ? { path: path.join(OUT, name), clip }
                            : { path: path.join(OUT, name) });
    console.log(`  ${name}  ${Math.round(fs.statSync(path.join(OUT, name)).size / 1024)} KB`);
}

// ------------------------------------------------- open the practice CSV
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
await p.waitForFunction(() =>
    [...document.querySelectorAll('[class*="column-header"]')]
        .some(e => (e.textContent || '').trim() === 'person'),
    null, { timeout: 30000 });
await p.waitForTimeout(1500);

// ------------------------- fix the session columns' measure types
// jamovi imports integer columns as Nominal; the chart needs them
// Continuous. Same flow the getting-started guide teaches, four times.
for (const col of ['session1', 'session2', 'session3', 'session4']) {
    const head = await p.$(`[class*="column-header"]:has-text("${col}")`);
    if (!head) { problems.push(col + ' column header not found'); continue; }
    await head.dblclick();
    await p.waitForTimeout(1300);
    const visSel = p.locator('select:visible');
    const nSel = await visSel.count();
    let measureSel = null;
    for (let i = 0; i < nSel; i++) {
        const has = await visSel.nth(i).evaluate(e =>
            [...e.options].some(o => o.textContent.trim() === 'Continuous'));
        if (has) { measureSel = visSel.nth(i); break; }
    }
    if (!measureSel) { problems.push('measure-type select not found for ' + col); }
    else {
        const cur = await measureSel.evaluate(e =>
            e.selectedOptions[0] ? e.selectedOptions[0].textContent.trim() : '');
        if (cur !== 'Continuous') {
            await measureSel.selectOption({ label: 'Continuous' });
            await p.waitForTimeout(1000);
        }
    }
    await p.keyboard.press('Escape');
    await p.waitForTimeout(700);
}
// make sure the variable editor is really closed before shooting
await p.keyboard.press('Escape');
await p.waitForTimeout(800);

// --------------------------------------------- shot: the data grid
await p.click('.jmv-ribbon-tab:has-text("Data")');
await p.waitForTimeout(700);
await shot('j-rm-data.png', { x: 0, y: 0, width: 1150, height: 620 });

// --------------------------------- create the Repeated Measures analysis
await p.click('.jmv-ribbon-tab:has-text("Plots")');
await p.waitForTimeout(600);
await p.click('[data-name="pandion plots"]');
await p.waitForTimeout(700);
await p.evaluate(() => {
    const el = [...document.querySelectorAll(
        '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="rmplotbuilder"]')]
        .find(e => e.offsetParent !== null)
        || document.querySelector(
        '.jmv-ribbon-menu-item[data-ns="pandion"][data-name="rmplotbuilder"]');
    el.dispatchEvent(new MouseEvent('click',
        { bubbles: true, cancelable: true, view: window }));
});
await p.waitForTimeout(5000);

// ----------------------- fill the design through the panel UI
// The rm option (Array of Group) does not take through the results
// iframe's setOption bridge (bs, a plain variables list, does), so the
// factor and its levels are TYPED into the RMAnovaFactorsBox the way a
// user does it: its names are ordinary text inputs that commit on Enter.
let optionsFrame = null;
for (let i = 0; i < 20 && !optionsFrame; i++) {
    for (const f of p.frames()) {
        try {
            if (await f.evaluate(() =>
                [...document.querySelectorAll('div,label,span')]
                    .some(e => (e.textContent || '').trim() === 'Repeated Measures Factors')))
                { optionsFrame = f; break; }
        } catch { /* frame mid-load */ }
    }
    if (!optionsFrame) await p.waitForTimeout(1000);
}
if (!optionsFrame) problems.push('RM options panel frame not found');
else {
    const typeInto = async (matchValue, text) => {
        const inp = await optionsFrame.evaluateHandle((mv) => {
            const re = new RegExp(mv);
            return [...document.querySelectorAll('input.silky-option-listitem')]
                .find(e => e.offsetParent !== null && re.test(e.value || '')) || null;
        }, matchValue);
        const el = inp.asElement();
        if (!el) { problems.push('factor-box input not found: ' + matchValue); return false; }
        await el.click({ clickCount: 3 });
        await p.waitForTimeout(300);
        await p.keyboard.type(text, { delay: 40 });
        await p.keyboard.press('Enter');
        await p.waitForTimeout(900);
        return true;
    };
    await typeInto('^RM Factor 1$', 'Session');
    await typeInto('^Level 1$', 'Session 1');
    await typeInto('^Level 2$', 'Session 2');
    await typeInto('^Level \\d+$', 'Session 3');   // the ghost materializes
    await typeInto('^Level \\d+$', 'Session 4');
    // four cells should now exist
    await optionsFrame.waitForFunction(() =>
        [...document.querySelectorAll('div,span')]
            .filter(e => (e.textContent || '').trim() === 'drag variable here').length >= 4
        || /Session 4/.test(document.body.textContent || ''),
        null, { timeout: 10000 })
        .catch(() => problems.push('four level cells never appeared'));
    // assign the measures + the between factor with the transfer arrows
    const assign = async (varName, btnIdx) => {
        const item = await optionsFrame.$(
            `.silky-list-item-value:has-text("${varName}")`);
        if (!item) { problems.push('supplier item not found: ' + varName); return; }
        await item.click();
        await p.waitForTimeout(400);
        const btns = await optionsFrame.$$('button.jmv-variable-transfer');
        if (!btns[btnIdx]) { problems.push('transfer button ' + btnIdx + ' missing'); return; }
        await btns[btnIdx].click();
        await p.waitForTimeout(1000);
    };
    await assign('session1', 0);
    await assign('session2', 0);
    await assign('session3', 0);
    await assign('session4', 0);
    await assign('group', 1);
    await p.waitForTimeout(1500);
}

// Wait for the drawn RM chart in whichever frame carries it.
let chartFrame = null;
for (let i = 0; i < 75 && !chartFrame; i++) {
    for (const f of p.frames()) {
        try {
            const n = await f.evaluate(() => {
                const s = document.querySelector('svg[data-role="gb2-chart-svg"]');
                return s ? s.querySelectorAll('*').length : 0;
            });
            if (n > 40) { chartFrame = f; break; }
        } catch { /* cross-origin churn while loading */ }
    }
    if (!chartFrame) await p.waitForTimeout(1000);
}
if (!chartFrame) problems.push('RM chart never drew in the results frame');
await p.waitForTimeout(1500);

// ---------------------------- shot: the filled panel + drawn chart
// Ring the factor/cells region of the options panel: the box whose
// heading reads "Repeated Measures Cells" plus the factors box above it.
let ringFrame = optionsFrame;
if (!ringFrame) {
    for (const f of p.frames()) {
        try {
            if (await f.evaluate(() =>
                [...document.querySelectorAll('div,label,span')]
                    .some(e => (e.textContent || '').trim() === 'Repeated Measures Cells'))) {
                ringFrame = f; break;
            }
        } catch { /* not this frame */ }
    }
}
if (ringFrame) {
    // typing left the factors list scrolled half a row down (the factor
    // name was clipped); put every scroller in the panel back to the top
    // and drop the typing focus before shooting
    await ringFrame.evaluate(() => {
        if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
        [...document.querySelectorAll('*')]
            .filter(e => e.scrollTop > 0)
            .forEach(e => { e.scrollTop = 0; });
    });
    await p.waitForTimeout(600);
    const rect = await ringFrame.evaluate(() => {
        // union of the cells label + the cell targets that hold the
        // session columns: exactly the box the caption talks about
        const parts = [...document.querySelectorAll('div,label,span')]
            .filter(e => e.offsetParent !== null
                && (e.textContent || '').trim() === 'Repeated Measures Cells');
        [...document.querySelectorAll('.silky-variable-target')]
            .filter(e => e.offsetParent !== null
                && /session\d/.test(e.textContent || ''))
            .forEach(e => parts.push(e));
        if (!parts.length) return null;
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        for (const e of parts) {
            const r = e.getBoundingClientRect();
            x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
            x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
        }
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    });
    if (rect) {
        const fe = await ringFrame.frameElement();
        const fb = await fe.boundingBox();
        await ringAt({ x: fb.x + rect.x, y: fb.y + rect.y,
                       w: rect.w, h: rect.h }, { pad: 4 });
    } else problems.push('Repeated Measures Cells box not found for the ring');
} else problems.push('options frame with the RM cells box not found');
await shot('j-rm-roles.png');
await clearRings();

await browser.close();
try { process.kill(jam.pid); } catch (e) {}
console.log('  jamovi instance stopped');
if (problems.length) {
    console.error('\nPROBLEMS (a step may not match its picture):');
    console.error([...new Set(problems)].join('\n'));
    process.exit(1);
}
console.log('\nall jamovi RM tutorial shots drew');
