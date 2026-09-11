// Axis titles survive the chartSpec round trip on every module (Sep 2026).
//
// The titles are spec keys that no module's spec TABLE carries: the b.R
// reads them straight off the parsed blob. The engine filters the blob
// through data.specKeys, and that filter governs BOTH the explode into
// data.* and the client's own copy of the blob (_gb2SpecState). Only
// Compare Groups named the title keys in its list, so on the other four
// a renamed axis drew correctly from R and then vanished from the client's
// copy - and the next style commit wrote the blob back WITHOUT it, so R
// computed the default and the label reverted to the variable name with
// nothing clicked (Torry, Sep 2026, seen on scatter).
//
// What this pins, per module: the title reaches data.*, it reaches the
// client's copy of the blob, it is DRAWN, and a subsequent style commit
// re-serializes a blob that still carries it.
// Control: against the pre-fix tree xy, rm, dist and freq all fail; cg passes.
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPW() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) { try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch {} }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPW();
const OUT = process.env.GB2_AXISTITLE_OUT || '/tmp/gb2-axistitle';
const RENAMED = 'Stress score';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };

const browser = await chromium.launch();
for (const mod of ['cg', 'xy', 'rm', 'dist', 'freq']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, mod + '.html'));
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => {
        const d = (window.gb2_undo && window.gb2_undo.getData) ? window.gb2_undo.getData() : {};
        const st = window.__gb2_specStated || {};
        const svg = [...document.querySelectorAll('svg')]
            .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
        const rotated = svg ? [...svg.querySelectorAll('text')]
            .filter(t => /rotate\(-90/.test(t.getAttribute('transform') || ''))
            .map(t => (t.textContent || '').trim()) : [];
        return { yTitle: d.yTitle, yOverride: d.yTitleOverride, yLabel: d.yLabel,
                 stateHasTitle: Object.prototype.hasOwnProperty.call(st, 'yTitle'),
                 rotated };
    });
    ok(seen.yTitle === RENAMED,
       mod + ': the renamed title reaches data.* (' + JSON.stringify(seen.yTitle) + ')');
    ok(seen.yOverride === true,
       mod + ': the override flag reaches data.* (' + JSON.stringify(seen.yOverride) + ')');
    ok(seen.stateHasTitle,
       mod + ": the client's own copy of the blob keeps the title");
    ok(seen.rotated.some(t => t.indexOf(RENAMED) !== -1),
       mod + ': the renamed title is DRAWN (' + JSON.stringify(seen.rotated) + ')');
    // The decisive one: a later style commit must not write the title away.
    const after = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const sent = [];
        const prev = window.setOption;
        window.setOption = function (k, v) { sent.push([k, v]); if (prev) return prev.apply(this, arguments); };
        window.__gb2_setOption('barCornerRadius', 12);
        await s(1400);
        try { window.dispatchEvent(new Event('beforeunload')); } catch (e) {}
        await s(400);
        window.setOption = prev;
        const blob = sent.filter(p => p[0] === 'chartSpec').pop();
        if (!blob) return { committed: false };
        let o = {}; try { o = JSON.parse(blob[1]); } catch (e) {}
        return { committed: true, yTitle: o.yTitle, yOverride: o.yTitleOverride,
                 corner: o.barCornerRadius };
    });
    ok(after.committed, mod + ': a style edit commits a chartSpec blob');
    ok(after.yTitle === RENAMED && after.yOverride === true,
       mod + ': the next style commit still carries the title (' +
       JSON.stringify(after.yTitle) + ')');
    ok(errs.length === 0, mod + ': no page errors (' + errs.slice(0, 1).join('') + ')');
    await page.close();
}
console.log((fail === 0 ? 'AXIS TITLE ROUND TRIP PASS' : 'AXIS TITLE ROUND TRIP FAIL') +
    ' (' + pass + ' ok, ' + fail + ' failing)');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
