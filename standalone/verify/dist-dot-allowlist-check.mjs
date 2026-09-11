// The Distribution dot chart rides the line machinery, so its panel commits
// the line family's style keys. The client filters the chartSpec blob through
// the module's allowlist both when seeding its own copy and when exploding it,
// so a key the module does not name is dropped on the echo: the edit draws,
// then snaps back (Torry, Sep 11 2026: the group gap reverted in a second).
// The shell passes the blob through and the ENGINE explodes it at render
// entry, so the payload handed to render() still shows the defaults; the
// honest observable is the engine's own data after the echo has settled,
// plus the drawn marker gap for the spread. This probe commits each key and
// asserts that post-echo state still carries it.
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
const CASES = [['lineMarkerSpread', 1], ['linePointSize', 14], ['linePointShape', 'square'],
               ['lineWidth', 0], ['errorBarCapSizeLine', 22], ['barOutlierWidth', 3]];
const res = await page.evaluate(async (CASES) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL, rows = [];
    for (let i = 0; i < 40; i++) rows.push([i % 2 ? 'A' : 'B', 10 + (i * 7) % 13 + (i % 3)]);
    S.loadTable('t', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
    S.setModule('distplotbuilder'); S.setRoles('distplotbuilder', { var: 'y', groupVar: 'g' });
    S.setWorkspace('chart'); await s(2400);
    window.__gb2_setOption('graphType', 'dot'); await s(2500);
    const gap = () => {
        const xs = [...document.querySelectorAll('#psroot svg [data-role="line-marker"]')]
            .map(m => m.getBoundingClientRect().x);
        return xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : null;
    };
    const out = { keys: window.gb2_undo.getData().specKeys || [], gapBefore: gap() };
    for (const [k, v] of CASES) {
        let echoes = 0; const orig = window.GraphBuilder2.render;
        window.GraphBuilder2.render = function () { echoes++; return orig.apply(this, arguments); };
        window.__gb2_setOption(k, v);
        for (let i = 0; i < 80 && !echoes; i++) await s(100);   // wait for the ECHO render
        await s(500);
        window.GraphBuilder2.render = orig;
        out[k] = { echoed: echoes ? window.gb2_undo.getData()[k] : 'no-echo', want: v };
        if (k === 'lineMarkerSpread') out.gapAfterEcho = gap();
    }
    return out;
}, CASES);
ok(Array.isArray(res.keys) && res.keys.includes('lineMarkerSpread') && res.keys.includes('barOutlierWidth'),
   'the Distribution allowlist names the line-family and outlier keys');
for (const [k, v] of CASES)
    ok(res[k].echoed === v, k + ': the value survives the echo (' + JSON.stringify(res[k].echoed) + ' vs ' + JSON.stringify(v) + ')');
ok(res.gapAfterEcho !== null && res.gapBefore !== null && res.gapAfterEcho > res.gapBefore + 40,
   'the drawn group gap stays widened after the echo (' + res.gapBefore + 'px -> ' + res.gapAfterEcho + 'px)');
ok(errors.length === 0, 'no page errors');
console.log(fails ? 'DIST DOT ALLOWLIST CHECK: ' + fails + ' FAILED' : 'DIST DOT ALLOWLIST CHECK PASS');
await browser.close(); process.exit(fails ? 1 : 0);
