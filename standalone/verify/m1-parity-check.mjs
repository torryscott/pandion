// M1 parity probe (JS side): load the SAME fixture table m1-parity.R used
// into the standalone shell, build each case's payload through the JS data
// layer, and compare every channel against the R-extracted expectation at
// 10-significant-digit precision. Ellipses compare via phase-invariant
// moments because eigenvector sign is arbitrary on both sides.
//
// Run AFTER:  Rscript standalone/verify/m1-parity.R
// Usage:      node standalone/verify/m1-parity-check.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html');

let EXP;
try { EXP = JSON.parse(readFileSync('/tmp/ps-standalone-parity/expected.json', 'utf8')); }
catch (e) {
    console.error('expected.json missing - run: Rscript standalone/verify/m1-parity.R');
    process.exit(2);
}

let failures = 0, checks = 0;
function fail(msg) { console.log('  FAIL ' + msg); failures++; }
function numOK(a, b) {
    return Math.abs(a - b) <= Math.max(1e-9, 3e-9 * Math.max(Math.abs(a), Math.abs(b)));
}
function isNil(v) { return v === null || v === undefined; }
function cmp(exp, got, where) {
    checks++;
    // Standalone-only stable observation identity accompanies raw value
    // arrays so chart exclusions can update Data. It is metadata, not an
    // R-computed statistical channel, and is intentionally absent in jamovi.
    if ((where.endsWith('.caseIds') || where.endsWith('.sourceColumns')) &&
        isNil(exp) && Array.isArray(got)) return;
    if (isNil(exp) && isNil(got)) return;
    if (isNil(exp) !== isNil(got)) {
        // A key the R payload omits entirely vs the JS shipping an empty
        // container is NOT a mismatch (jsonlite drops empty-name NULLs).
        if ((isNil(exp) && (got === '' || (Array.isArray(got) && !got.length))) ||
            (isNil(got) && (exp === '' || (Array.isArray(exp) && !exp.length)))) return;
        return fail(where + ': ' + JSON.stringify(exp) + ' vs ' + JSON.stringify(got));
    }
    if (typeof exp === 'number' && typeof got === 'number') {
        if (!numOK(exp, got)) fail(where + ': ' + exp + ' vs ' + got);
        return;
    }
    if (Array.isArray(exp) || Array.isArray(got)) {
        if (!Array.isArray(exp) || !Array.isArray(got) || exp.length !== got.length)
            return fail(where + ': array shape ' + (exp && exp.length) + ' vs ' + (got && got.length));
        for (let i = 0; i < exp.length; i++) cmp(exp[i], got[i], where + '[' + i + ']');
        return;
    }
    if (typeof exp === 'object' && typeof got === 'object') {
        const keys = new Set([...Object.keys(exp), ...Object.keys(got)]);
        for (const k of keys) cmp(exp[k], got[k], where + '.' + k);
        return;
    }
    if (exp !== got) fail(where + ': ' + JSON.stringify(exp) + ' vs ' + JSON.stringify(got));
}
// Ellipse geometry via PHASE-INVARIANT moments over the 99 unique
// samples (the 100th duplicates t=0): for x(t) = c + A cos t + B sin t on
// a uniform t grid the mean is exactly c and the centered second moments
// are exactly (AA' + BB')/2, whatever the eigenvector signs - so two
// samplings of the same ellipse compare exactly, while any real geometry
// difference shows up.
function ellipseShape(entry) {
    const all = entry.points || [];
    const pts = all.slice(0, Math.max(0, all.length - 1));
    let sx = 0, sy = 0, area = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        sx += p.x; sy += p.y;
        area += p.x * q.y - q.x * p.y;
    }
    const cx = sx / pts.length, cy = sy / pts.length;
    let mxx = 0, mxy = 0, myy = 0;
    for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - cx, dy = pts[i].y - cy;
        mxx += dx * dx; mxy += dx * dy; myy += dy * dy;
    }
    return { n: all.length, cx, cy, area: Math.abs(area / 2),
             mxx: mxx / pts.length, mxy: mxy / pts.length, myy: myy / pts.length,
             group: entry.group };
}
function cmpEllipses(exp, got, where) {
    checks++;
    if ((exp || []).length !== (got || []).length)
        return fail(where + ': entry count ' + (exp || []).length + ' vs ' + (got || []).length);
    for (let i = 0; i < exp.length; i++) {
        const a = ellipseShape(exp[i]), b = ellipseShape(got[i]);
        if ((exp[i].group || null) !== (got[i].group || null))
            fail(where + '[' + i + '].group: ' + exp[i].group + ' vs ' + got[i].group);
        for (const k of ['n', 'cx', 'cy', 'area', 'mxx', 'mxy', 'myy']) {
            const tol = Math.max(1e-6, 1e-6 * Math.max(Math.abs(a[k]), Math.abs(b[k])));
            if (Math.abs(a[k] - b[k]) > tol)
                fail(where + '[' + i + '].' + k + ': ' + a[k] + ' vs ' + b[k]);
        }
    }
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(400);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
}

await page.evaluate(tab => {
    window.PS_SHELL.loadTable(tab.name, tab.header, tab.rows, tab.types, tab.levels);
}, EXP.table);

for (const [name, c] of Object.entries(EXP.cases)) {
    await page.evaluate(({ mod, roles, opts }) => {
        window.PS_SHELL.chart().options[mod] = Object.assign({}, opts);
        window.PS_SHELL.setRoles(mod, roles);
        window.PS_SHELL.setModule(mod);
    }, { mod: c.mod, roles: c.roles, opts: c.opts });
    await page.waitForTimeout(150);
    const got = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        const svgs = Array.from(document.querySelectorAll('svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        const svg = svgs[0];
        return { payload: p,
                 drew: !!svg && svg.clientWidth > 300 &&
                       svg.querySelectorAll('*').length > 20 &&
                       svg.outerHTML.indexOf('NaN') === -1 };
    });
    const before = failures;
    if (!got.drew) fail(name + ': chart did not draw');
    const expPayload = JSON.parse(readFileSync('/tmp/ps-standalone-parity/' + name + '.payload.json', 'utf8'));
    for (const k of c.channelKeys) {
        if (k === 'xyEllipses') cmpEllipses(expPayload[k], got.payload[k], name + '.' + k);
        else cmp(expPayload[k], got.payload[k], name + '.' + k);
    }
    console.log((failures === before ? '  ok  ' : '  BAD ') + name +
                ' (' + c.channelKeys.length + ' channels)');
}

if (errors.length) fail('page errors: ' + errors[0]);
await browser.close();
console.log(failures === 0
    ? 'M1 PARITY PASS (' + checks + ' comparisons)'
    : 'M1 PARITY: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
