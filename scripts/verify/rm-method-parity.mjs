// The engine's client-side Repeated Measures half-width recompute against
// the R module (Oct 9 2026). For every error-bar type the R renders of
// BOTH methods are opened; on each, the engine's stat fold is pointed at
// the other method (the exact sequence the Method strip runs) and every
// bar's half-width is compared with R's own render of that method.
// Usage: GB2_RM_PARITY_OUT=<dir> node scripts/verify/rm-method-parity.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp']) {
        if (!base) continue;
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const OUT = process.env.GB2_RM_PARITY_OUT || '/tmp/gb2-rm-parity';
const TYPES = ['se', 'sd', 'ci95', 'ci95c'];
for (const ty of TYPES) for (const m of ['within', 'between']) {
    if (!fs.existsSync(path.join(OUT, 'rm_' + m + '_' + ty + '.html'))) {
        console.error('fixture missing: rm_' + m + '_' + ty + '.html (run rm-method-parity.R first)');
        process.exit(1);
    }
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const readBars = async (file, pokeMethod) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, file + '.html'));
    await page.waitForFunction(() => window.gb2_undo && typeof window.gb2_undo.getData === 'function'
        && document.querySelector('svg[data-role="gb2-chart-svg"]'), null, { timeout: 20000 });
    const out = await page.evaluate((pokeMethod) => {
        const d = window.gb2_undo.getData();
        if (pokeMethod) {
            d.errorBarMethod = pokeMethod;
            window.__gb2_statFold(d, { errorBarMethod: 1 }, String(d.errorBarType || 'se'));
        }
        return d.bars.map(b => ({ x: b.x, g: b.group, se: b.se, n: b.n }));
    }, pokeMethod);
    await ctx.close();
    if (errs.length) throw new Error(file + ': page error ' + errs[0]);
    return out;
};
let worst = 0, cases = 0, bad = 0;
for (const ty of TYPES) {
    const rW = await readBars('rm_within_' + ty, null), rB = await readBars('rm_between_' + ty, null);
    const cW = await readBars('rm_between_' + ty, 'within'), cB = await readBars('rm_within_' + ty, 'between');
    if (rW.length !== rB.length || rW.length < 6) { console.log('FAIL ' + ty + ': unexpected bar count ' + rW.length); bad++; continue; }
    for (let i = 0; i < rW.length; i++) {
        const dW = Math.abs(cW[i].se - rW[i].se), dB = Math.abs(cB[i].se - rB[i].se);
        worst = Math.max(worst, dW, dB); cases += 2;
        if (!(dW <= 1e-9) || !(dB <= 1e-9)) {
            bad++;
            console.log('  FAIL ' + ty + ' ' + rW[i].x + ' / ' + rW[i].g + ': R within ' + rW[i].se + ' client ' + cW[i].se + '; R between ' + rB[i].se + ' client ' + cB[i].se);
        }
    }
    console.log('  ok  ' + ty + ': ' + rW.length + ' cells both ways (R within ' + rW.slice(0, 3).map(b => b.se.toFixed(4)).join('/') + ', between ' + rB.slice(0, 3).map(b => b.se.toFixed(4)).join('/') + ')');
}
await browser.close();
console.log('RM METHOD PARITY ' + (bad ? 'FAIL' : 'PASS') + ' (' + cases + ' half-widths, worst |diff| ' + worst.toExponential(2) + ')');
process.exit(bad ? 1 : 0);
