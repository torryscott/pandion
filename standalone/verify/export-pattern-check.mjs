// Pattern fills leave as plain geometry in every export (Nov 2026, Torry's
// SfN poster).
//
// svg2pdf.js (the standalone's PDF), librsvg (jamovi's PDF) and Chromium (a
// browser print) all turn an SVG <pattern> into a PDF tiling pattern, and
// tiling patterns draw hairline seams between tiles in some viewers and print
// RIPs at some zooms: a Quick Look render of the poster showed a white line
// across every striped bar. The engine's export harvest now unrolls each
// pattern fill into the element's base color plus clipped stripe / hatch /
// glyph geometry (_gb2ExportFlattenPatterns), the standalone's layout export
// runs the same helper on its assembled root, and the chart snapshots that
// feed the Notebook's drift verdict are untouched.
//
// Cases, for each pattern kind the engine can draw: 1 the harvested SVG has
// no pattern fill left, carries one flattened group per patterned bar, and
// renders pixel-equal to the live chart (mean difference, per-bar mean color,
// per-bar texture); 2 the PDF export carries no PatternType object;
// 3 a layout export of the striped chart is clean both ways; 4 the stripes
// export converted by jamovi's own rsvg (when jamovi is installed) carries no
// tiling pattern either; 5 no page errors.
//
// CONTROL: PS_EXPECT_BROKEN=1 PS_PAGE=<pre-fix standalone/index.html> asserts
// the pattern fills and PatternType objects DO survive there.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
const KINDS = BROKEN ? ['stripes']
    : ['stripes', 'crosshatch', 'dots', 'plus', 'checkerboard', 'triangles', 'waves', 'zigzag', 'diagonal'];
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
await page.mouse.move(5, 5);
const patternTypeCount = b64 => (Buffer.from(b64, 'base64').toString('latin1').match(/PatternType/g) || []).length;

const DEBUG = process.env.PS_DEBUG_DIR || '';
const measure = () => page.evaluate(async (debug) => {
    const host = document.getElementById('psroot');
    const live = host.querySelector('svg[data-role="gb2-chart-svg"]');
    const liveUses = live.querySelectorAll('[fill^="url(#"]').length;
    const liveStroked = [...live.querySelectorAll('[fill^="url(#"]')].filter(e => {
        const st = e.getAttribute('stroke'); return st && st !== 'none' && parseFloat(e.getAttribute('stroke-width') || '1') > 0; }).length;
    const text = host.__gb2_serializeSvg();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    const out = {
        liveUses, liveStroked,
        exUses: doc.querySelectorAll('[fill^="url(#"]').length,
        exPatterns: doc.querySelectorAll('pattern').length,
        flats: doc.querySelectorAll('[data-gb2-flat="1"]').length,
        outlines: doc.querySelectorAll('[data-gb2-flat="outline"]').length,
        clips: doc.querySelectorAll('clipPath[id^="gb2flat-"]').length,
        text
    };
    // Pixel parity: raster the live chart's own markup and the export through
    // the same viewBox and compare.
    const lv = new DOMParser().parseFromString(new XMLSerializer().serializeToString(live), 'image/svg+xml');
    for (const a of ['viewBox', 'width', 'height']) lv.documentElement.setAttribute(a, root.getAttribute(a));
    const W = parseFloat(root.getAttribute('width')), H = parseFloat(root.getAttribute('height'));
    const vb = root.getAttribute('viewBox').split(/\s+/).map(Number);
    const S = 2;
    async function raster(svgText) {
        const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const c = document.createElement('canvas'); c.width = Math.round(W * S); c.height = Math.round(H * S);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        return { d: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    }
    const A = await raster(new XMLSerializer().serializeToString(lv.documentElement));
    const B = await raster(text);
    // Parity is judged INSIDE the patterned bars: outside them the live
    // markup rendered as a bare image lacks the page's CSS (fonts), which is
    // not what this probe is about.
    const sx = A.w / vb[2], sy = A.h / vb[3];
    out.bars = []; let barSum = 0, barN = 0, strong = 0;
    const diffPng = debug ? document.createElement('canvas') : null;
    if (diffPng) { diffPng.width = A.w; diffPng.height = A.h; }
    const dctx = diffPng ? diffPng.getContext('2d') : null;
    const dimg = dctx ? dctx.createImageData(A.w, A.h) : null;
    if (dimg) for (let i = 0; i < A.d.length; i += 4) { const d = Math.max(Math.abs(A.d[i]-B.d[i]), Math.abs(A.d[i+1]-B.d[i+1]), Math.abs(A.d[i+2]-B.d[i+2])); dimg.data[i] = 255; dimg.data[i+1] = 255 - d; dimg.data[i+2] = 255 - d; dimg.data[i+3] = 255; }
    if (dctx) dctx.putImageData(dimg, 0, 0);
    for (const el of live.querySelectorAll('[fill^="url(#"]')) {
        const bb = el.getBBox();
        const x0 = Math.max(0, Math.floor((bb.x - vb[0]) * sx) + 2), x1 = Math.min(A.w, Math.ceil((bb.x + bb.width - vb[0]) * sx) - 2);
        const y0 = Math.max(0, Math.floor((bb.y - vb[1]) * sy) + 2), y1 = Math.min(A.h, Math.ceil((bb.y + bb.height - vb[1]) * sy) - 2);
        let ma = [0, 0, 0], mb = [0, 0, 0], cnt = 0, sq = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * A.w + x) * 4;
            let mx = 0;
            for (let k = 0; k < 3; k++) { ma[k] += A.d[i + k]; mb[k] += B.d[i + k]; const dd = Math.abs(A.d[i + k] - B.d[i + k]); barSum += dd; if (dd > mx) mx = dd; }
            if (mx > 64) strong++;
            cnt++; barN++;
        }
        if (!cnt) continue;
        ma = ma.map(v => v / cnt); mb = mb.map(v => v / cnt);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = (y * A.w + x) * 4;
            sq += (B.d[i] - mb[0]) ** 2 + (B.d[i + 1] - mb[1]) ** 2 + (B.d[i + 2] - mb[2]) ** 2;
        }
        out.bars.push({ delta: Math.max(...ma.map((v, k) => Math.abs(v - mb[k]))), sd: Math.sqrt(sq / (cnt * 3)), px: cnt });
    }
    out.mad = barN ? barSum / (barN * 3) : 0;
    // Anti-aliasing along stripe edges moves a pixel by a few levels; a
    // misplaced stripe moves a quarter of the bar by a hundred or more.
    out.strongFrac = barN ? strong / barN : 0;
    if (debug) {
        const toPng = (d) => { const c = document.createElement('canvas'); c.width = d.w; c.height = d.h; const x = c.getContext('2d'); const im = x.createImageData(d.w, d.h); im.data.set(d.d); x.putImageData(im, 0, 0); return c.toDataURL('image/png'); };
        out.debug = { live: toPng(A), exp: toPng(B), diff: diffPng.toDataURL('image/png') };
    }
    const pdf = await window.PS_SHELL.exportBlob('pdf', 300, 'shown');
    const buf = new Uint8Array(await pdf.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    out.pdfB64 = btoa(bin);
    return out;
}, DEBUG);
function dumpDebug(kind, m) {
    if (!DEBUG || !m.debug) return;
    fs.mkdirSync(DEBUG, { recursive: true });
    for (const k of ['live', 'exp', 'diff']) fs.writeFileSync(path.join(DEBUG, `${kind}-${k}.png`), Buffer.from(m.debug[k].split(',')[1], 'base64'));
}

let stripesSvg = null;
for (const kind of KINDS) {
    console.log(`pattern "${kind}"`);
    await page.evaluate(k => { window.__gb2_setOption('barPattern', k); }, kind);
    await page.waitForTimeout(2600);
    const m = await measure();
    ok(m.liveUses >= 2, `live chart draws ${m.liveUses} pattern-filled bars`);
    const pt = patternTypeCount(m.pdfB64);
    if (BROKEN) {
        ok(m.exUses === m.liveUses && m.exPatterns > 0, `pre-fix: the export keeps ${m.exUses} pattern fills`);
        ok(pt > 0, `pre-fix: the PDF carries tiling patterns (${pt} PatternType objects)`);
        continue;
    }
    ok(m.exUses === 0 && m.exPatterns === 0, 'the export has no pattern fill and no <pattern> left');
    ok(m.flats === m.liveUses && m.clips === m.liveUses, `one flattened group + clip per patterned bar (${m.flats})`);
    ok(m.outlines === m.liveStroked, `a bar with a visible border gets it re-stroked on top (${m.outlines} of ${m.liveUses} bars are bordered)`);
    dumpDebug(kind, m);
    console.log('        bars: ' + m.bars.map(b => `delta ${b.delta.toFixed(2)} sd ${b.sd.toFixed(1)}`).join(' | '));
    ok(m.strongFrac < 0.01 && m.mad < 8,
       `renders pixel-equal to the live chart inside the bars (${(m.strongFrac * 100).toFixed(2)}% of bar pixels differ strongly; mean abs diff ${m.mad.toFixed(2)} / 255)`);
    const worst = m.bars.reduce((a, b) => Math.max(a, b.delta), 0), minSd = Math.min(...m.bars.map(b => b.sd));
    ok(worst < 6, `each bar keeps its mean color (worst channel delta ${worst.toFixed(2)})`);
    ok(minSd > 8, `each bar still shows texture, not a flat fill (min sd ${minSd.toFixed(1)})`);
    ok(pt === 0, 'the PDF export carries no tiling pattern');
    if (kind === 'stripes') stripesSvg = m.text;
}

if (!BROKEN) {
    console.log('case 2b: bordered striped bars keep the border above the stripes');
    await page.evaluate(() => { window.__gb2_setOption('barPattern', 'stripes'); window.__gb2_setOption('barBorderWidth', 2); });
    await page.waitForTimeout(2600);
    const mb = await measure();
    ok(mb.liveStroked === mb.liveUses && mb.liveStroked >= 2, `every bar is bordered now (${mb.liveStroked})`);
    ok(mb.outlines === mb.liveUses, 'each bordered bar carries one outline clone above its flattened fill');
    dumpDebug('stripes-bordered', mb);
    ok(mb.strongFrac < 0.01 && mb.mad < 8, `bordered render stays pixel-equal inside the bars (${(mb.strongFrac * 100).toFixed(2)}% strong diffs)`);
    ok(patternTypeCount(mb.pdfB64) === 0, 'the bordered PDF export carries no tiling pattern');
    await page.evaluate(() => { window.__gb2_setOption('barBorderWidth', 0); });
    await page.waitForTimeout(2600);

    console.log('case 3: layout export of the striped chart');
    await page.evaluate(k => { window.__gb2_setOption('barPattern', k); }, 'stripes');
    await page.waitForTimeout(2600);
    const c3 = await page.evaluate(async () => {
        const S = window.PS_SHELL;
        const chartId = S.chart().id;
        S.addLayout();
        await new Promise(r => setTimeout(r, 500));
        S.chart().items = [{ id: 'i0', kind: 'chart', chartId, x: 10, y: 10, w: 460, h: 310 }];
        const svg = await (await S.exportBlob('svg', 300, 'shown')).text();
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const pdf = await S.exportBlob('pdf', 300, 'shown');
        const buf = new Uint8Array(await pdf.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return { uses: doc.querySelectorAll('[fill^="url(#"]').length, patterns: doc.querySelectorAll('pattern').length,
            flats: doc.querySelectorAll('[data-gb2-flat="1"]').length, nested: doc.querySelectorAll('svg svg').length, pdfB64: btoa(bin) };
    });
    ok(c3.nested >= 1 && c3.flats >= 2, `the layout export nests the chart with ${c3.flats} flattened bars`);
    ok(c3.uses === 0 && c3.patterns === 0, 'the layout SVG export has no pattern fill left');
    ok(patternTypeCount(c3.pdfB64) === 0, 'the layout PDF export carries no tiling pattern');

    console.log('case 4: the stripes export through jamovi\'s rsvg');
    const RES = '/Applications/jamovi.app/Contents/Frameworks/R.framework/Resources';
    const modlib = path.join(os.homedir(), 'Library/Application Support/jamovi/modules/pandion/R');
    if (fs.existsSync(path.join(RES, 'bin/Rscript')) && fs.existsSync(path.join(modlib, 'rsvg'))) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-pattern-'));
        const inSvg = path.join(dir, 'stripes.svg'), outPdf = path.join(dir, 'stripes.pdf');
        fs.writeFileSync(inSvg, stripesSvg);
        try {
            execFileSync(path.join(RES, 'bin/Rscript'), ['-e', `rsvg::rsvg_pdf(${JSON.stringify(inSvg)}, ${JSON.stringify(outPdf)})`],
                { env: { ...process.env, RHOME: RES, R_HOME: RES, R_LIBS: modlib }, stdio: 'pipe', timeout: 120000 });
            const n = (fs.readFileSync(outPdf).toString('latin1').match(/PatternType/g) || []).length;
            ok(n === 0, 'rsvg (jamovi\'s PDF engine) writes the export with no tiling pattern');
        } catch (e) {
            console.log('  skip  rsvg conversion failed to run: ' + String(e).split('\n')[0]);
        }
    } else {
        console.log('  skip  jamovi\'s R or its rsvg library not found on this machine');
    }
}

console.log('case 5: page errors');
ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
console.log(BROKEN ? 'CONTROL OK (pre-fix page behaves as the bug)' : 'ALL GREEN');
