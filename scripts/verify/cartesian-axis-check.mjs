// Suite-wide regression for centered Cartesian axes.
//
// Every common Cartesian renderer centers X/Y strokes on the live data
// boundary. At a zero endpoint, the tick therefore shares the perpendicular
// axis centerline regardless of independent axis/tick widths. The fixtures
// below exercise each real module family that renders the common axes; Likert
// also passes through those axes around its bespoke diverging scale.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [
        process.env.GB2_NODE_BASE,
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    ].filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found (set GB2_NODE_BASE)');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';

const FIXTURES = [
    {
        key: 'cg', label: 'Compare Groups', file: 'cg_dot.html',
        zeros: { vertical: ['y'], horizontal: ['x'] },
    },
    {
        key: 'rm', label: 'Repeated Measures', file: 'rm_dot.html',
        zeros: { vertical: ['y'], horizontal: ['x'] },
    },
    {
        key: 'scatter', label: 'Scatter', file: 'xy_basic.html',
        // Scatter deliberately ignores horizontal orientation; both axes stay
        // numeric in the canonical vertical layout.
        zeros: { vertical: ['x', 'y'], horizontal: ['x', 'y'] },
    },
    {
        key: 'dist', label: 'Distribution', file: 'dist_hist.html',
        // The transposed form keeps both numeric axes: count/value on bottom,
        // original continuous data on the left.
        zeros: { vertical: ['x', 'y'], horizontal: ['x', 'y'] },
    },
    {
        key: 'freq', label: 'Frequencies', file: 'freq_bar_stack.html',
        zeros: { vertical: ['y'], horizontal: ['x'] },
    },
    {
        key: 'likert', label: 'Likert', file: 'likert_div.html',
        // Likert's visible percent scale is bespoke, but its surrounding
        // common Cartesian frame still has a numeric endpoint in each mode.
        zeros: { vertical: ['y'], horizontal: ['x'] },
    },
];

const X_TICK_LEN = 7;
const Y_TICK_LEN = 9;
const X_TICK_WIDTH = 0.75;
const Y_TICK_WIDTH = 2.25;
const WIDTH_CASES = [
    { label: 'default widths', x: 1.5, y: 1.5 },
    { label: 'thick X / thin Y', x: 4, y: 1 },
    { label: 'thin X / thick Y', x: 1, y: 4 },
    { label: 'fractional X / thick Y', x: 0.75, y: 4 },
    { label: 'thick X / fractional Y', x: 4, y: 0.75 },
];

let failures = 0;
function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) failures++;
}
function near(a, b, epsilon = 0.01) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}
function nfmt(v) {
    return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : 'missing';
}

async function seedHarnessBase(page) {
    return page.evaluate(() => {
        let data = window.__gb2_payload;
        if (!data) {
            const marker = 'var __gb2_payload = ';
            const script = [...document.querySelectorAll('script')]
                .map(el => el.textContent || '')
                .find(text => text.includes(marker)) || '';
            const start = script.indexOf(marker) + marker.length;
            const end = script.indexOf(';\nvar __gb2_id =', start);
            if (start < marker.length || end < 0)
                throw new Error('Embedded GraphBuilder payload not found');
            data = JSON.parse(script.slice(start, end));
        }
        window.__gb2CartesianAxisHarnessBase = JSON.parse(JSON.stringify(data));
        return true;
    });
}

async function rerenderWith(page, changes) {
    await page.evaluate(patch => {
        const base = window.__gb2CartesianAxisHarnessBase;
        if (!base) throw new Error('Cartesian-axis base payload was not seeded');
        const payload = JSON.parse(JSON.stringify(base));
        Object.assign(payload, patch);
        const host = document.querySelector('.graphbuilder2-host');
        if (!host) throw new Error('GraphBuilder host not found');
        window.__gb2_payload = payload;
        window.GraphBuilder2.render(host.id, payload);
    }, changes);
    // SVG <line> has zero geometric height/width, so Playwright's default
    // visible-state check rejects a painted horizontal/vertical stroke.
    await page.waitForSelector(
        '[data-role="x-axis-line"], [data-role="y-axis-line"]',
        { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(20);
}

async function geometry(page) {
    return page.evaluate(() => {
        function read(el) {
            if (!el) return null;
            const num = name => {
                const raw = el.getAttribute(name);
                return raw === null ? NaN : Number(raw);
            };
            return {
                tag: el.tagName.toLowerCase(),
                x1: num('x1'), x2: num('x2'),
                y1: num('y1'), y2: num('y2'),
                width: num('stroke-width'),
                linecap: el.getAttribute('stroke-linecap') || '',
                d: el.getAttribute('d') || '',
            };
        }
        function roleOne(role) {
            return read(document.querySelector('[data-role="' + role + '"]'));
        }
        function roleAll(role) {
            return [...document.querySelectorAll('[data-role="' + role + '"]')].map(read);
        }
        const labels = [...document.querySelectorAll('svg text')]
            .map(el => {
                const num = name => {
                    const raw = el.getAttribute(name);
                    return raw === null ? NaN : Number(raw);
                };
                return {
                    text: (el.textContent || '').trim(),
                    x: num('x'), y: num('y'),
                    role: el.getAttribute('data-role') || '',
                };
            });
        // The axis hit strips are found by their data-role handle (Sep 19
        // 2026): their tooltip text now names the axis by drawn position.
        function visibleHit(title, cursor, role) {
            const candidates = [...document.querySelectorAll('div')].filter(node => {
                const cs = getComputedStyle(node);
                const width = parseFloat(node.style.width);
                const height = parseFloat(node.style.height);
                return (!title || node.title === title) && (!cursor || cs.cursor === cursor) &&
                    (!role || node.getAttribute('data-role') === role) &&
                    cs.display !== 'none' && cs.visibility !== 'hidden' &&
                    width > 0 && height > 0;
            });
            // The non-faceted Y hit column intentionally has no title and
            // shares its ns-resize cursor with the small corner grip. Its
            // tall aspect ratio identifies the live tick/axis strip.
            const el = cursor === 'ns-resize'
                ? candidates.find(node => parseFloat(node.style.height) > parseFloat(node.style.width))
                : candidates[0];
            if (!el) return null;
            return {
                left: parseFloat(el.style.left),
                top: parseFloat(el.style.top),
                width: parseFloat(el.style.width),
                height: parseFloat(el.style.height),
            };
        }
        return {
            x: roleOne('x-axis-line'),
            y: roleOne('y-axis-line'),
            xTicks: roleAll('x-tick'),
            yTicks: roleAll('y-tick'),
            breaks: roleAll('axis-break'),
            labels,
            hasZeroLabel: labels.some(label => label.text === '0'),
            hits: {
                x: visibleHit(null, null, 'x-axis-hit'),
                y: visibleHit('', 'ns-resize'),
            },
        };
    });
}

function bottommost(ticks) {
    return ticks.reduce((best, tick) =>
        !best || tick.y1 > best.y1 ? tick : best, null);
}
function leftmost(ticks) {
    return ticks.reduce((best, tick) =>
        !best || tick.x1 < best.x1 ? tick : best, null);
}
function zeroLabel(g) {
    return g.labels.find(label => label.text === '0') || null;
}

function middleTick(ticks, coord) {
    if (!ticks.length) return null;
    const sorted = [...ticks].sort((a, b) => a[coord] - b[coord]);
    return sorted[Math.floor(sorted.length / 2)];
}

function commonPatch(extra = {}) {
    return Object.assign({
        yMinOverride: true, yMin: 0,
        yMaxOverride: true, yMax: 20,
        yIntervalOverride: true, yInterval: 5,
        xMinOverride: true, xMin: 0,
        xMaxOverride: true, xMax: 20,
        xIntervalOverride: true, xInterval: 5,
        xAxisBreak: false,
        yAxisBreak: false,
        xAxisStyle: 'solid',
        yAxisStyle: 'solid',
        xTickLength: X_TICK_LEN,
        yTickLength: Y_TICK_LEN,
        xTickThickness: X_TICK_WIDTH,
        yTickThickness: Y_TICK_WIDTH,
        xTickDirection: 'out',
        yTickDirection: 'out',
        xMinorTicks: false,
        yMinorTicks: false,
        yTickRelabels: [],
        hiddenElements: [],
    }, extra);
}

function checkJoint(prefix, g, widths) {
    check(prefix + ' renders both axes', !!g.x && !!g.y);
    if (!g.x || !g.y) return false;
    check(prefix + ' preserves independent axis widths',
        near(g.x.width, widths.x) && near(g.y.width, widths.y),
        'X=' + nfmt(g.x.width) + ', Y=' + nfmt(g.y.width));
    check(prefix + ' ends Y at X center', near(g.y.y2, g.x.y1),
        'Y end=' + nfmt(g.y.y2) + ', X center=' + nfmt(g.x.y1));
    check(prefix + ' starts X at visible Y outer edge',
        near(g.x.x1, g.y.x1 - g.y.width / 2),
        'X start=' + nfmt(g.x.x1) + ', Y outer=' + nfmt(g.y.x1 - g.y.width / 2));
    check(prefix + ' uses butt caps',
        g.x.linecap === 'butt' && g.y.linecap === 'butt');
    return true;
}

function tickExpected(axis, direction, len, orient) {
    if (orient === 'y') {
        const outer = axis.x1 - axis.width / 2;
        const inner = axis.x1 + axis.width / 2;
        if (direction === 'in') return [inner, inner + len];
        if (direction === 'both') return [outer - len, inner + len];
        return [outer - len, outer];
    }
    const inner = axis.y1 - axis.width / 2;
    const outer = axis.y1 + axis.width / 2;
    if (direction === 'in') return [inner - len, inner];
    if (direction === 'both') return [inner - len, outer + len];
    return [outer, outer + len];
}

function checkTickAnchors(prefix, g, direction) {
    if (g.yTicks.length && g.y) {
        const expected = tickExpected(g.y, direction, Y_TICK_LEN, 'y');
        const anchored = g.yTicks.every(tick =>
            near(tick.x1, expected[0]) && near(tick.x2, expected[1]) &&
            near(tick.width, Y_TICK_WIDTH));
        check(prefix + ' anchors every Y tick to live Y stroke edges', anchored,
            'expected [' + nfmt(expected[0]) + ',' + nfmt(expected[1]) + ']');
    }
    if (g.xTicks.length && g.x) {
        const expected = tickExpected(g.x, direction, X_TICK_LEN, 'x');
        const anchored = g.xTicks.every(tick =>
            near(tick.y1, expected[0]) && near(tick.y2, expected[1]) &&
            near(tick.width, X_TICK_WIDTH));
        check(prefix + ' anchors every X tick to live X stroke edges', anchored,
            'expected [' + nfmt(expected[0]) + ',' + nfmt(expected[1]) + ']');
    }
}

function checkCenteredZeros(prefix, g, zeroAxes) {
    check(prefix + ' renders a zero label', g.hasZeroLabel);
    if (zeroAxes.includes('y')) {
        const zero = bottommost(g.yTicks);
        check(prefix + ' puts Y zero on X centerline',
            !!zero && !!g.x && near(zero.y1, g.x.y1) && near(zero.y2, g.x.y1),
            zero && g.x ? 'zero=' + nfmt(zero.y1) + ', X=' + nfmt(g.x.y1) : 'missing');
    }
    if (zeroAxes.includes('x')) {
        const zero = leftmost(g.xTicks);
        check(prefix + ' puts X zero on Y centerline',
            !!zero && !!g.y && near(zero.x1, g.y.x1) && near(zero.x2, g.y.x1),
            zero && g.y ? 'zero=' + nfmt(zero.x1) + ', Y=' + nfmt(g.y.x1) : 'missing');
    }
}

function pathPairs(d) {
    const nums = String(d || '').match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) || [];
    const out = [];
    for (let i = 0; i + 1 < nums.length; i += 2)
        out.push([Number(nums[i]), Number(nums[i + 1])]);
    return out;
}

function checkYBreak(prefix, g) {
    const pairs = g.y ? pathPairs(g.y.d) : [];
    check(prefix + ' renders Y as a genuinely gapped path',
        !!g.y && g.y.tag === 'path' && pairs.length >= 4);
    if (!g.y || !g.x || pairs.length < 4) return;
    const center = pairs[0][0];
    check(prefix + ' keeps every Y path segment on centered Y',
        pairs.every(pair => near(pair[0], center)) &&
            near(center, g.x.x1 + g.y.width / 2),
        'path=' + nfmt(center) + ', joint=' + nfmt(g.x.x1 + g.y.width / 2));
    check(prefix + ' ends broken Y at X centerline',
        near(pairs[pairs.length - 1][1], g.x.y1));
    check(prefix + ' centers both break slashes on Y',
        g.breaks.length === 2 && g.breaks.every(line => near((line.x1 + line.x2) / 2, center)));
}

function checkXBreak(prefix, g) {
    const pairs = g.x ? pathPairs(g.x.d) : [];
    check(prefix + ' renders X as a genuinely gapped path',
        !!g.x && g.x.tag === 'path' && pairs.length >= 4);
    if (!g.x || !g.y || pairs.length < 4) return;
    const center = pairs[0][1];
    check(prefix + ' keeps every X path segment on centered X',
        pairs.every(pair => near(pair[1], center)) && near(center, g.y.y2),
        'path=' + nfmt(center) + ', joint=' + nfmt(g.y.y2));
    check(prefix + ' starts broken X at visible Y outer edge',
        near(pairs[0][0], g.y.x1 - g.y.width / 2));
    check(prefix + ' centers both break slashes on X',
        g.breaks.length === 2 && g.breaks.every(line => near((line.y1 + line.y2) / 2, center)));
}

async function clickFacetedAxisLine(page, axis) {
    const probe = await page.evaluate(axisName => {
        const role = axisName === 'x' ? 'x-axis-hit' : 'y-axis-hit';
        const candidates = [...document.querySelectorAll('div[data-role="' + role + '"]')]
            .filter(el => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden' &&
                    r.width > 0 && r.height > 0;
            });
        if (!candidates.length) return null;
        const hit = candidates[0];
        const rect = hit.getBoundingClientRect();
        const tickRole = axisName === 'x' ? 'x-tick' : 'y-tick';
        const tickCoords = [...document.querySelectorAll('[data-role="' + tickRole + '"]')]
            .map(el => {
                const r = el.getBoundingClientRect();
                return axisName === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
            })
            .filter(v => axisName === 'x'
                ? v >= rect.left && v <= rect.right
                : v >= rect.top && v <= rect.bottom);
        const lo = (axisName === 'x' ? rect.left : rect.top) + 3;
        const hi = (axisName === 'x' ? rect.right : rect.bottom) - 3;
        let best = (lo + hi) / 2;
        let bestDistance = -1;
        for (let i = 0; i <= 80; i++) {
            const candidate = lo + (hi - lo) * i / 80;
            const distance = tickCoords.length
                ? Math.min(...tickCoords.map(v => Math.abs(v - candidate))) : Infinity;
            if (distance > bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
        return {
            x: axisName === 'x' ? best : rect.left + rect.width / 2,
            y: axisName === 'x' ? rect.top + rect.height / 2 : best,
            hitCount: candidates.length,
            nearestTick: bestDistance,
        };
    }, axis);
    if (!probe) return null;
    await page.mouse.click(probe.x, probe.y);
    await page.waitForTimeout(40);
    probe.part = await page.evaluate(() => window.__gb2_lastClickedAxisPart || '');
    return probe;
}

async function lineIndicatorGeometry(page, sourceRole) {
    return page.evaluate(role => {
        function num(el, name) {
            const raw = el.getAttribute(name);
            return raw === null ? NaN : Number(raw);
        }
        function sourceSegments(el) {
            if (el.tagName.toLowerCase() === 'line') {
                return [{
                    x1: num(el, 'x1'), y1: num(el, 'y1'),
                    x2: num(el, 'x2'), y2: num(el, 'y2'),
                }];
            }
            const nums = String(el.getAttribute('d') || '')
                .match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) || [];
            const points = [];
            for (let i = 0; i + 1 < nums.length; i += 2)
                points.push([Number(nums[i]), Number(nums[i + 1])]);
            const segments = [];
            // Axis-break paths are deliberately encoded as M-L / M-L pairs.
            for (let i = 0; i + 1 < points.length; i += 2) {
                segments.push({
                    x1: points[i][0], y1: points[i][1],
                    x2: points[i + 1][0], y2: points[i + 1][1],
                });
            }
            return segments;
        }
        function rects(selector) {
            return [...document.querySelectorAll(selector)].map(el => ({
                x: num(el, 'x'), y: num(el, 'y'),
                width: num(el, 'width'), height: num(el, 'height'),
            }));
        }
        const sources = [...document.querySelectorAll('[data-role="' + role + '"]')]
            .filter(el => el.tagName.toLowerCase() === 'line' || el.tagName.toLowerCase() === 'path');
        return {
            sourceElements: sources.length,
            pathElements: sources.filter(el => el.tagName.toLowerCase() === 'path').length,
            segments: sources.flatMap(sourceSegments),
            bands: rects('[data-role="inspector-indicator-back"] [data-role="sel-glow"]'),
            highlights: rects('[data-role="inspector-indicator"] [data-role="sel-glow-hl"]'),
        };
    }, sourceRole);
}

function haloMatchesSegment(halo, segment) {
    const vertical = Math.abs(segment.y2 - segment.y1) >= Math.abs(segment.x2 - segment.x1);
    if (vertical) {
        return near(halo.x + halo.width / 2, segment.x1, 0.1) &&
            near(halo.y, Math.min(segment.y1, segment.y2), 0.1) &&
            near(halo.height, Math.abs(segment.y2 - segment.y1), 0.1);
    }
    return near(halo.y + halo.height / 2, segment.y1, 0.1) &&
        near(halo.x, Math.min(segment.x1, segment.x2), 0.1) &&
        near(halo.width, Math.abs(segment.x2 - segment.x1), 0.1);
}

function segmentsCoveredExactly(segments, halos) {
    if (segments.length !== halos.length) return false;
    const remaining = [...halos];
    for (const segment of segments) {
        const index = remaining.findIndex(halo => haloMatchesSegment(halo, segment));
        if (index < 0) return false;
        remaining.splice(index, 1);
    }
    return remaining.length === 0;
}

function longestSegment(segments) {
    return segments.reduce((best, segment) => {
        const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
        const bestLength = best
            ? Math.hypot(best.x2 - best.x1, best.y2 - best.y1) : -1;
        return length > bestLength ? segment : best;
    }, null);
}

function brokenHaloLeavesGap(segments, halos) {
    let foundGap = false;
    for (let i = 0; i < segments.length; i++) {
        const a = segments[i];
        const vertical = Math.abs(a.y2 - a.y1) >= Math.abs(a.x2 - a.x1);
        for (let j = i + 1; j < segments.length; j++) {
            const b = segments[j];
            const bVertical = Math.abs(b.y2 - b.y1) >= Math.abs(b.x2 - b.x1);
            if (vertical !== bVertical) continue;
            const sameCenter = vertical
                ? near(a.x1, b.x1, 0.1) : near(a.y1, b.y1, 0.1);
            if (!sameCenter) continue;
            const aLo = vertical ? Math.min(a.y1, a.y2) : Math.min(a.x1, a.x2);
            const aHi = vertical ? Math.max(a.y1, a.y2) : Math.max(a.x1, a.x2);
            const bLo = vertical ? Math.min(b.y1, b.y2) : Math.min(b.x1, b.x2);
            const bHi = vertical ? Math.max(b.y1, b.y2) : Math.max(b.x1, b.x2);
            const lo = aHi <= bLo ? aHi : (bHi <= aLo ? bHi : NaN);
            const hi = aHi <= bLo ? bLo : (bHi <= aLo ? aLo : NaN);
            if (!Number.isFinite(lo) || hi - lo < 0.5) continue;
            foundGap = true;
            const mid = (lo + hi) / 2;
            const bridged = halos.some(halo => {
                const center = vertical
                    ? halo.x + halo.width / 2 : halo.y + halo.height / 2;
                if (!near(center, vertical ? a.x1 : a.y1, 0.1)) return false;
                const hLo = vertical ? halo.y : halo.x;
                const hHi = hLo + (vertical ? halo.height : halo.width);
                return hLo < mid - 0.05 && hHi > mid + 0.05;
            });
            if (bridged) return false;
        }
    }
    return foundGap;
}

const browser = await chromium.launch();

for (const fixture of FIXTURES) {
    const file = path.join(OUT, fixture.file);
    if (!existsSync(file)) {
        check(fixture.label + ' fixture exists', false, file);
        continue;
    }

    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
        await page.goto('file://' + file);
        await page.waitForSelector('svg', { timeout: 30000 });
        await seedHarnessBase(page);

        for (const widths of WIDTH_CASES) {
            for (const orientation of ['vertical', 'horizontal']) {
                await rerenderWith(page, commonPatch({
                    chartOrientation: orientation,
                    xAxisThickness: widths.x,
                    yAxisThickness: widths.y,
                }));
                const g = await geometry(page);
                const prefix = fixture.label + ' / ' + widths.label + ' / ' + orientation;
                if (checkJoint(prefix, g, widths)) {
                    checkTickAnchors(prefix + ' / OUT', g, 'out');
                    checkCenteredZeros(prefix, g, fixture.zeros[orientation]);
                }
            }
        }

        // Direction formulas live in several renderer branches (categorical,
        // continuous-X and transposed distribution). Exercise each module in
        // both requested orientations with a strongly mismatched axis pair.
        for (const orientation of ['vertical', 'horizontal']) {
            for (const direction of ['out', 'in', 'both']) {
                await rerenderWith(page, commonPatch({
                    chartOrientation: orientation,
                    xAxisThickness: 4,
                    yAxisThickness: 1,
                    xTickDirection: direction,
                    yTickDirection: direction,
                }));
                const g = await geometry(page);
                checkTickAnchors(
                    fixture.label + ' / ' + orientation + ' / ' + direction.toUpperCase(),
                    g, direction);
            }
        }

        // Hidden adjoining axes must not leave phantom width-dependent stubs.
        await rerenderWith(page, commonPatch({
            chartOrientation: 'vertical',
            xAxisThickness: 1,
            yAxisThickness: 2,
            hiddenElements: ['xAxisLine'],
        }));
        const hiddenXThin = await geometry(page);
        await rerenderWith(page, commonPatch({
            chartOrientation: 'vertical',
            xAxisThickness: 4,
            yAxisThickness: 2,
            hiddenElements: ['xAxisLine'],
        }));
        const hiddenXThick = await geometry(page);
        check(fixture.label + ' hidden X removes only X',
            !hiddenXThin.x && !!hiddenXThin.y && !hiddenXThick.x && !!hiddenXThick.y);
        check(fixture.label + ' hidden X width does not move visible Y endpoint',
            !!hiddenXThin.y && !!hiddenXThick.y &&
                near(hiddenXThin.y.y2, hiddenXThick.y.y2),
            hiddenXThin.y && hiddenXThick.y
                ? nfmt(hiddenXThin.y.y2) + ' vs ' + nfmt(hiddenXThick.y.y2) : 'missing Y');

        await rerenderWith(page, commonPatch({
            chartOrientation: 'horizontal',
            xAxisThickness: 2,
            yAxisThickness: 1,
            hiddenElements: ['yAxisLine'],
        }));
        const hiddenYThin = await geometry(page);
        await rerenderWith(page, commonPatch({
            chartOrientation: 'horizontal',
            xAxisThickness: 2,
            yAxisThickness: 4,
            hiddenElements: ['yAxisLine'],
        }));
        const hiddenYThick = await geometry(page);
        const zeroThin = leftmost(hiddenYThin.xTicks);
        const zeroThick = leftmost(hiddenYThick.xTicks);
        check(fixture.label + ' hidden Y removes only Y',
            !!hiddenYThin.x && !hiddenYThin.y && !!hiddenYThick.x && !hiddenYThick.y);
        check(fixture.label + ' hidden Y preserves visible X width',
            !!hiddenYThin.x && !!hiddenYThick.x &&
                near(hiddenYThin.x.width, 2) && near(hiddenYThick.x.width, 2));
        check(fixture.label + ' hidden Y starts X at its live zero/data boundary',
            !!hiddenYThin.x && !!hiddenYThick.x && !!zeroThin && !!zeroThick &&
                near(hiddenYThin.x.x1, zeroThin.x1) && near(hiddenYThick.x.x1, zeroThick.x1));

        // Distribution exercises the path-with-literal-gap code in both
        // orientations. A zero-width axis must also suppress the break
        // slashes; otherwise the break remains visibly orphaned after its
        // corresponding axis has been hidden through the width control.
        if (fixture.key === 'dist') {
            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 1,
                yMin: 5,
                yAxisBreak: true,
            }));
            checkYBreak('Distribution / vertical Y break', await geometry(page));

            await rerenderWith(page, commonPatch({
                chartOrientation: 'horizontal',
                xAxisThickness: 4,
                yAxisThickness: 1,
                yMin: 5,
                xAxisBreak: true,
            }));
            checkXBreak('Distribution / horizontal X break', await geometry(page));

            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 0,
                yMin: 5,
                yAxisBreak: true,
            }));
            const zeroWidthYBreak = await geometry(page);
            check('Distribution / zero-width Y suppresses Y break slashes',
                zeroWidthYBreak.breaks.length === 0,
                String(zeroWidthYBreak.breaks.length) + ' slash(es)');

            await rerenderWith(page, commonPatch({
                chartOrientation: 'horizontal',
                xAxisThickness: 0,
                yAxisThickness: 4,
                yMin: 5,
                xAxisBreak: true,
            }));
            const zeroWidthXBreak = await geometry(page);
            check('Distribution / zero-width X suppresses X break slashes',
                zeroWidthXBreak.breaks.length === 0,
                String(zeroWidthXBreak.breaks.length) + ' slash(es)');
        }

        // Scatter and the continuous Distribution family share the numeric-X
        // renderer. Thickness zero is an explicit hide setting, not a request
        // to fall back to the default one-pixel stroke.
        if (fixture.key === 'scatter' || fixture.key === 'dist') {
            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 1,
                xTickThickness: 3,
            }));
            const continuousXVisible = await geometry(page);
            check(fixture.label + ' continuous X has ticks before zero-thickness probe',
                continuousXVisible.xTicks.length > 0,
                String(continuousXVisible.xTicks.length) + ' tick(s)');

            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 1,
                xTickThickness: 0,
            }));
            const continuousXHidden = await geometry(page);
            check(fixture.label + ' zero X-tick thickness hides continuous-X ticks',
                continuousXHidden.xTicks.length === 0,
                String(continuousXHidden.xTicks.length) + ' tick(s)');
        }

        // IN ticks live wholly inside the plot, so their length must not push
        // labels farther outward. Compare relative label-to-stroke gaps so a
        // layout reflow between renders cannot create a false result.
        if (fixture.key === 'cg') {
            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 4,
                yTickDirection: 'in',
                yTickLength: 2,
            }));
            const yInShort = await geometry(page);
            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 4,
                yAxisThickness: 4,
                yTickDirection: 'in',
                yTickLength: 18,
            }));
            const yInLong = await geometry(page);
            const yShortLabel = zeroLabel(yInShort);
            const yLongLabel = zeroLabel(yInLong);
            const yShortGap = yShortLabel && yInShort.y
                ? yInShort.y.x1 - yInShort.y.width / 2 - yShortLabel.x : NaN;
            const yLongGap = yLongLabel && yInLong.y
                ? yInLong.y.x1 - yInLong.y.width / 2 - yLongLabel.x : NaN;
            check('Compare Groups / vertical IN Y labels ignore inward tick length',
                near(yShortGap, yLongGap),
                nfmt(yShortGap) + ' vs ' + nfmt(yLongGap));

            await rerenderWith(page, commonPatch({
                chartOrientation: 'horizontal',
                xAxisThickness: 4,
                yAxisThickness: 4,
                xTickDirection: 'in',
                xTickLength: 2,
            }));
            const xInShort = await geometry(page);
            await rerenderWith(page, commonPatch({
                chartOrientation: 'horizontal',
                xAxisThickness: 4,
                yAxisThickness: 4,
                xTickDirection: 'in',
                xTickLength: 18,
            }));
            const xInLong = await geometry(page);
            const xShortLabel = zeroLabel(xInShort);
            const xLongLabel = zeroLabel(xInLong);
            const xShortGap = xShortLabel && xInShort.x
                ? xShortLabel.y - (xInShort.x.y1 + xInShort.x.width / 2) : NaN;
            const xLongGap = xLongLabel && xInLong.x
                ? xLongLabel.y - (xInLong.x.y1 + xInLong.x.width / 2) : NaN;
            check('Compare Groups / horizontal IN X labels ignore inward tick length',
                near(xShortGap, xLongGap),
                nfmt(xShortGap) + ' vs ' + nfmt(xLongGap));
        }

        // The HTML interaction strips sit above the SVG. With independently
        // widened axes and ticks, they still need to span the complete live
        // outward geometry while retaining coverage of an interior tick's
        // full stroke thickness along the axis.
        if (fixture.key === 'scatter') {
            await rerenderWith(page, commonPatch({
                chartOrientation: 'vertical',
                xAxisThickness: 10,
                yAxisThickness: 10,
                xTickLength: 14,
                yTickLength: 14,
                xTickThickness: 3,
                yTickThickness: 3,
                xTickDirection: 'out',
                yTickDirection: 'out',
            }));
            const hitGeom = await geometry(page);
            const xHit = hitGeom.hits.x;
            const yHit = hitGeom.hits.y;
            const xTickMid = middleTick(hitGeom.xTicks, 'x1');
            const yTickMid = middleTick(hitGeom.yTicks, 'y1');
            const xInner = hitGeom.x ? hitGeom.x.y1 - hitGeom.x.width / 2 : NaN;
            const xTickOuter = hitGeom.xTicks.length
                ? Math.max(...hitGeom.xTicks.map(tick => Math.max(tick.y1, tick.y2))) : NaN;
            const yInner = hitGeom.y ? hitGeom.y.x1 + hitGeom.y.width / 2 : NaN;
            const yTickOuter = hitGeom.yTicks.length
                ? Math.min(...hitGeom.yTicks.map(tick => Math.min(tick.x1, tick.x2))) : NaN;
            check('Scatter widened X hit strip covers axis and OUT ticks',
                !!xHit && xHit.top <= xInner + 0.01 &&
                    xHit.top + xHit.height >= xTickOuter - 0.01,
                xHit ? '[' + nfmt(xHit.top) + ',' + nfmt(xHit.top + xHit.height) +
                    '] vs [' + nfmt(xInner) + ',' + nfmt(xTickOuter) + ']' : 'missing hit strip');
            check('Scatter widened Y hit strip covers axis and OUT ticks',
                !!yHit && yHit.left <= yTickOuter + 0.01 &&
                    yHit.left + yHit.width >= yInner - 0.01,
                yHit ? '[' + nfmt(yHit.left) + ',' + nfmt(yHit.left + yHit.width) +
                    '] vs [' + nfmt(yTickOuter) + ',' + nfmt(yInner) + ']' : 'missing hit strip');
            check('Scatter widened X hit strip covers an interior tick stroke',
                !!xHit && !!xTickMid &&
                    xHit.left <= xTickMid.x1 - xTickMid.width / 2 + 0.01 &&
                    xHit.left + xHit.width >= xTickMid.x1 + xTickMid.width / 2 - 0.01,
                xHit && xTickMid ? '[' + nfmt(xHit.left) + ',' + nfmt(xHit.left + xHit.width) +
                    '] vs [' + nfmt(xTickMid.x1 - xTickMid.width / 2) + ',' +
                    nfmt(xTickMid.x1 + xTickMid.width / 2) + ']' : 'missing geometry');
            check('Scatter widened Y hit strip covers an interior tick stroke',
                !!yHit && !!yTickMid &&
                    yHit.top <= yTickMid.y1 - yTickMid.width / 2 + 0.01 &&
                    yHit.top + yHit.height >= yTickMid.y1 + yTickMid.width / 2 - 0.01,
                yHit && yTickMid ? '[' + nfmt(yHit.top) + ',' + nfmt(yHit.top + yHit.height) +
                    '] vs [' + nfmt(yTickMid.y1 - yTickMid.width / 2) + ',' +
                    nfmt(yTickMid.y1 + yTickMid.width / 2) + ']' : 'missing geometry');
        }

        check(fixture.label + ' page has no runtime errors',
            pageErrors.length === 0, pageErrors.join(' | '));
    } catch (error) {
        check(fixture.label + ' probe completed', false, error.message.split('\n')[0]);
    }

    await ctx.close();
}

// Facet affordances select a global axis style, so the indicator must trace
// every live panel segment rather than synthesizing one outer-chart line.
// Use a real wrapped Scatter facet fixture with one panel per row: both X and
// Y axes render once per panel there, making omissions directly countable.
const facetFile = path.join(OUT, 'xy_facet.html');
if (existsSync(facetFile)) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
        await page.goto('file://' + facetFile);
        await page.waitForSelector('svg', { timeout: 30000 });
        await seedHarnessBase(page);
        await rerenderWith(page, commonPatch({
            chartOrientation: 'vertical',
            facetLayout: 'wrap',
            facetWrapCols: 1,
            xAxisThickness: 4,
            yAxisThickness: 1,
        }));
        // Isolate the baseline reverse-glow indicator. The optional Axis Lab
        // replaces it with animated flank paths, whose styling is covered by
        // its own verification and obscures segment-count assertions here.
        await page.evaluate(() => {
            window.__gb2_labAxis = { on: false };
            window.__gb2_lastGlowSig = '';
        });

        const xClick = await clickFacetedAxisLine(page, 'x');
        const xHalo = await lineIndicatorGeometry(page, 'x-axis-line');
        check('Faceted X exposes a line-select hit strip for every panel',
            !!xClick && xClick.hitCount > 1,
            xClick ? String(xClick.hitCount) + ' hit strip(s)' : 'missing');
        check('Faceted X probe selects the line, not its ticks',
            !!xClick && xClick.part === 'line',
            xClick ? 'part=' + xClick.part + ', nearest tick=' + nfmt(xClick.nearestTick) : 'missing');
        check('Faceted X renders multiple axis segments',
            xHalo.segments.length > 1,
            String(xHalo.segments.length) + ' segment(s)');
        check('Faceted X selection emits one back halo per rendered segment',
            segmentsCoveredExactly(xHalo.segments, xHalo.bands),
            String(xHalo.bands.length) + ' halo(s) for ' + xHalo.segments.length + ' segment(s)');
        check('Faceted X selection emits one front highlight per rendered segment',
            segmentsCoveredExactly(xHalo.segments, xHalo.highlights),
            String(xHalo.highlights.length) + ' highlight(s) for ' + xHalo.segments.length + ' segment(s)');

        const yClick = await clickFacetedAxisLine(page, 'y');
        const yHalo = await lineIndicatorGeometry(page, 'y-axis-line');
        check('Faceted Y exposes a line-select hit strip for every panel',
            !!yClick && yClick.hitCount > 1,
            yClick ? String(yClick.hitCount) + ' hit strip(s)' : 'missing');
        check('Faceted Y probe selects the line, not its ticks',
            !!yClick && yClick.part === 'line',
            yClick ? 'part=' + yClick.part + ', nearest tick=' + nfmt(yClick.nearestTick) : 'missing');
        check('Faceted Y renders multiple axis segments',
            yHalo.segments.length > 1,
            String(yHalo.segments.length) + ' segment(s)');
        check('Faceted Y selection emits one back halo per rendered segment',
            segmentsCoveredExactly(yHalo.segments, yHalo.bands),
            String(yHalo.bands.length) + ' halo(s) for ' + yHalo.segments.length + ' segment(s)');
        check('Faceted Y selection emits one front highlight per rendered segment',
            segmentsCoveredExactly(yHalo.segments, yHalo.highlights),
            String(yHalo.highlights.length) + ' highlight(s) for ' + yHalo.segments.length + ' segment(s)');

        // The horizontal value axis supports a literal path gap. Selection
        // must clone those path segments; a single synthesized full-width
        // rectangle would visually fill both the // break and facet gaps.
        await rerenderWith(page, commonPatch({
            chartOrientation: 'vertical',
            facetLayout: 'wrap',
            facetWrapCols: 1,
            xAxisThickness: 4,
            yAxisThickness: 1,
            xMin: 5,
            xAxisBreak: true,
        }));
        const brokenClick = await clickFacetedAxisLine(page, 'x');
        const brokenHalo = await lineIndicatorGeometry(page, 'x-axis-line');
        check('Faceted broken X probe selects the line',
            !!brokenClick && brokenClick.part === 'line',
            brokenClick ? 'part=' + brokenClick.part : 'missing');
        check('Faceted broken X exposes literal multi-segment paths',
            brokenHalo.pathElements > 0 && brokenHalo.segments.length > brokenHalo.sourceElements,
            String(brokenHalo.pathElements) + ' path(s), ' +
                brokenHalo.segments.length + ' segment(s)');
        check('Faceted broken X selection traces each path segment',
            segmentsCoveredExactly(brokenHalo.segments, brokenHalo.bands) &&
                segmentsCoveredExactly(brokenHalo.segments, brokenHalo.highlights),
            String(brokenHalo.bands.length) + '/' + brokenHalo.highlights.length +
                ' halos for ' + brokenHalo.segments.length + ' segment(s)');
        check('Faceted broken X selection leaves every literal gap open',
            brokenHalo.pathElements > 0 && brokenHaloLeavesGap(brokenHalo.segments, brokenHalo.bands));
        check('Faceted indicator page has no runtime errors',
            pageErrors.length === 0, pageErrors.join(' | '));
    } catch (error) {
        check('Faceted axis-indicator probe completed', false, error.message.split('\n')[0]);
    }
    await ctx.close();
} else {
    check('Faceted axis-indicator fixture exists', false, facetFile);
}

// Likert uses bespoke axis/grid/center lines rather than the common Cartesian
// frame. Its real line-hit rectangles make selection straightforward to probe.
const likertIndicatorFile = path.join(OUT, 'likert_div.html');
if (existsSync(likertIndicatorFile)) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
        await page.goto('file://' + likertIndicatorFile);
        await page.waitForSelector('[data-role="likert-axis"]',
            { state: 'attached', timeout: 30000 });
        await seedHarnessBase(page);
        async function clickLikertLine(title) {
            const clicked = await page.evaluate(titleText => {
                const hit = [...document.querySelectorAll('[data-role="likert-line-hit"]')]
                    .find(el => {
                        const titleEl = el.querySelector('title');
                        return titleEl && titleEl.textContent === titleText;
                    });
                if (!hit) return false;
                hit.dispatchEvent(new MouseEvent('click', {
                    bubbles: true, cancelable: true, view: window,
                }));
                return true;
            }, title);
            await page.waitForTimeout(30);
            return clicked;
        }

        const axisClicked = await clickLikertLine('Click to style the x-axis');
        const axisIndicator = await lineIndicatorGeometry(page, 'likert-axis');
        const axisMain = longestSegment(axisIndicator.segments);
        check('Likert X-axis line hit is available', axisClicked);
        check('Likert X-axis selection indicates its main baseline',
            !!axisMain && axisIndicator.bands.some(halo => haloMatchesSegment(halo, axisMain)) &&
                axisIndicator.highlights.some(halo => haloMatchesSegment(halo, axisMain)),
            String(axisIndicator.bands.length) + '/' + axisIndicator.highlights.length + ' indicator layer(s)');

        const gridClicked = await clickLikertLine('Click to style the grid lines');
        const gridIndicator = await lineIndicatorGeometry(page, 'likert-grid');
        check('Likert grid-line hit is available', gridClicked);
        check('Likert grid selection indicates every rendered grid line',
            segmentsCoveredExactly(gridIndicator.segments, gridIndicator.bands) &&
                segmentsCoveredExactly(gridIndicator.segments, gridIndicator.highlights),
            String(gridIndicator.bands.length) + '/' + gridIndicator.highlights.length +
                ' halos for ' + gridIndicator.segments.length + ' grid line(s)');

        const zeroClicked = await clickLikertLine('Click to style the zero line');
        const zeroIndicator = await lineIndicatorGeometry(page, 'likert-center');
        check('Likert zero-line hit is available', zeroClicked);
        check('Likert zero-line selection indicates the center line',
            segmentsCoveredExactly(zeroIndicator.segments, zeroIndicator.bands) &&
                segmentsCoveredExactly(zeroIndicator.segments, zeroIndicator.highlights),
            String(zeroIndicator.bands.length) + '/' + zeroIndicator.highlights.length +
                ' halos for ' + zeroIndicator.segments.length + ' center line(s)');

        // Width zero hides both the bespoke baseline and its tick strokes.
        // Labels should then drop only the real tick depth, not retain a
        // phantom four-pixel gap. A thick-axis companion probe confirms the
        // tick starts at the live outer stroke edge when it is visible.
        async function likertAxisGeometry(width) {
            await rerenderWith(page, commonPatch({ likertXAxisWidth: width }));
            return page.evaluate(() => {
                const lines = [...document.querySelectorAll('[data-role="likert-axis"]')]
                    .map(el => ({
                        x1: Number(el.getAttribute('x1')),
                        y1: Number(el.getAttribute('y1')),
                        x2: Number(el.getAttribute('x2')),
                        y2: Number(el.getAttribute('y2')),
                        width: Number(el.getAttribute('stroke-width')),
                    }));
                const baseline = lines.reduce((best, line) => {
                    const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
                    const bestLen = best
                        ? Math.hypot(best.x2 - best.x1, best.y2 - best.y1) : -1;
                    return len > bestLen ? line : best;
                }, null);
                const label = document.querySelector('[data-role="likert-axis-label"]');
                return {
                    baseline,
                    ticks: lines.filter(line => line !== baseline),
                    labelY: label ? Number(label.getAttribute('y')) : NaN,
                };
            });
        }
        const likertZeroWidth = await likertAxisGeometry(0);
        check('Likert zero-width axis omits zero-stroke tick lines',
            likertZeroWidth.ticks.length === 0,
            String(likertZeroWidth.ticks.length) + ' tick line(s)');
        check('Likert zero-width axis removes phantom tick spacing',
            !!likertZeroWidth.baseline &&
                near(likertZeroWidth.labelY - likertZeroWidth.baseline.y1, 12),
            likertZeroWidth.baseline
                ? nfmt(likertZeroWidth.labelY - likertZeroWidth.baseline.y1) + ' px'
                : 'missing baseline');
        const likertThick = await likertAxisGeometry(4);
        const likertOuter = likertThick.baseline
            ? likertThick.baseline.y1 + likertThick.baseline.width / 2 : NaN;
        check('Likert ticks start at the thick axis outer edge',
            likertThick.ticks.length > 0 && likertThick.ticks.every(tick =>
                near(tick.y1, likertOuter) && near(tick.y2, likertOuter + 4)),
            String(likertThick.ticks.length) + ' tick line(s)');
        check('Likert indicator page has no runtime errors',
            pageErrors.length === 0, pageErrors.join(' | '));
    } catch (error) {
        check('Likert line-indicator probe completed', false, error.message.split('\n')[0]);
    }
    await ctx.close();
} else {
    check('Likert line-indicator fixture exists', false, likertIndicatorFile);
}

// Pareto draws a bespoke cumulative-percent axis on the right (vertical
// charts) or top (horizontal charts). Keep its inherited direction, hidden-
// tick label spacing, and direction-aware hit strip under regression coverage.
const paretoAxisFile = path.join(OUT, 'freq_pareto.html');
if (existsSync(paretoAxisFile)) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
        await page.goto('file://' + paretoAxisFile);
        await page.waitForSelector('[data-role="pareto-axis"]',
            { state: 'attached', timeout: 30000 });
        await seedHarnessBase(page);

        async function paretoGeometry() {
            return page.evaluate(() => {
                const num = (el, name) => el ? Number(el.getAttribute(name)) : NaN;
                const segments = [...document.querySelectorAll('[data-role="pareto-axis"]')]
                    .map(el => ({
                        x1: num(el, 'x1'), y1: num(el, 'y1'),
                        x2: num(el, 'x2'), y2: num(el, 'y2'),
                        width: num(el, 'stroke-width'),
                    }));
                const main = segments.reduce((best, seg) => {
                    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
                    const bestLen = best
                        ? Math.hypot(best.x2 - best.x1, best.y2 - best.y1) : -1;
                    return len > bestLen ? seg : best;
                }, null);
                const ticks = segments.filter(seg => seg !== main);
                const label = document.querySelector('[data-role="pareto-axis-label"]');
                const hit = document.querySelector('[data-role="pareto-axis-hit"]');
                return {
                    main, ticks,
                    label: label ? { x: num(label, 'x'), y: num(label, 'y') } : null,
                    hit: hit ? {
                        x: num(hit, 'x'), y: num(hit, 'y'),
                        width: num(hit, 'width'), height: num(hit, 'height'),
                    } : null,
                };
            });
        }

        async function renderPareto(orientation, patch = {}) {
            await rerenderWith(page, commonPatch(Object.assign({
                graphType: 'pareto', chartOrientation: orientation,
                paretoAxisThickness: 4,
                paretoTickLength: 9,
                paretoTickThickness: 2,
                paretoTickDirection: 'out',
            }, patch)));
            return paretoGeometry();
        }

        function paretoLabelGap(g, orientation) {
            if (!g.main || !g.label) return NaN;
            return orientation === 'horizontal'
                ? (g.main.y1 - g.main.width / 2) - g.label.y
                : g.label.x - (g.main.x1 + g.main.width / 2);
        }

        for (const orientation of ['vertical', 'horizontal']) {
            const zeroShort = await renderPareto(orientation, {
                paretoTickThickness: 0, paretoTickLength: 2,
            });
            const zeroLong = await renderPareto(orientation, {
                paretoTickThickness: 0, paretoTickLength: 18,
            });
            const shortGap = paretoLabelGap(zeroShort, orientation);
            const longGap = paretoLabelGap(zeroLong, orientation);
            check('Pareto / ' + orientation +
                    ' / zero tick thickness removes phantom label length',
                near(shortGap, longGap), nfmt(shortGap) + ' vs ' + nfmt(longGap));

            const inherited = await renderPareto(orientation, {
                yTickDirection: 'in', paretoTickDirection: '',
                paretoTickLength: 11, paretoTickThickness: 2,
            });
            const inheritedIn = !!inherited.main && inherited.ticks.length > 0 &&
                inherited.ticks.every(tick => orientation === 'horizontal'
                    ? near(Math.min(tick.y1, tick.y2), inherited.main.y1 + inherited.main.width / 2) &&
                        near(Math.max(tick.y1, tick.y2), inherited.main.y1 + inherited.main.width / 2 + 11)
                    : near(Math.max(tick.x1, tick.x2), inherited.main.x1 - inherited.main.width / 2) &&
                        near(Math.min(tick.x1, tick.x2), inherited.main.x1 - inherited.main.width / 2 - 11));
            check('Pareto / ' + orientation +
                    ' / blank direction inherits primary IN direction',
                inheritedIn, inherited.ticks.length + ' tick(s)');

            const covered = await renderPareto(orientation, {
                yAxisThickness: 4,
                paretoAxisThickness: 6,
                paretoTickLength: 17,
                paretoTickThickness: 4,
                paretoTickDirection: 'both',
            });
            const lineBounds = covered.main && covered.ticks.length > 0
                ? [covered.main, ...covered.ticks].reduce((box, seg) => {
                    const horizontal = Math.abs(seg.y2 - seg.y1) < 0.01;
                    const half = seg.width / 2;
                    const left = horizontal ? Math.min(seg.x1, seg.x2)
                        : seg.x1 - half;
                    const right = horizontal ? Math.max(seg.x1, seg.x2)
                        : seg.x1 + half;
                    const top = horizontal ? seg.y1 - half
                        : Math.min(seg.y1, seg.y2);
                    const bottom = horizontal ? seg.y1 + half
                        : Math.max(seg.y1, seg.y2);
                    return {
                        left: Math.min(box.left, left),
                        right: Math.max(box.right, right),
                        top: Math.min(box.top, top),
                        bottom: Math.max(box.bottom, bottom),
                    };
                }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity })
                : null;
            const hitCovers = !!lineBounds && !!covered.hit &&
                covered.hit.x <= lineBounds.left + 0.01 &&
                covered.hit.x + covered.hit.width >= lineBounds.right - 0.01 &&
                covered.hit.y <= lineBounds.top + 0.01 &&
                covered.hit.y + covered.hit.height >= lineBounds.bottom - 0.01;
            check('Pareto / ' + orientation +
                    ' / BOTH-direction hit strip covers full axis and ticks',
                hitCovers, covered.hit && lineBounds
                    ? JSON.stringify({ hit: covered.hit, lines: lineBounds }) : 'missing geometry');
        }
        check('Pareto custom-axis page has no runtime errors',
            pageErrors.length === 0, pageErrors.join(' | '));
    } catch (error) {
        check('Pareto custom-axis probe completed', false, error.message.split('\n')[0]);
    }
    await ctx.close();
} else {
    check('Pareto custom-axis fixture exists', false, paretoAxisFile);
}

await browser.close();

if (failures) {
    console.error('\n' + failures + ' Cartesian-axis check(s) failed');
    process.exit(1);
}
console.log('\nCartesian-axis checks passed');
