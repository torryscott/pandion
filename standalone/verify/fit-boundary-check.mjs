// Regression values/intervals against R, including explicitly unavailable
// models and zero-residual-df bands. Source helpers and actual browser payloads
// are both checked; PS_PAGE selects the portable artifact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const dir = process.argv[2] || '/tmp/pandion-fit-boundary';
const refs = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
const expectedIds = [];
for (const d of [1, 2, 3]) for (const suffix of ['level80', 'level95', 'level99', 'small_units', 'large_units', 'offset', 'small_response', 'tied_x', 'constant_y', 'zero_df', 'one_df', 'too_few', 'rank_deficient']) expectedIds.push(`ols${d}_${suffix}`);
for (const shape of ['regular', 'irregular', 'tied']) for (const span of [.1, .5, .75, 1, 1.5]) for (const level of [.8, .95, .99]) expectedIds.push(`loess_${shape}_${span}_${level}`);
assert.equal(refs.schemaVersion, 1);
assert.deepEqual(Object.keys(refs.cases).sort(), expectedIds.sort(), 'complete fixed boundary roster required');
const statSource = fs.readFileSync('standalone/js/ps-stat.js', 'utf8');
const S = new Function('var window = {};\n' + statSource + '\nreturn window.PSStat;')();
const source = fs.readFileSync('inst/widget/graphbuilder2.js', 'utf8');
function extract(name) {
    const at = source.indexOf('function ' + name + '(');
    assert(at >= 0, 'missing ' + name);
    let depth = 0;
    for (let i = source.indexOf('{', at); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(at, i + 1);
    }
    throw new Error('unbalanced function ' + name);
}
const statsAt = source.indexOf('    var _gb2Stats = {');
const statsEnd = source.indexOf('\n    };', statsAt);
assert(statsAt >= 0 && statsEnd > statsAt);
const shared = new Function(source.slice(statsAt, statsEnd + 7) + '\n' +
    ['_xyMatInv', '_xyTCrit', '_xyFitOLS'].map(extract).join('\n') + '\nreturn _xyFitOLS;')();
let checks = 0, failures = [];
function verify(condition, label) { checks++; if (!condition) throw new Error(label); }
function points(p) {
    if (!p) return null;
    if (!Array.isArray(p)) return p;
    const out = { xs: p.map(v => v.x), ys: p.map(v => v.y) };
    if (p.some(v => Object.hasOwn(v, 'lwr') || Object.hasOwn(v, 'upr'))) {
        out.lwrs = p.map(v => v.lwr); out.uprs = p.map(v => v.upr);
    }
    return out;
}
function compare(ref, got, c, label) {
    if (!c.available) return verify(got === null, label + ': unavailable model must not produce a fit');
    verify(ref && got, label + ': expected fit is missing');
    const fields = c.df > 0 ? ['xs', 'ys', 'lwrs', 'uprs'] : ['xs', 'ys'];
    if (c.df === 0) verify(!Object.hasOwn(got, 'lwrs') && !Object.hasOwn(got, 'uprs'), label + ': zero residual df must not produce a confidence band');
    for (const field of fields) {
        verify(Array.isArray(ref[field]) && ref[field].length > 0 && ref[field].every(Number.isFinite), label + ': invalid reference ' + field);
        verify(Array.isArray(got[field]) && got[field].length === ref[field].length, label + ': wrong array shape ' + field);
        // Absolute error scales with the response, not with an arbitrary unit
        // floor of 1. This catches wrong small-response curves and intervals.
        const scale = Math.max(...(field === 'xs' ? c.x : c.y).map(Math.abs), Number.MIN_VALUE);
        const tolerance = 2e-9 * scale;
        for (let i = 0; i < ref[field].length; i++) verify(Number.isFinite(got[field][i]) && Math.abs(ref[field][i] - got[field][i]) <= tolerance,
            `${label}.${field}[${i}]: expected ${ref[field][i]}, got ${got[field][i]} (tolerance ${tolerance})`);
    }
}
function run(label, fn) { try { fn(); } catch (e) { failures.push(label + ': ' + e.message); } }
function geometry(ref, geo, c, label) {
    if (!c.available) return;
    verify(geo.points.length === c.x.length, label + ': observation points required for independent coordinate calibration');
    const calibrate = (values, dimension) => {
        const lo = values.indexOf(Math.min(...values)), hi = values.indexOf(Math.max(...values));
        const slope = values[hi] !== values[lo] ? (geo.points[hi][dimension] - geo.points[lo][dimension]) / (values[hi] - values[lo]) : 0;
        return v => geo.points[lo][dimension] + slope * (v - values[lo]);
    };
    const px = calibrate(c.x, 0), py = calibrate(c.y, 1);
    const nums = d => (d?.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig) || []).map(Number);
    function pathMatches(d, pairs, name) {
        const actual = nums(d);
        verify(actual.length === pairs.length * 2, label + ': ' + name + ' vertex count');
        for (let i = 0; i < pairs.length; i++) {
            verify(Math.abs(actual[2*i] - px(pairs[i][0])) < .001 && Math.abs(actual[2*i+1] - py(pairs[i][1])) < .001,
                label + ': ' + name + ' vertex ' + i + ' differs from the independent R prediction by >0.001 SVG units');
        }
    }
    pathMatches(geo.curve, ref.xs.map((x,i) => [x,ref.ys[i]]), 'curve');
    if (c.df > 0) pathMatches(geo.band,
        ref.xs.map((x,i) => [x,ref.uprs[i]]).concat(ref.xs.map((x,i) => [x,ref.lwrs[i]]).reverse()), 'band');
}
for (const [id, c] of Object.entries(refs.cases)) {
    assert.equal(c.type, id.startsWith('loess_') ? 'loess' : ['linear', 'poly2', 'poly3'][Number(id[3]) - 1], id + ': fit type');
    assert(Array.isArray(c.x) && c.x.length > 0 && c.x.every(Number.isFinite), id + ': input x');
    assert(Array.isArray(c.y) && c.y.length === c.x.length && c.y.every(Number.isFinite), id + ': input y');
    assert.equal(c.available, !id.endsWith('_too_few') && !id.endsWith('_rank_deficient'), id + ': availability contract');
    if (c.available) {
        assert(Number.isFinite(c.df) && c.df >= 0, id + ': reference residual df');
        if (c.type !== 'loess') assert.equal(c.df, c.x.length - c.degree - 1, id + ': residual df');
        else assert(c.df > 0, id + ': LOESS interval df');
    }
    run(id + '/Jamovi', () => {
        verify(Array.isArray(c.hostFits), id + ': host fit list missing');
        verify(c.hostFits.length === (c.available ? 1 : 0), id + ': host fit count');
        compare(c.reference, c.hostFits[0]?.points || null, c, id + '/Jamovi');
    });
    if (c.type === 'loess') continue; // The standalone curve uses another surface convention and has no band.
    for (const [name, fn] of [['standalone core', S.olsFit], ['shared preview', shared]]) {
        run(id + '/' + name, () => {
            compare(c.reference, points(fn(c.x, c.y, c.degree, c.level, c.reference?.xs || c.x)), c, id + '/' + name);
            if (c.available) compare(c.extrapolation, points(fn(c.x, c.y, c.degree, c.level, c.extrapolation.xs)), c, id + '/' + name + '/extrapolation');
        });
    }
}
if (!process.argv.includes('--unit')) {
    let chromium;
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp'].filter(Boolean)) {
        try { ({ chromium } = createRequire(path.join(base, 'x.js'))('playwright')); break; } catch {}
    }
    assert(chromium, 'playwright required');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE || 'standalone/index.html')).href);
        await page.waitForFunction(() => window.PS_SHELL && window.PSStat);
        if (await page.locator('#ps-welcome').isVisible()) await page.click('#ps-welcome-sample');
        for (const [id, c] of Object.entries(refs.cases)) {
            if (process.env.PS_VERIFY_TRACE) console.log('browser case '+id);
            const got = await page.evaluate(c => {
                PS_SHELL.loadTable('fit-boundary', ['x', 'y'], c.x.map((v, i) => [String(v), String(c.y[i])]), { x: 'numeric', y: 'numeric' });
                // This suite checks every observed-range vertex. Enclose the
                // independent curve AND interval so clipping cannot remove any
                // of those vertices; fit-export separately checks cropped paths.
                const spec = { xyShowFit: true, xyShowCI: true };
                if (c.available) {
                    const ys = c.y.concat(c.reference.ys, c.reference.lwrs || [], c.reference.uprs || []);
                    const lo = Math.min(...ys), hi = Math.max(...ys);
                    const pad = Math.max(hi - lo, Math.abs(hi) * 1e-4, Number.MIN_VALUE) * .1;
                    spec.yMinOverride = spec.yMaxOverride = true;
                    spec.yMin = lo - pad; spec.yMax = hi + pad;
                }
                const opts = { xyFitType: c.type, xyCILevel: c.level, xyLoessSpan: c.span || .75,
                    chartSpec: JSON.stringify(spec) };
                PS_SHELL.chart().options.xyplotbuilder = opts;
                PS_SHELL.setRoles('xyplotbuilder', { xvar: 'x', yvar: 'y' });
                PS_SHELL.setModule('xyplotbuilder');
                const payload = PS_SHELL.buildPayload();
                const fits = structuredClone(payload.xyFits);
                // Exercise the actual bundled renderer with the authoritative
                // payload, with the full observed-range curve/band visible.
                // Exported extrapolation geometry is a separate contract.
                payload.xyFitFullRange = false;
                const rPayload = structuredClone(payload);
                rPayload.xyFits = c.hostFits;
                function readGeometry() {
                    return { points: [...document.querySelectorAll('#psroot [data-role="xy-point"]')].map(p => {
                        const b = p.getBBox(); return [b.x + b.width/2, b.y + b.height/2];
                    }), curve: document.querySelector('#psroot [data-role="xy-fit"]')?.getAttribute('d'),
                    band: document.querySelector('#psroot [data-role="xy-ci"]')?.getAttribute('d') };
                }
                GraphBuilder2.render('psroot', payload);
                const paths = [...document.querySelectorAll('#psroot [data-role="xy-fit"], #psroot [data-role="xy-ci"]')];
                const rendered = { fits, curves: paths.filter(p => p.getAttribute('data-role') === 'xy-fit').length,
                    bands: paths.filter(p => p.getAttribute('data-role') === 'xy-ci').length,
                    finite: paths.every(p => p.getAttribute('d') && !/NaN|Infinity/.test(p.getAttribute('d'))), geometry: readGeometry() };
                GraphBuilder2.render('psroot', rPayload);
                rendered.hostGeometry = readGeometry();
                return rendered;
            }, c);
            run(id + '/browser', () => {
                verify(got.fits.length === (c.available ? 1 : 0), id + ': browser fit count');
                verify(got.curves === (c.available ? 1 : 0), id + ': rendered curve count');
                verify(got.bands === (c.available && c.type !== 'loess' && c.df > 0 ? 1 : 0), id + ': rendered confidence band count');
                verify(got.finite, id + ': nonfinite rendered path');
                if (c.type === 'loess') {
                    verify(!Object.hasOwn(got.fits[0].points, 'lwrs') && !Object.hasOwn(got.fits[0].points, 'uprs'), id + ': standalone LOESS must remain curve-only');
                } else {
                    compare(c.reference, got.fits[0]?.points || null, c, id + '/browser');
                    geometry(c.reference, got.geometry, c, id + '/standalone geometry');
                }
                geometry(c.reference, got.hostGeometry, c, id + '/R payload geometry');
            });
        }
        verify(errors.length === 0, 'browser errors: ' + errors.join('\n'));
    } finally { await browser.close(); }
}
for (const failure of failures) console.error('FAIL ' + failure);
console.log(`FIT BOUNDARY: ${Object.keys(refs.cases).length} cases, ${checks} checks, ${failures.length} failures`);
process.exitCode = failures.length ? 1 : 0;
