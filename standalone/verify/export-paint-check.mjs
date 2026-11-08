// PowerPoint-safe paints in every exported SVG (Nov 2026, Torry's deck).
//
// "transparent" and rgba() are CSS colors, not SVG 1.1 paint values. The
// browser and librsvg accept both, so the live chart and the PDF export were
// right, but PowerPoint's SVG importer paints each one as OPAQUE BLACK once a
// saved deck is reopened: every error bar's invisible click target (a
// fill="transparent" rect the width of the cap) came back as a solid black
// box, and a bracket's hit stroke as a fat black bar. The engine's harvest
// now rewrites those paints on the export clone (_gb2ExportSafePaints), and
// the standalone's layout export runs the same helper on its assembled root,
// never on the chart snapshots (their bytes feed the Notebook's drift
// verdict; notebook-drift-check guards that).
//
// Cases: 1 the chart export carries no transparent / rgba paint while the
// live chart keeps its click targets; 2 the fold semantics (rgba -> hex +
// multiplied *-opacity, transparent stroke -> none, gradient stop -> black at
// opacity 0, unrelated attributes untouched, live attributes untouched);
// 3 a layout export of that chart is clean too; 4 no page errors.
//
// CONTROL: PS_EXPECT_BROKEN=1 PS_PAGE=<pre-fix standalone/index.html> asserts
// the transparent paints DO survive there, so the probe is known to go red.
import { createRequire } from 'node:module';
import path from 'node:path';

function lp() {
    for (const b of [process.cwd(), '/tmp', '/private/tmp']) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const BROKEN = process.env.PS_EXPECT_BROKEN === '1';
const { chromium } = lp();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
const paints = s => ({
    transparent: (s.match(/\b(?:fill|stroke|stop-color)="transparent"/g) || []).length,
    rgba: (s.match(/\b(?:fill|stroke|stop-color)="rgba?\(/g) || []).length
});

console.log('case 1: the chart export' + (BROKEN ? ' (pre-fix page: paints survive)' : ''));
const c1 = await page.evaluate(async () => {
    const host = document.getElementById('psroot');
    const live = host.querySelector('svg[data-role="gb2-chart-svg"]');
    const hits = () => live.querySelectorAll('[data-role="error-bar"] rect[fill="transparent"]').length;
    const liveEb = live.querySelectorAll('[data-role="error-bar"]').length;
    const liveHits = hits();
    const blob = await window.PS_SHELL.exportBlob('svg', 300, 'shown');
    const text = await blob.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const ebs = [...doc.querySelectorAll('[data-role="error-bar"]')];
    return { text, liveEb, liveHits, liveHitsAfter: hits(),
        ebCount: ebs.length,
        ebLines: ebs.map(g => g.querySelectorAll('line').length),
        ebNone: ebs.filter(g => g.querySelector('rect[fill="none"]')).length,
        ebTrans: ebs.filter(g => g.querySelector('rect[fill="transparent"]')).length };
});
ok(c1.liveEb >= 1, 'the sample chart draws error bars (' + c1.liveEb + ')');
ok(c1.liveHits === c1.liveEb && c1.liveHitsAfter === c1.liveEb,
   'the LIVE chart keeps one transparent click target per error bar, before and after the export');
ok(c1.ebCount === c1.liveEb && c1.ebLines.every(n => n >= 3),
   'the export keeps every error bar with its stem and caps');
const p1 = paints(c1.text);
if (BROKEN) {
    ok(p1.transparent > 0 && c1.ebTrans === c1.ebCount,
       'pre-fix: fill="transparent" survives into the export (' + p1.transparent + ')');
} else {
    ok(p1.transparent === 0 && p1.rgba === 0,
       'no transparent or rgba() paint survives into the export');
    ok(c1.ebNone === c1.ebCount && c1.ebTrans === 0,
       'each exported error bar carries its click target as fill="none"');
}

console.log('case 2: fold semantics on the engine serializer');
const c2 = await page.evaluate(() => {
    const host = document.getElementById('psroot');
    const svg = host.querySelector('svg[data-role="gb2-chart-svg"]');
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('data-role', 'pp-probe');
    const mk = (t, a, parent) => {
        const e = document.createElementNS(NS, t);
        for (const k in a) e.setAttribute(k, a[k]);
        (parent || g).appendChild(e);
        return e;
    };
    mk('rect', { x: 1, y: 1, width: 5, height: 5, fill: 'rgba(255,255,255,0.82)', 'fill-opacity': '0.5', 'data-pp': 'a' });
    mk('line', { x1: 0, y1: 0, x2: 5, y2: 5, stroke: 'rgba(0,0,0,0.25)', 'data-pp': 'b' });
    mk('rect', { x: 1, y: 1, width: 5, height: 5, fill: 'rgb(10, 20, 30)', 'data-pp': 'c' });
    mk('rect', { x: 1, y: 1, width: 5, height: 5, fill: '#123456', 'data-note': 'transparent', 'data-pp': 'd' });
    mk('rect', { x: 1, y: 1, width: 5, height: 5, fill: 'none', stroke: 'transparent', 'stroke-width': '9', 'data-pp': 'e' });
    const lg = mk('linearGradient', { id: 'pp-grad' });
    mk('stop', { offset: '0', 'stop-color': 'transparent', 'data-pp': 'f' }, lg);
    svg.appendChild(g);
    const text = host.__gb2_serializeSvg();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const q = k => doc.querySelector('[data-pp="' + k + '"]');
    const at = (el, names) => Object.fromEntries(names.map(n => [n, el ? el.getAttribute(n) : '(missing)']));
    const out = {
        a: at(q('a'), ['fill', 'fill-opacity']),
        b: at(q('b'), ['stroke', 'stroke-opacity']),
        c: at(q('c'), ['fill', 'fill-opacity']),
        d: at(q('d'), ['fill', 'data-note']),
        e: at(q('e'), ['fill', 'stroke', 'stroke-width']),
        f: at(q('f'), ['stop-color', 'stop-opacity']),
        liveA: g.querySelector('[data-pp="a"]').getAttribute('fill'),
        liveE: g.querySelector('[data-pp="e"]').getAttribute('stroke')
    };
    g.remove();
    return out;
});
ok(c2.liveA === 'rgba(255,255,255,0.82)' && c2.liveE === 'transparent',
   'the live elements keep their rgba() and transparent paints');
ok(c2.d.fill === '#123456' && c2.d['data-note'] === 'transparent',
   'a hex paint and an unrelated attribute spelling "transparent" are untouched');
if (BROKEN) {
    ok(c2.a.fill === 'rgba(255,255,255,0.82)' && c2.e.stroke === 'transparent',
       'pre-fix: rgba() and transparent paints pass through the serializer unchanged');
} else {
    ok(c2.a.fill === '#ffffff' && c2.a['fill-opacity'] === '0.41',
       'rgba fill -> hex + alpha multiplied into the existing fill-opacity (0.5 x 0.82 = 0.41)');
    ok(c2.b.stroke === '#000000' && c2.b['stroke-opacity'] === '0.25',
       'rgba stroke -> hex + stroke-opacity from the alpha');
    ok(c2.c.fill === '#0a141e' && c2.c['fill-opacity'] === null,
       'rgb() without alpha -> hex, no opacity attribute invented');
    ok(c2.e.stroke === 'none' && c2.e.fill === 'none' && c2.e['stroke-width'] === '9',
       'a transparent hit stroke -> none, width and fill untouched');
    ok(c2.f['stop-color'] === '#000000' && c2.f['stop-opacity'] === '0',
       'a transparent gradient stop keeps a color and zeroes its opacity');
}

console.log('case 3: a layout export of the same chart');
const c3 = await page.evaluate(async () => {
    const S = window.PS_SHELL;
    const chartId = S.chart().id;
    S.addLayout();
    await new Promise(r => setTimeout(r, 500));
    const lay = S.chart();
    lay.items = [{ id: 'i0', kind: 'chart', chartId, x: 10, y: 10, w: 460, h: 310 }];
    const blob = await S.exportBlob('svg', 300, 'shown');
    const text = await blob.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const ebs = [...doc.querySelectorAll('[data-role="error-bar"]')];
    return { text, nested: doc.querySelectorAll('svg svg').length, ebCount: ebs.length,
        ebNone: ebs.filter(g => g.querySelector('rect[fill="none"]')).length,
        ebTrans: ebs.filter(g => g.querySelector('rect[fill="transparent"]')).length };
});
ok(c3.nested >= 1 && c3.ebCount >= 1,
   'the layout export nests the chart with its error bars (' + c3.ebCount + ')');
const p3 = paints(c3.text);
if (BROKEN) {
    ok(c3.ebTrans === c3.ebCount, 'pre-fix: the layout export carries the transparent click targets');
} else {
    ok(p3.transparent === 0 && p3.rgba === 0 && c3.ebNone === c3.ebCount && c3.ebTrans === 0,
       'the layout export carries no transparent or rgba() paint; click targets read fill="none"');
}

console.log('case 4: page errors');
ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
console.log(BROKEN ? 'CONTROL OK (pre-fix page behaves as the bug)' : 'ALL GREEN');
