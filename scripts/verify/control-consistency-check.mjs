// Regression checks for the July 2026 control-consistency pass.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp'].filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    throw new Error('playwright not found (set GB2_NODE_BASE)');
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const source = readFileSync(path.join(ROOT, 'inst/widget/graphbuilder2.js'), 'utf8');
const guide = readFileSync(path.join(ROOT, 'docs/user-guide.html'), 'utf8');
const launchQa = readFileSync(path.join(ROOT, 'LAUNCH-QA-CHECKLIST.html'), 'utf8');
const browser = await chromium.launch();
let fails = 0;

function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) fails++;
}

async function withPage(file, fn) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 1100 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(OUT, file + '.html'));
    await page.waitForSelector('svg', { timeout: 10000 });
    await fn(page);
    check(file + ' has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

async function shapeGeometry(page, selector) {
    return page.evaluate(sel => {
        const buttons = [...document.querySelectorAll(sel)];
        if (!buttons.length) return null;
        const parent = buttons[0].parentElement;
        const rows = new Map();
        for (const button of buttons) {
            const top = Math.round(button.getBoundingClientRect().top);
            rows.set(top, (rows.get(top) || 0) + 1);
        }
        const pr = parent.getBoundingClientRect();
        return {
            count: buttons.length,
            rowCounts: [...rows.values()],
            width: pr.width,
            overflow: parent.scrollWidth > parent.clientWidth + 1,
            names: buttons.map(b => b.getAttribute('aria-label') || b.title || b.textContent.trim())
        };
    }, selector);
}

async function patternColorGeometry(page, rowSelector, currentSelector, paletteSelector) {
    return page.evaluate(({ rowSelector, currentSelector, paletteSelector }) => {
        const row = document.querySelector(rowSelector);
        const current = row?.querySelector(currentSelector);
        const swatches = [...(row?.querySelectorAll(paletteSelector) || [])];
        const palette = swatches[0]?.parentElement;
        if (!row || !current || !palette || !swatches.length) return null;
        const cr = current.getBoundingClientRect();
        const pr = palette.getBoundingClientRect();
        return {
            resetActions: row.querySelectorAll('[data-field*="reset"], [data-role*="reset"]').length,
            currentWidth: cr.width,
            swatchWidths: swatches.map(s => s.getBoundingClientRect().width),
            paletteLeft: pr.left,
            currentRight: cr.right,
            centerDelta: Math.abs((pr.top + pr.height / 2) - (cr.top + cr.height / 2)),
            followsCurrent: !!(current.compareDocumentPosition(palette) & Node.DOCUMENT_POSITION_FOLLOWING)
        };
    }, { rowSelector, currentSelector, paletteSelector });
}

async function rerenderWith(page, changes) {
    await page.evaluate(patch => {
        let payload = window.__gb2_payload;
        if (!payload) {
            // Scan ALL script tags: the widget's diag primer (Jul 2026)
            // sits in front of the payload-carrying loader script.
            const marker = 'var __gb2_payload = ';
            const script = [...document.querySelectorAll('script')]
                .map(el => el.textContent || '')
                .find(text => text.includes(marker)) || '';
            const start = script.indexOf(marker) + marker.length;
            const end = script.indexOf(';\nvar __gb2_id =', start);
            if (start < marker.length || end < 0)
                throw new Error('Embedded GraphBuilder payload not found');
            payload = JSON.parse(script.slice(start, end));
        }
        payload = JSON.parse(JSON.stringify(payload));
        Object.assign(payload, patch);
        const id = document.querySelector('.graphbuilder2-host')?.id;
        window.__gb2_payload = payload;
        window.GraphBuilder2.render(id, payload);
    }, changes);
    await page.waitForSelector('[data-role="line-marker"]');
    // Re-rendering can place a new marker underneath the stationary mouse
    // pointer, which intentionally applies the transient hover tint.
    await page.mouse.move(710, 10);
    await page.waitForTimeout(20);
}

// A visible error-bar line must not enter an open marker's body. This
// checks stems AND caps, including the short-interval case where the whole
// interval can fit inside a large marker.
async function openMarkerErrorBarClearance(page, shape, direction = 'both', extra = {}) {
    await rerenderWith(page, {
        linePointShape: shape,
        linePointSize: 80,
        linePointOutlineWidth: 2,
        errorBarDirection: direction,
        lineGroupOverrides: [],
        ...extra
    });
    return page.evaluate(() => {
        const markers = [...document.querySelectorAll('[data-role="line-marker"]')];
        let checked = 0;
        const overlaps = [];
        const fills = new Set();
        for (const marker of markers) {
            const owner = marker.parentElement;
            const cat = owner?.getAttribute('data-bar-cat') || '';
            const group = owner?.getAttribute('data-bar-group') || '';
            const eb = [...document.querySelectorAll('[data-role="error-bar"]')].find(el =>
                (el.getAttribute('data-bar-cat') || '') === cat &&
                (el.getAttribute('data-bar-group') || '') === group);
            if (!eb) continue;
            const box = marker.getBBox();
            const left = box.x, right = box.x + box.width;
            const top = box.y, bottom = box.y + box.height;
            fills.add(marker.getAttribute('fill') || '');
            checked++;
            for (const line of eb.querySelectorAll('line')) {
                const x1 = +line.getAttribute('x1'), x2 = +line.getAttribute('x2');
                const y1 = +line.getAttribute('y1'), y2 = +line.getAttribute('y2');
                const vertical = Math.abs(x1 - x2) < 0.01;
                const horizontal = Math.abs(y1 - y2) < 0.01;
                let enters = false;
                if (vertical && x1 > left && x1 < right) {
                    enters = Math.max(Math.min(y1, y2), top) <
                        Math.min(Math.max(y1, y2), bottom) - 0.01;
                } else if (horizontal && y1 > top + 0.01 && y1 < bottom - 0.01) {
                    enters = Math.max(Math.min(x1, x2), left) <
                        Math.min(Math.max(x1, x2), right) - 0.01;
                }
                if (enters) overlaps.push({ cat, group, x1, x2, y1, y2, box });
            }
        }
        return { checked, overlaps, fills: [...fills] };
    });
}

// All seven live eight-shape menus must consume the one canonical grid.
const compactGridRefs = (source.match(/_GB2_COMPACT_SHAPE_GRID_CSS/g) || []).length;
check('Seven live shape menus share the compact grid', compactGridRefs === 8,
    String(compactGridRefs - 1) + ' uses'); // one occurrence is the declaration
const compactLineStyleRefs = (source.match(/_GB2_COMPACT_LINE_STYLE_TILE_CSS/g) || []).length;
check('Four-option line styles share the compact tile width', compactLineStyleRefs >= 13,
    String(compactLineStyleRefs - 1) + ' uses'); // one occurrence is the declaration
check('Active interface and guidance avoid the word tellable',
    !/tellable/i.test(source + guide + launchQa));
check('Vision-check results use the qualified separation-check wording',
    source.includes('pass the separation check under every vision type above') &&
    source.includes('pass the separation check under this vision type') &&
    guide.includes('pass the separation check there'));
check('Value-sort controls are absent from the shared Order pane',
    !/data-field=["']cat-sort["']|data-role=["']sort-(?:asc|desc)["']/.test(source));

// Pattern-color rows use one shared visual sentence everywhere: the larger
// current-color control first, followed immediately by compact quick colors,
// with no action for restoring automatic contrast after an override.
await withPage('cg_bar_labels', async page => {
    await page.locator('[data-bar-cat]:not([data-role])').first().click();
    await page.locator('[data-bs-btn="bar-pattern"]').click();
    await page.locator('[data-preset-pattern="stripes"]').click();
    await page.locator('[data-field="patcolor-row"]').waitFor({ state: 'visible' });
    const g = await patternColorGeometry(page, '[data-field="patcolor-row"]',
        '[data-field="patcolor-chip"]', '[data-bs-palette-target="patcolor-chip"]');
    check('Shared pattern color puts compact swatches to the right of the current color',
        !!g && g.resetActions === 0 && g.followsCurrent &&
        g.paletteLeft >= g.currentRight + 1 && g.centerDelta <= 3 &&
        g.swatchWidths.every(w => w < g.currentWidth), JSON.stringify(g));
});

await withPage('dist_hist', async page => {
    await page.locator('[data-role="dist-hist-bar"]').first().click();
    await page.locator('[data-dist-btn="pattern"]').click();
    const g = await patternColorGeometry(page, '[data-field="dh-patcolor-row"]',
        '[data-field="dh-patc"]', '[data-dhp-palette-target="patcolor"]');
    check('Distribution pattern color uses the same current-color then swatches layout',
        !!g && g.resetActions === 0 && g.followsCurrent &&
        g.paletteLeft >= g.currentRight + 1 && g.centerDelta <= 3 &&
        g.swatchWidths.every(w => w < g.currentWidth), JSON.stringify(g));
});

await withPage('freq_pie', async page => {
    await page.locator('[data-role="freq-slice"]').first().click();
    await page.locator('[data-dist-btn="pattern"]').click();
    const g = await patternColorGeometry(page, '[data-field="dh-patcolor-row"]',
        '[data-field="dh-patc"]', '[data-dhp-palette-target="patcolor"]');
    check('Pie and donut pattern color uses the same current-color then swatches layout',
        !!g && g.resetActions === 0 && g.followsCurrent &&
        g.paletteLeft >= g.currentRight + 1 && g.centerDelta <= 3 &&
        g.swatchWidths.every(w => w < g.currentWidth), JSON.stringify(g));
});

// RM Error bars: Method is part of Type, but retains its independent choices.
await withPage('rm_bar', async page => {
    await page.locator('[data-role="error-bar"] rect').first().click();
    await page.locator('[data-bs-tab="errorbars"]').click();
    await page.locator('[data-eb-btn="eb-type"]').click();
    const info = await page.evaluate(() => {
        const strip = document.querySelector('[data-eb-strip="eb-type"]');
        return {
            topMethodButton: document.querySelectorAll('[data-eb-btn="eb-method"]').length,
            topMethodStrip: document.querySelectorAll('[data-eb-strip="eb-method"]').length,
            types: [...(strip?.querySelectorAll('[data-eb-type]') || [])].map(b => b.getAttribute('data-eb-type')),
            methods: [...(strip?.querySelectorAll('[data-eb-method]') || [])].map(b => b.getAttribute('data-eb-method')),
            methodHeading: [...(strip?.querySelectorAll('div') || [])].some(d => d.textContent.trim() === 'Method')
        };
    });
    check('RM Method has no separate top-level button or strip',
        info.topMethodButton === 0 && info.topMethodStrip === 0, JSON.stringify(info));
    // ci95c (comparison-adjusted) joined the list Aug 2026; it sits with
    // the other CI choices, before None.
    check('RM Type contains all type choices',
        JSON.stringify(info.types) === JSON.stringify(['se', 'sd', 'ci95', 'ci99', 'ci95c', 'none']), JSON.stringify(info.types));
    check('RM Type contains the two Method choices',
        info.methodHeading && JSON.stringify(info.methods) === JSON.stringify(['within', 'between']), JSON.stringify(info.methods));
});

// Dot plots: direct dot vocabulary, no nonsensical Match line action,
// and a compact 4 x 2 shape grid.
await withPage('cg_dot', async page => {
    await page.locator('[data-role="line-marker"]').first().locator('xpath=following-sibling::*[1]').click();
    const dotTabs = await page.locator('[data-ls-tab]').allTextContents();
    check('Compare Groups dot plot calls the marker tab Dots',
        dotTabs.includes('Dots') && !dotTabs.includes('Markers'), JSON.stringify(dotTabs));
    for (const shape of ['circleOpen', 'squareOpen', 'triangleOpen', 'diamondOpen']) {
        const clearance = await openMarkerErrorBarClearance(page, shape);
        check(`Compare Groups ${shape} keeps error bars outside the dot body`,
            clearance.checked > 0 && clearance.overlaps.length === 0 &&
            clearance.fills.length === 1 && clearance.fills[0] === 'none',
            JSON.stringify(clearance));
    }
    const horizontalClearance = await openMarkerErrorBarClearance(
        page, 'circleOpen', 'both', { chartOrientation: 'horizontal' });
    check('Horizontal Compare Groups dots also keep error bars outside open dots',
        horizontalClearance.checked > 0 && horizontalClearance.overlaps.length === 0,
        JSON.stringify(horizontalClearance));
});

await withPage('rm_dot', async page => {
    await page.locator('[data-role="line-marker"]').first().locator('xpath=following-sibling::*[1]').click();
    const dotTabs = await page.locator('[data-ls-tab]').allTextContents();
    check('RM dot plot calls the marker tab Dots',
        dotTabs.includes('Dots') && !dotTabs.includes('Markers'), JSON.stringify(dotTabs));
    await page.locator('[data-ls-tab="markers"]').click();
    await page.locator('[data-ls-btn="marker-color"]').click();
    check('RM dot Dots > Color omits Match line',
        await page.locator('[data-field="marker-color-match"]').count() === 0);
    await page.locator('[data-ls-btn="marker-shape"]').click();
    const geom = await shapeGeometry(page, '[data-preset-marker-shape]');
    check('Marker shape menu is a compact 4 x 2 grid', !!geom && geom.count === 8 &&
        JSON.stringify(geom.rowCounts) === JSON.stringify([4, 4]) && geom.width <= 277 && !geom.overflow,
        JSON.stringify(geom));
    check('Open marker shapes have distinct accessible names', !!geom &&
        geom.names.slice(4).every(name => /open/i.test(name)), JSON.stringify(geom?.names));
    await page.locator('[data-ls-tab="order"]').click();
    const order = await page.evaluate(() => ({
        sort: document.querySelectorAll('[data-field="cat-sort"], [data-role="sort-asc"], [data-role="sort-desc"]').length,
        rows: document.querySelectorAll('[data-field="cat-order"] > [data-cat]').length,
        up: document.querySelectorAll('[data-field="cat-order"] [data-role="up"]').length,
        down: document.querySelectorAll('[data-field="cat-order"] [data-role="down"]').length
    }));
    check('Order retains manual rows and arrows without value sort',
        order.sort === 0 && order.rows > 1 && order.up === order.rows && order.down === order.rows,
        JSON.stringify(order));
});

// Canonical line-style menu: exact labels/order and a real long-dash preview.
await withPage('rm_line', async page => {
    // Open the shared line/marker panel through a marker's generous hit halo,
    // then move to the Line style tab.
    await page.locator('[data-role="line-marker"]').first().locator('xpath=following-sibling::*[1]').click();
    await page.locator('[data-ls-tab="line"]').click();
    await page.locator('[data-ls-btn="line-style"]').click();
    const styleInfo = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[data-preset-line-style]')];
        const strip = buttons[0]?.parentElement?.getBoundingClientRect();
        const last = buttons[buttons.length - 1]?.getBoundingClientRect();
        return {
            items: buttons.map(b => ({
                value: b.getAttribute('data-preset-line-style'),
                label: b.textContent.trim(),
                dash: b.querySelector('line')?.getAttribute('stroke-dasharray') || '',
                top: Math.round(b.getBoundingClientRect().top),
                width: b.getBoundingClientRect().width
            })),
            freeAfter: strip && last ? strip.right - last.right : 0
        };
    });
    const styles = styleInfo.items;
    check('Line Style uses the canonical four options',
        JSON.stringify(styles.map(s => [s.value, s.label])) === JSON.stringify([
            ['solid', 'Solid'], ['dashed', 'Dashed'], ['longdash', 'Long dash'], ['dotted', 'Dotted']
        ]), JSON.stringify(styles));
    check('Line Style stays compact, equal-width, and left-aligned', styles.length === 4 &&
        new Set(styles.map(s => s.top)).size === 1 &&
        Math.max(...styles.map(s => s.width)) - Math.min(...styles.map(s => s.width)) <= 1 &&
        styles.every(s => s.width >= 60 && s.width <= 65) && styleInfo.freeAfter >= 150,
        JSON.stringify({ items: styles.map(s => ({ top: s.top, width: s.width })),
            freeAfter: styleInfo.freeAfter }));
    check('Long dash preview uses the canonical dash pattern', styles[2]?.dash === '11,5', styles[2]?.dash || 'missing');

    for (const shape of ['circleOpen', 'squareOpen', 'triangleOpen', 'diamondOpen']) {
        const clearance = await openMarkerErrorBarClearance(page, shape);
        check(`RM line ${shape} keeps error bars outside the marker body`,
            clearance.checked > 0 && clearance.overlaps.length === 0 &&
            clearance.fills.length === 1 && clearance.fills[0] === 'none',
            JSON.stringify(clearance));
    }
    for (const direction of ['above', 'below']) {
        const clearance = await openMarkerErrorBarClearance(page, 'circleOpen', direction);
        check(`RM line one-sided ${direction} error bars stop at open markers`,
            clearance.checked > 0 && clearance.overlaps.length === 0,
            JSON.stringify(clearance));
    }
});

// Correlation matrix: manual-order arrows belong beside the variable names,
// not at the far edge of the lower panel.
await withPage('corr_heat', async page => {
    await page.locator('[data-role="corr-cell"]').first().click({ position: { x: 2, y: 2 } });
    await page.locator('[data-xytab="order"]').click();
    const geom = await page.evaluate(() => {
        const box = document.querySelector('[data-field="cv-order"]');
        const panel = box?.closest('.gb2-panel') || box?.parentElement;
        const panelRect = panel?.getBoundingClientRect();
        const rows = [...(box?.children || [])].map(row => {
            const label = row.querySelector('[data-order-label]')?.getBoundingClientRect();
            const up = row.querySelector('[data-role="up"]')?.getBoundingClientRect();
            const down = row.querySelector('[data-role="down"]')?.getBoundingClientRect();
            return {
                labelWidth: label?.width || 0,
                labelToUp: (up?.left || 0) - (label?.right || 0),
                upLeft: up?.left || 0,
                panelSpaceAfter: (panelRect?.right || 0) - (down?.right || 0)
            };
        });
        return {
            rows,
            overflow: !!box && box.scrollWidth > box.clientWidth + 1
        };
    });
    check('Correlation Order keeps arrows aligned beside variable labels',
        geom.rows.length > 1 &&
        geom.rows.every(r => r.labelWidth >= 64 && r.labelWidth <= 220 && Math.abs(r.labelToUp - 6) <= 1) &&
        Math.max(...geom.rows.map(r => r.upLeft)) - Math.min(...geom.rows.map(r => r.upLeft)) <= 1 &&
        geom.rows.every(r => r.panelSpaceAfter >= 80) && !geom.overflow,
        JSON.stringify(geom));

    const before = await page.locator('[data-order-label]').allTextContents();
    await page.locator('[data-field="cv-order"] > [data-var]').first().locator('[data-role="down"]').click();
    await page.waitForTimeout(80);
    const after = await page.locator('[data-order-label]').allTextContents();
    check('Correlation Order arrows still reorder variables', before.length > 1 &&
        after[0] === before[1] && after[1] === before[0], JSON.stringify({ before, after }));
});

// Scatter tile heatmap: distinguish editable ramps from ready-made presets,
// and keep the docked picker alive across the authoritative Jamovi echo.
await withPage('xy_heatmap', async page => {
    await page.locator('[data-role="xy-bin"]').first().click();
    await page.locator('[data-xb-btn="color"]').click();
    const layout = await page.evaluate(() => ({
        headings: [...document.querySelectorAll('[data-xb-section-label]')].map(e => e.textContent.trim()),
        modes: [...document.querySelectorAll('[data-xb-palette-row="ramps"] [data-xb-palette]')].map(e => e.textContent.trim()),
        presets: document.querySelectorAll('[data-xb-palette-row="presets"] [data-xb-palette]').length,
        editors: [...document.querySelectorAll('[data-xb-editor]')].map(e => ({
            name: e.getAttribute('data-xb-editor'), visible: e.offsetParent !== null,
            text: e.textContent.replace(/\s+/g, ' ').trim()
        })),
        picker: document.querySelector('[data-role="color-picker"]')?.offsetParent !== null
    }));
    check('Heatmap Color separates Ramps from Presets',
        JSON.stringify(layout.headings) === JSON.stringify(['Ramps', 'Presets']) &&
        JSON.stringify(layout.modes) === JSON.stringify(['Opacity ramp', 'Custom ramp']) &&
        layout.presets === 10, JSON.stringify(layout));
    check('Heatmap manual editors are compact, labeled, and always visible',
        layout.editors.length === 2 && layout.editors.every(e => e.visible) &&
        layout.editors[0].text === 'Color' && layout.editors[1].text === 'LowMidHigh',
        JSON.stringify(layout.editors));
    check('Heatmap Color opens the docked picker', layout.picker);

    await page.locator('[data-xb-palette="viridis"]').click();
    const beforeWidth = await page.locator('.gb2-panel').evaluate(e => e.getBoundingClientRect().width);
    // The static verification page has no Jamovi server to echo the option,
    // so replay its embedded payload through the public renderer. This is the
    // same authoritative rebuild that used to hide the picker ~1.5 s later.
    await page.evaluate(() => {
        // Scan ALL script tags: the widget's diag primer (Jul 2026)
        // sits in front of the payload-carrying loader script.
        const marker = 'var __gb2_payload = ';
        const script = [...document.querySelectorAll('script')]
            .map(el => el.textContent || '')
            .find(text => text.includes(marker)) || '';
        const start = script.indexOf(marker) + marker.length;
        const end = script.indexOf(';\nvar __gb2_id =', start);
        if (start < marker.length || end < 0) throw new Error('Embedded GraphBuilder payload not found');
        const payload = JSON.parse(script.slice(start, end));
        payload.xyBinPalette = 'viridis';
        const id = document.querySelector('.graphbuilder2-host')?.id;
        window.GraphBuilder2.render(id, payload);
    });
    await page.waitForTimeout(120);
    const echoed = await page.evaluate(() => ({
        picker: document.querySelector('[data-role="color-picker"]')?.offsetParent !== null,
        preset: document.querySelector('[data-xb-palette="viridis"]')?.getAttribute('aria-pressed'),
        editors: [...document.querySelectorAll('[data-xb-editor]')].every(e => e.offsetParent !== null),
        width: document.querySelector('.gb2-panel')?.getBoundingClientRect().width || 0
    }));
    check('Heatmap preset echo keeps the picker and manual editors mounted',
        echoed.picker && echoed.preset === 'true' && echoed.editors, JSON.stringify(echoed));
    check('Heatmap preset echo does not resize the panel', Math.abs(echoed.width - beforeWidth) <= 1,
        `${beforeWidth}px -> ${echoed.width}px`);

    await page.locator('[data-xb-custom="mid"]').click();
    check('Clicking Mid activates the custom ramp',
        await page.locator('[data-xb-palette="custom"]').getAttribute('aria-pressed') === 'true');
    await page.locator('[data-xb-palette="viridis"]').click();
    await page.locator('[data-field="xb-color-swatch"]').click();
    check('Clicking Color activates the opacity ramp',
        await page.locator('[data-xb-palette="single"]').getAttribute('aria-pressed') === 'true');
});

await browser.close();
if (fails) {
    console.error(`\nCONTROL-CONSISTENCY-CHECK: ${fails} failure(s)`);
    process.exit(1);
}
console.log('\nCONTROL-CONSISTENCY-CHECK: ALL CHECKS PASSED');
