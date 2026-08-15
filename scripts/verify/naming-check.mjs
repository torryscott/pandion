// Lower-panel naming and compact-width regression checks.
// Exercises the live click routes rather than inspecting source strings.
import { createRequire } from 'node:module';
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
const browser = await chromium.launch();
let fails = 0;
const ok = (label, pass, detail = '') => {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) fails++;
};

async function withPage(file, fn) {
    const ctx = await browser.newContext({ viewport: { width: 720, height: 1100 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('PAGEERR ' + file + ': ' + e.message); fails++; });
    await page.goto('file://' + path.join(OUT, file + '.html'));
    await page.waitForSelector('svg', { timeout: 10000 });
    await fn(page);
    await ctx.close();
}

async function clickFirst(page, selector) {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'attached', timeout: 8000 });
    await loc.scrollIntoViewIfNeeded();
    await loc.dispatchEvent('click');
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
}

async function clickPointHalo(page) {
    await page.locator('[data-role="dist-qq-point"]').first().waitFor({ state: 'attached', timeout: 8000 });
    await page.evaluate(() => {
        const point = document.querySelector('[data-role="dist-qq-point"]');
        const target = point?.nextElementSibling || point;
        target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
}

async function clickScatterPointHalo(page) {
    await page.locator('[data-role="xy-point"]').first().waitFor({ state: 'attached', timeout: 8000 });
    await page.evaluate(() => {
        const point = document.querySelector('[data-role="xy-point"]');
        const halo = point?.nextElementSibling;
        if (!halo) throw new Error('Scatter-point halo not found');
        halo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
}

async function clickVisibleFill(page, selector) {
    const point = await page.locator(selector).first().evaluate(el => {
        const r = el.getBoundingClientRect();
        for (let y = r.top + 2; y < r.bottom - 1; y += 3) {
            for (let x = r.left + 2; x < r.right - 1; x += 3) {
                if (document.elementFromPoint(x, y) === el)
                    return { x: x - r.left, y: y - r.top };
            }
        }
        return null;
    });
    if (!point) throw new Error(`No hit-tested point found for ${selector}`);
    await page.locator(selector).first().click({ position: point });
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
}

async function crumb(page) {
    return page.evaluate(() => {
        const c = document.querySelector('[data-role="gb2-crumb"]');
        const s = c ? [...c.children] : [];
        return { eyebrow: s[0]?.textContent.trim() || '', title: s[1]?.textContent.trim() || '' };
    });
}

async function tabs(page, selector = '[data-xytab]') {
    return page.locator(selector).allTextContents().then(xs => xs.map(x => x.replace(/\s+/g, ' ').trim()));
}

async function checkCompact(page, tabSelector, label) {
    const m = await page.evaluate((sel) => {
        const first = document.querySelector(sel);
        const panel = document.querySelector('.gb2-panel');
        const strip = first?.parentElement;
        if (!panel || !strip) return null;
        panel.style.width = '560px';
        panel.style.minWidth = '560px';
        const pr = panel.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        const buttons = [...document.querySelectorAll(sel)];
        const rows = new Set(buttons.map(b => Math.round(b.getBoundingClientRect().top))).size;
        const title = panel.querySelector('[data-role="inspector-title"]');
        const tr = title?.getBoundingClientRect();
        const titleFits = !tr || [...title.children].filter(el => getComputedStyle(el).display !== 'none')
            .every(el => {
                const r = el.getBoundingClientRect();
                return r.left >= tr.left - 1 && r.right <= tr.right + 1;
            });
        return { panelW: pr.width, stripRight: sr.right, panelRight: pr.right,
            panelScrollW: panel.scrollWidth, panelClientW: panel.clientWidth,
            scrollW: strip.scrollWidth, clientW: strip.clientWidth, rows,
            buttonsFit: buttons.every(b => b.scrollWidth <= b.clientWidth + 1), titleFits };
    }, tabSelector);
    ok(label + ' panel is laptop-width', !!m && Math.abs(m.panelW - 560) <= 1,
        m ? Math.round(m.panelW) + 'px' : 'missing');
    ok(label + ' tabs do not overflow', !!m && m.stripRight <= m.panelRight + 1 &&
        m.scrollW <= m.clientW + 1 && m.panelScrollW <= m.panelClientW + 1,
        m ? `${m.scrollW}/${m.clientW}px; panel ${m.panelScrollW}/${m.panelClientW}px` : 'missing');
    ok(label + ' tabs stay on one unclipped row', !!m && m.rows === 1 && m.buttonsFit,
        m ? `${m.rows} row(s)` : 'missing');
    ok(label + ' title stays inside its header', !!m && m.titleFits);
}

await withPage('dist_hist', async page => {
    await clickFirst(page, '[data-role="dist-hist-bar"]');
    const c = await crumb(page), t = await tabs(page);
    ok('Histogram context', c.eyebrow === 'Histogram', JSON.stringify(c));
    ok('Histogram tabs', JSON.stringify(t) === JSON.stringify(['Bars', 'Border', 'Bins & display', 'Order']), JSON.stringify(t));
    await page.locator('[data-xytab="hist"]').click();
    ok('Histogram title follows Bins & display', (await crumb(page)).title === 'Bins & display');
});

await withPage('dist_density', async page => {
    await clickFirst(page, '[data-role="dist-density-line"]');
    const c = await crumb(page), t = await tabs(page);
    ok('Density plot context', c.eyebrow === 'Density plot', JSON.stringify(c));
    ok('Density tabs use Smoothing', t.includes('Smoothing') && !t.includes('Density'), JSON.stringify(t));
    await page.locator('[data-xytab="density"]').click();
    ok('Density title follows Smoothing', (await crumb(page)).title === 'Smoothing');
});

await withPage('dist_histdensity', async page => {
    await clickFirst(page, '[data-role="dist-hist-bar"]');
    ok('Hybrid bar context', (await crumb(page)).eyebrow === 'Histogram bars');
    await clickFirst(page, '[data-role="dist-density-line"]');
    const c = await crumb(page), t = await tabs(page);
    ok('Hybrid curve context', c.eyebrow === 'Density curve', JSON.stringify(c));
    ok('Hybrid curve has no Fill tab', JSON.stringify(t) === JSON.stringify(['Line', 'Smoothing', 'Order']), JSON.stringify(t));
});

await withPage('dist_qq_band', async page => {
    await clickPointHalo(page);
    const t = await tabs(page);
    ok('Q-Q tabs are explicit', JSON.stringify(t) === JSON.stringify(['Points', 'Point outline', 'Reference line']), JSON.stringify(t));
});

await withPage('dist_ecdf', async page => {
    await clickFirst(page, '[data-role="dist-ecdf-line"]');
    const t = await tabs(page);
    ok('ECDF tab describes its contents', t.includes('Steps & direction') && !t.includes('ECDF'), JSON.stringify(t));
});

await withPage('cg_violin', async page => {
    await clickVisibleFill(page, '[data-role="violin-fill"]');
    const t = await tabs(page, '[data-bs-tab]');
    ok('Violin compact vocabulary', t.includes('Fill') && t.includes('Shape') && t.includes('Inner box') && !t.includes('Density'), JSON.stringify(t));
    await page.locator('[data-bs-tab="density"]').click();
    const shapeTitle = (await crumb(page)).title;
    ok('Violin Shape uses the regular title separator', /^Shape - .+/.test(shapeTitle), shapeTitle);
    await checkCompact(page, '[data-bs-tab]', 'Violin');
});

await withPage('freq_pie', async page => {
    await clickFirst(page, '[data-role="freq-slice"]');
    const t = await tabs(page);
    ok('Pie tabs separate Fill and Labels', JSON.stringify(t.slice(0, 4)) === JSON.stringify(['Fill', 'Border', 'Labels', 'Layout']), JSON.stringify(t));
    ok('Units absent from Fill', await page.locator('[data-field="fqs-units"]').count() === 0);
    await page.locator('[data-xytab="labels"]').click();
    ok('Units live under Labels', await page.locator('[data-field="fqs-units"]').count() === 4);
    await checkCompact(page, '[data-xytab]', 'Pie');
});

await withPage('freq_bar_stack', async page => {
    await clickVisibleFill(page, 'svg path[data-bar-cat]:not([data-halo-for])');
    const labels = (await page.locator('[data-bs-tab-pane="bar"] [data-bs-btn]')
        .allTextContents()).map(x => x.replace(/\s+/g, ' ').trim());
    ok('Frequency bars combine Units and Arrange under Display',
        labels.filter(x => x === 'Display').length === 1 &&
        !labels.includes('Units') && !labels.includes('Arrange'),
        JSON.stringify(labels));
    await page.locator('[data-bs-btn="bar-freqdisplay"]').click();
    const combined = await page.evaluate(() => {
        const strip = document.querySelector('[data-bs-strip="bar-freqdisplay"]');
        return {
            visible: !!strip && getComputedStyle(strip).display !== 'none',
            sections: [...(strip?.querySelectorAll(
                '[data-field="bs-freq-display-height"], [data-field="bs-freq-display-layout"]') || [])]
                .map(el => el.textContent.replace(/\s+/g, ' ').trim()),
            units: strip?.querySelectorAll('[data-bs-freqstat]').length || 0,
            layouts: strip?.querySelectorAll('[data-bs-freqpos]').length || 0,
            band: strip?.querySelector('[data-role="stat-strip-label"]')?.textContent
                .replace(/\s+/g, ' ').trim() || ''
        };
    });
    ok('Display contains both Bar height and Group layout controls',
        combined.visible && combined.units === 3 && combined.layouts === 3 &&
        combined.sections[0]?.startsWith('Bar height') &&
        combined.sections[1]?.startsWith('Group layout'),
        JSON.stringify(combined));
    ok('Combined Display retains the statistical-change treatment',
        /bar heights and group comparison/i.test(combined.band), combined.band);
    await page.locator('[data-bs-freqstat="percent"]').click();
    await page.waitForTimeout(80);
    await page.locator('[data-bs-freqpos="dodge"]').click();
    await page.waitForTimeout(80);
    const changed = await page.evaluate(() => ({
        stat: window.gb2_undo?.getData?.().freqStat,
        position: window.gb2_undo?.getData?.().freqPosition,
        stripVisible: (() => {
            const strip = document.querySelector('[data-bs-strip="bar-freqdisplay"]');
            return !!strip && getComputedStyle(strip).display !== 'none';
        })()
    }));
    ok('Both combined Display rows remain live after local re-render',
        changed.stat === 'percent' && changed.position === 'dodge' && changed.stripVisible,
        JSON.stringify(changed));
});

await withPage('likert_div', async page => {
    await clickFirst(page, '[data-role="likert-seg"]');
    const t = await tabs(page);
    // t4-172 round 2 (Torry): the reorder tab is plain "Order" - "Custom
    // order" was the odd one out next to the bar and means panels.
    ok('Likert tabs distinguish fill/display/order', t.includes('Fill') && t.includes('Display') && t.includes('Order') && !t.includes('Custom order'), JSON.stringify(t));
});

await withPage('corr_heat', async page => {
    const cell = page.locator('[data-role="corr-cell"]').first();
    await cell.click({ position: { x: 2, y: 2 } });
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
    const t = await tabs(page);
    ok('Correlation cell tabs describe aspects', JSON.stringify(t) === JSON.stringify(['Appearance', 'Values', 'Display', 'Order']), JSON.stringify(t));
    await clickFirst(page, '[data-role="corr-legend"]');
    ok('Color-scale nested control says Layout', (await page.locator('[data-dist-btn="cslegend"]').textContent()).trim() === 'Layout');
    await page.locator('[title="Chart settings"]').click();
    ok('Correlation omits inert Palette tab', await page.locator('[data-gs-tab="palette"]').count() === 0);
});

await withPage('corr_heat', async page => {
    await clickFirst(page, '[data-role="corr-var-label"]');
    const c = await crumb(page);
    ok('Correlation variable title uses the regular separator', /^Variable label - .+/.test(c.title), c.title);
});

await withPage('xy_basic', async page => {
    await clickScatterPointHalo(page);
    ok('Scatter point tab says Marker', JSON.stringify(await tabs(page, '[data-ps-tab]')) === JSON.stringify(['Marker', 'Outline']));
    await page.locator('[aria-label="Add to chart"]').click();
    await page.locator('[data-kind="ovl_ellipse"]').click();
    await page.waitForSelector('[data-xytab="ellipses"]');
    const c = await crumb(page), t = await tabs(page);
    ok('Scatter overlay family is Point distribution', c.eyebrow.includes('Point distribution'), JSON.stringify(c));
    ok('Scatter overlay tabs are statistically exact', JSON.stringify(t) === JSON.stringify(['Data ellipses', 'Density contours']), JSON.stringify(t));
});

await withPage('xy_fit_ci', async page => {
    // The visible fit stroke deliberately ignores pointer events so a saved
    // width of 0 can remain visually absent. Exercise the wide transparent
    // hit path users actually click instead.
    await clickFirst(page, '[data-role="xy-fit-hit"]');
    const t = await tabs(page);
    ok('Regression tabs are self-contained', JSON.stringify(t) === JSON.stringify(['Fit line', 'Confidence band', 'Outliers']), JSON.stringify(t));
});

await browser.close();
if (fails) {
    console.error(`\nNAMING-CHECK: ${fails} failure(s)`);
    process.exit(1);
}
console.log('\nNAMING-CHECK: ALL CHECKS PASSED');
