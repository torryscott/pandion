// Hidden-points badge round-trip probe - browser side (Sep 2026).
// Companion to hpbadge-render.R. Asks the question that matters: does the
// client's own copy of the chartSpec blob keep the dragged badge position,
// or does the per-module allowlist drop it so the NEXT style commit writes
// the blob back without it (the axis-title gap, same shape).
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPW() {
    for (const b of [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPW();
const OUT = process.env.GB2_HPBADGE_OUT || '/tmp/gb2-hpbadge';
const LEFT = 137, TOP = 84;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };

const browser = await chromium.launch();
for (const mod of ['cg', 'rm', 'dist']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, mod + '.html'));
    await page.waitForTimeout(1500);
    const seen = await page.evaluate(() => {
        const d = (window.gb2_undo && window.gb2_undo.getData) ? window.gb2_undo.getData() : {};
        const st = window.__gb2_specStated || {};
        const has = k => Object.prototype.hasOwnProperty.call(st, k);
        return { left: d.hpBadgeLeft, top: d.hpBadgeTop,
                 stateHasLeft: has('hpBadgeLeft'), stateHasTop: has('hpBadgeTop') };
    });
    ok(seen.left === LEFT && seen.top === TOP,
       mod + ': the dragged position reaches data.* (' +
       JSON.stringify([seen.left, seen.top]) + ')');
    ok(seen.stateHasLeft && seen.stateHasTop,
       mod + ": the client's own copy of the blob keeps the position");
    // The decisive one: a later style commit must not write the position away.
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
        return { committed: true, left: o.hpBadgeLeft, top: o.hpBadgeTop,
                 corner: o.barCornerRadius };
    });
    ok(after.committed, mod + ': a style edit commits a chartSpec blob');
    ok(after.left === LEFT && after.top === TOP,
       mod + ': the next style commit still carries the position (' +
       JSON.stringify([after.left, after.top]) + ')');
    ok(errs.length === 0, mod + ': no page errors (' + errs.slice(0, 1).join('') + ')');
    await page.close();
}
console.log((fail === 0 ? 'HP BADGE ROUND TRIP PASS' : 'HP BADGE ROUND TRIP FAIL') +
    ' (' + pass + ' ok, ' + fail + ' failing)');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
