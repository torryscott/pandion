// The Sigma panel's alpha control commits `statsAlpha` on every module, but
// only Compare Groups and Repeated Measures named the key in their spec
// tables, so on Scatter, Distribution, Frequencies, Correlation and Likert the
// engine dropped it when it filtered the chartSpec blob through the module's
// allowlist at render entry: the new alpha drew, then reverted on the echo and
// the tally and chips recomputed at the old value. Repeated Measures had the
// same gap for `xValueSpacing` (the Order tab's value-spacing toggle, offered
// when the occasions are named by numbers). The shell passes the blob
// through and the ENGINE explodes it, so the payload handed to render() still
// shows the defaults on fixed and broken trees alike; the honest observable is
// the engine's own data after the echo has settled. This probe commits each
// key on each module and asserts that post-echo state still carries it.
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl); await page.waitForTimeout(900);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
    await page.waitForTimeout(400);
}
// One case per module: the roles the module needs, the key, and the value.
const CASES = [
    ['xyplotbuilder',     { xvar: 'x', yvar: 'y' },           'statsAlpha',    0.01],
    ['distplotbuilder',   { var: 'y', groupVar: 'g' },        'statsAlpha',    0.01],
    ['freqplotbuilder',   { var: 'g' },                       'statsAlpha',    0.01],
    ['corrplotbuilder',   { vars: ['x', 'y', 't1'] },         'statsAlpha',    0.01],
    ['likertplotbuilder', { items: ['q1', 'q2', 'q3'] },      'statsAlpha',    0.01],
    ['rmplotbuilder',     { measures: ['t1', 't2', 't3'] },   'xValueSpacing', true],
];
const res = await page.evaluate(async (CASES) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL, rows = [];
    for (let i = 0; i < 40; i++) {
        const q = 1 + (i % 5);
        rows.push([i % 2 ? 'A' : 'B', 10 + (i * 7) % 13 + (i % 3), 3 + (i * 5) % 11,
                   q, 1 + ((i + 1) % 5), 1 + ((i + 2) % 5),
                   20 + (i % 7), 24 + (i % 6), 27 + (i % 5)]);
    }
    S.loadTable('t', ['g', 'y', 'x', 'q1', 'q2', 'q3', 't1', 't2', 't3'], rows,
                { g: 'nominal', y: 'continuous', x: 'continuous', q1: 'ordinal', q2: 'ordinal', q3: 'ordinal',
                  t1: 'continuous', t2: 'continuous', t3: 'continuous' });
    const out = {};
    for (const [mod, roles, k, v] of CASES) {
        S.setModule(mod); S.setRoles(mod, roles); S.setWorkspace('chart'); await s(2400);
        const keys = (window.gb2_undo && window.gb2_undo.getData().specKeys) || [];
        let echoes = 0; const orig = window.GraphBuilder2.render;
        window.GraphBuilder2.render = function () { echoes++; return orig.apply(this, arguments); };
        window.__gb2_setOption(k, v);
        for (let i = 0; i < 80 && !echoes; i++) await s(100);   // wait for the ECHO render
        await s(500);
        window.GraphBuilder2.render = orig;
        out[mod] = { key: k, listed: keys.includes(k), echoed: echoes ? window.gb2_undo.getData()[k] : 'no-echo', want: v };
    }
    return out;
}, CASES);
for (const [mod, , k, v] of CASES) {
    const r = res[mod];
    ok(r.listed, mod + ': the allowlist names ' + k);
    ok(r.echoed === v, mod + ': ' + k + ' survives the echo (' + JSON.stringify(r.echoed) + ' vs ' + JSON.stringify(v) + ')');
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
console.log(fails ? 'STATS ALPHA ALLOWLIST CHECK: ' + fails + ' FAILED' : 'STATS ALPHA ALLOWLIST CHECK PASS');
await browser.close(); process.exit(fails ? 1 : 0);
