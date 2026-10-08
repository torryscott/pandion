// Graph-aware "Find a setting" command-palette checks.
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

function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) fails++;
}

async function withPage(name, fn, viewport = { width: 720, height: 1100 }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(OUT, name + '.html'));
    await page.waitForSelector('[data-role="chart-toolbar"]', { timeout: 10000 });
    await fn(page);
    check(name + ' search has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

async function openSearch(page, query = '') {
    const menu = page.locator('[data-role="setting-search"]');
    if (!await menu.isVisible()) await page.locator('[data-role="setting-search-trigger"]').click();
    const input = page.locator('[data-role="setting-search-input"]');
    await input.fill(query);
    await page.waitForTimeout(20);
    return input;
}

async function ids(page) {
    return page.locator('[data-role="setting-search-result"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-setting-id')));
}

async function clickResult(page, id) {
    await page.locator(`[data-setting-id="${id}"]`).click();
    await page.waitForTimeout(70);
}

// Placement, semantics, fuzzy matching, and keyboard behavior.
await withPage('cg_bar_labels', async page => {
    const placement = await page.evaluate(() => {
        const toolbar = document.querySelector('[data-role="chart-toolbar"]');
        const buttons = [...toolbar.querySelectorAll('button')];
        const find = document.querySelector('[data-role="setting-search-trigger"]');
        const add = document.querySelector('[aria-label="Add to chart"]');
        return {
            findCount: document.querySelectorAll('[data-role="setting-search-trigger"]').length,
            sameParent: find?.parentElement === add?.parentElement,
            adjacent: buttons.indexOf(find) + 1 === buttons.indexOf(add),
            findLabel: find?.getAttribute('aria-label'),
            hasDialog: find?.getAttribute('aria-haspopup'),
            title: find?.getAttribute('title'),
            keyBadge: document.querySelector('[data-role="setting-search-shortcut"]')?.textContent
        };
    });
    check('Find sits immediately before Add', placement.findCount === 1 && placement.sameParent && placement.adjacent,
        JSON.stringify(placement));
    check('Find trigger has a concise accessible name', placement.findLabel === 'Find a setting' && placement.hasDialog === 'dialog',
        JSON.stringify(placement));
    check('Find advertises Ctrl/Cmd+F', placement.title === 'Find a setting (Ctrl/Cmd+F)' && /F$/.test(placement.keyBadge || ''),
        JSON.stringify(placement));

    const input = await openSearch(page, 'roundd bars');
    const fuzzy = await ids(page);
    check('Misspelled rounded-bars query finds Corner', fuzzy.includes('bar.corner'), JSON.stringify(fuzzy));
    check('Search is scoped away from other modules', !fuzzy.includes('dist.hist.bins') && !fuzzy.includes('freq.slice.rotation'), JSON.stringify(fuzzy));
    check('Search input is an expanded combobox', await input.getAttribute('role') === 'combobox' &&
        await input.getAttribute('aria-expanded') === 'true');

    await input.fill('color');
    await page.waitForTimeout(20);
    const before = await input.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    const after = await input.getAttribute('aria-activedescendant');
    check('Arrow keys move the active result', !!before && !!after && before !== after, `${before} -> ${after}`);
    check('Exactly one result is selected', await page.locator('[role="option"][aria-selected="true"]').count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    check('Escape closes Find and returns focus', !await page.locator('[data-role="setting-search"]').isVisible() &&
        await page.evaluate(() => document.activeElement?.getAttribute('data-role')) === 'setting-search-trigger');

    await page.keyboard.press('Control+F');
    await page.waitForTimeout(20);
    check('Ctrl+F opens Find and focuses its input', await page.locator('[data-role="setting-search"]').isVisible() &&
        await page.evaluate(() => document.activeElement?.getAttribute('data-role')) === 'setting-search-input');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    await page.keyboard.press('Meta+F');
    await page.waitForTimeout(20);
    check('Cmd+F also opens Find', await page.locator('[data-role="setting-search"]').isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(20);
    check('Ctrl+K no longer opens Find', !await page.locator('[data-role="setting-search"]').isVisible());

    const undoBefore = await page.evaluate(() => window.gb2_undo?.stack?.length || 0);
    await openSearch(page, 'rounded bars');
    await clickResult(page, 'bar.corner');
    const routed = await page.evaluate(() => ({
        panel: getComputedStyle(document.querySelector('.gb2-panel')).display !== 'none',
        tab: document.querySelector('[data-bs-tab="bar"]')?.style.background,
        strip: getComputedStyle(document.querySelector('[data-bs-strip="bar-corner"]')).display,
        field: !!document.querySelector('[data-field="corner-radius"]'),
        searchOpen: getComputedStyle(document.querySelector('[data-role="setting-search"]')).display !== 'none'
    }));
    check('Corner result opens the Bar > Corner destination', routed.panel && routed.field && routed.strip !== 'none' && !routed.searchOpen,
        JSON.stringify(routed));
    check('Navigation does not create an undo step', await page.evaluate(() => window.gb2_undo?.stack?.length || 0) === undoBefore);

    // Same-selection reroute: both destinations use bars:<group>, so this
    // catches a short-circuit that would leave the old tab/strip open.
    await openSearch(page, 'border width');
    await clickResult(page, 'bar.border.width');
    check('Search reroutes within an already-open panel', await page.locator('[data-bs-tab="border"]').count() === 1 &&
        await page.locator('[data-bs-strip="border-width"]').isVisible() &&
        await page.locator('[data-field="border-width"]').isVisible());
});

const scoped = [
    ['dist_hist', 'bin count', 'dist.hist.bins', ['freq.slice.rotation']],
    ['freq_pie', 'rotate slices', 'freq.slice.rotation', ['dist.density.bandwidth']],
    ['corr_heat', 'tile spacing', 'corr.cell.gap', ['dist.hist.bins']],
    ['xy_fit_ci', 'confidence shading', 'scatter.fit.ciOpacity', ['freq.slice.rotation']],
    ['likert_div', 'space between rows', 'likert.rowGap', ['dist.density.bandwidth']]
];
for (const [fixture, query, wanted, excluded] of scoped) {
    await withPage(fixture, async page => {
        await openSearch(page, query);
        const found = await ids(page);
        check(`${fixture} finds ${wanted}`, found.includes(wanted), JSON.stringify(found));
        check(`${fixture} excludes unrelated destinations`, excluded.every(id => !found.includes(id)), JSON.stringify(found));
    });
}

// Statistical-intent aliases route to the Statistics surface users mean,
// without silently choosing a test or changing an analysis option.
await withPage('cg_bar_labels', async page => {
    const undoBefore = await page.evaluate(() => window.gb2_undo?.stack?.length || 0);
    await openSearch(page, 't test');
    let found = await ids(page);
    check('T test ranks Compare pairs first in Compare Groups',
        found[0] === 'stats.comparePairs', JSON.stringify(found));
    await clickResult(page, 'stats.comparePairs');
    check('T test opens Statistics > Compare pairs > Test',
        await page.locator('[data-st-pane="pairs"]').isVisible() &&
        await page.locator('[data-cmp-test]').isVisible() &&
        await page.locator('[data-cmp-test][data-setting-search-target="true"]').count() === 1);
    check('T test navigation keeps Auto selected', await page.locator('[data-cmp-test]').inputValue() === 'auto');

    await openSearch(page, 'anova');
    found = await ids(page);
    check('ANOVA finds the Omnibus destination', found[0] === 'stats.omnibus', JSON.stringify(found));
    await clickResult(page, 'stats.omnibus');
    check('ANOVA opens Statistics > Omnibus', await page.locator('[data-st-pane="omnibus"]').isVisible());

    await openSearch(page, 'standard deviation');
    found = await ids(page);
    check('Standard deviation finds Descriptives', found[0] === 'stats.descriptives', JSON.stringify(found));
    await clickResult(page, 'stats.descriptives');
    check('Standard deviation opens Statistics > Descriptives', await page.locator('[data-st-pane="desc"]').isVisible());

    await openSearch(page, 'post hoc');
    found = await ids(page);
    check('Post hoc exposes multiplicity correction', found.includes('stats.pCorrection'), JSON.stringify(found));
    check('Statistics navigation creates no undo steps',
        await page.evaluate(() => window.gb2_undo?.stack?.length || 0) === undoBefore);
});

await withPage('rm_line', async page => {
    await openSearch(page, 'paired t test');
    const found = await ids(page);
    check('Paired t test ranks Compare pairs first in Repeated Measures',
        found[0] === 'stats.comparePairs', JSON.stringify(found));
    await clickResult(page, 'stats.comparePairs');
    check('Paired t test opens the RM Test control without selecting it',
        await page.locator('[data-st-pane="pairs"]').isVisible() &&
        await page.locator('[data-cmp-test]').inputValue() === 'auto');
});

await withPage('freq_bar_stack', async page => {
    await openSearch(page, 'chi square');
    let found = await ids(page);
    check('Chi square ranks the Statistics test first',
        found[0] === 'stats.freq.chisq', JSON.stringify(found));
    await clickResult(page, 'stats.freq.chisq');
    check('Chi square opens Statistics > Chi-square', await page.locator('[data-st-pane="chisq"]').isVisible());

    await openSearch(page, 'two proportion z test');
    found = await ids(page);
    check('Two-proportion z test finds Pairwise proportions',
        found[0] === 'stats.freq.pairwise', JSON.stringify(found));
    await clickResult(page, 'stats.freq.pairwise');
    check('Two-proportion z test opens Statistics > Pairwise',
        await page.locator('[data-st-pane="pairwise"]').isVisible());
});

await withPage('dist_hist', async page => {
    await openSearch(page, 'shaprio wilk');
    let found = await ids(page);
    check('Misspelled Shapiro-Wilk finds Normality',
        found[0] === 'stats.dist.normality', JSON.stringify(found));
    await clickResult(page, 'stats.dist.normality');
    check('Shapiro-Wilk opens Statistics > Normality',
        await page.locator('[data-st-pane="normality"]').isVisible());

    await openSearch(page, 'skewness');
    found = await ids(page);
    check('Skewness finds Distribution descriptives',
        found[0] === 'stats.dist.descriptives', JSON.stringify(found));
    await clickResult(page, 'stats.dist.descriptives');
    check('Skewness opens Statistics > Descriptives', await page.locator('[data-st-pane="desc"]').isVisible());
});

await withPage('xy_fit_ci', async page => {
    await openSearch(page, 'spearman rho');
    const found = await ids(page);
    check('Spearman rho finds the Scatter correlation method',
        found[0] === 'stats.scatter.correlation', JSON.stringify(found));
    await clickResult(page, 'stats.scatter.correlation');
    check('Spearman navigation highlights Method without changing Pearson',
        await page.locator('[data-st-act="xymethod"][data-setting-search-target="true"]').count() === 1 &&
        await page.locator('[data-st-act="xymethod"]').inputValue() === 'pearson');
});

await withPage('corr_heat', async page => {
    await openSearch(page, 'false discovery rate');
    const found = await ids(page);
    check('False discovery rate finds correlation p adjustment',
        found[0] === 'stats.corr.adjust', JSON.stringify(found));
    await clickResult(page, 'stats.corr.adjust');
    check('FDR navigation highlights Adjust p without changing it',
        await page.locator('[data-st-act="corrpadj"][data-setting-search-target="true"]').count() === 1 &&
        await page.locator('[data-st-act="corrpadj"]').inputValue() === 'none');
});

await withPage('likert_div', async page => {
    await openSearch(page, 'cronbach alpha');
    const found = await ids(page);
    check('Cronbach alpha ranks Reliability first',
        found[0] === 'stats.likert.reliability', JSON.stringify(found));
    await clickResult(page, 'stats.likert.reliability');
    check('Cronbach alpha opens Statistics > Reliability',
        await page.locator('[data-st-pane="alpha"]').isVisible());
});

await withPage('dist_hist', async page => {
    await openSearch(page, 'bin count');
    await clickResult(page, 'dist.hist.bins');
    check('Histogram Bins result opens Bins & display', await page.locator('[data-xytab="hist"]').count() === 1 &&
        await page.locator('[data-field="dh-bins"]').isVisible());
});

await withPage('freq_bar_stack', async page => {
    await openSearch(page, 'bar height');
    check('Frequency bar search finds Bar height', (await ids(page)).includes('freq.bar.units'));
    await clickResult(page, 'freq.bar.units');
    check('Bar height opens the combined Display surface',
        await page.locator('[data-bs-btn="bar-freqdisplay"]').count() === 1 &&
        await page.locator('[data-bs-strip="bar-freqdisplay"]').isVisible() &&
        await page.locator('[data-field="bs-freq-display-height"]').isVisible());
    await openSearch(page, 'group layout');
    check('Frequency bar search finds Group layout', (await ids(page)).includes('freq.bar.arrange'));
    await clickResult(page, 'freq.bar.arrange');
    check('Group layout reroutes to the same combined Display surface',
        await page.locator('[data-bs-strip="bar-freqdisplay"]').isVisible() &&
        await page.locator('[data-field="bs-freq-display-layout"]').isVisible());

    // The old on-chart chi-square plate is retired, but its calculations
    // remain available in the Statistics panel.
    check('Frequency chart has no chi-square plot annotation',
        await page.locator('[data-role="freq-chisq-group"]').count() === 0);
    await page.locator('[aria-label="Add to chart"]').click();
    check('Add menu has no chi-square plot item',
        await page.locator('[data-role="add-ann-menu"] [data-kind="freqChisq"]').count() === 0);
    await page.keyboard.press('Escape');
    await openSearch(page, 'chi square');
    const chiRoutes = await ids(page);
    check('Search has no retired chi-square plot destination',
        !chiRoutes.includes('freq.chisq') && !chiRoutes.includes('add.chisq'), JSON.stringify(chiRoutes));
    await page.keyboard.press('Escape');
    await page.locator('[title="Statistics"]').click();
    check('Statistics retains the Chi-square section',
        await page.locator('[data-st-tab="chisq"]').count() === 1 &&
        await page.locator('[data-st-pane="chisq"]').count() === 1);
});

await withPage('freq_pie', async page => {
    await openSearch(page, 'add data points');
    check('Frequency pie omits unavailable Data points', !(await ids(page)).includes('add.dataPoints'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(20);
    await openSearch(page, 'rotate slices');
    await clickResult(page, 'freq.slice.rotation');
    check('Pie Rotation result opens the rotation strip', await page.locator('[data-xytab="pie"]').count() === 1 &&
        await page.locator('[data-dist-strip="fqrot"]').isVisible() && await page.locator('[data-field="fq-rot"]').isVisible());
});

await withPage('xy_fit_ci', async page => {
    await openSearch(page, 'confidence shading');
    await clickResult(page, 'scatter.fit.ciOpacity');
    check('Confidence shading opens CI > Opacity', await page.locator('[data-xytab="ci"]').count() === 1 &&
        await page.locator('[data-fl-tab-pane="ci"]').isVisible() &&
        await page.locator('[data-fl-strip="ciOpacity"]').isVisible() &&
        await page.locator('[data-field="f-ci-opacity"]').isVisible());
});

await withPage('corr_heat', async page => {
    await openSearch(page, 'tile spacing');
    await clickResult(page, 'corr.cell.gap');
    check('Correlation spacing opens Appearance > Gap', await page.locator('[data-xytab="cells"]').count() === 1 &&
        await page.locator('[data-dist-strip="crgap"]').isVisible() && await page.locator('[data-field="cr-gap"]').isVisible());
});

await withPage('likert_div', async page => {
    await openSearch(page, 'space between rows');
    await clickResult(page, 'likert.rowGap');
    check('Likert row spacing opens Display > Row gap', await page.locator('[data-xytab="bars"]').count() === 1 &&
        await page.locator('[data-dist-strip="lkrowgap"]').isVisible() && await page.locator('[data-field="lk-rowgap"]').isVisible());
});

// Add results reveal the existing Add menu but do not activate the feature.
await withPage('xy_fit_ci', async page => {
    await openSearch(page, 'add text annotation');
    const before = await page.locator('[data-role="chart-text-annotation"]').count();
    await clickResult(page, 'add.text');
    const add = page.locator('[data-role="add-ann-menu"]');
    check('Add search result opens the Add menu', await add.isVisible());
    check('Add search result does not create the item', await page.locator('[data-role="chart-text-annotation"]').count() === before);
    check('Requested Add item is highlighted', await add.locator('[data-kind="text"][data-setting-search-target="true"]').count() === 1);
});

// Laptop-width geometry: no new horizontal scrolling or toolbar collision.
await withPage('rm_crossed', async page => {
    const before = await page.evaluate(() => document.documentElement.scrollWidth);
    await openSearch(page, 'color');
    const geometry = await page.evaluate(() => {
        const tb = document.querySelector('[data-role="chart-toolbar"]');
        const make = tb.querySelector('[data-role="toolbar-make"]');
        const actions = tb.querySelector('[data-role="toolbar-actions"]');
        const find = document.querySelector('[data-role="setting-search-trigger"]').getBoundingClientRect();
        const add = document.querySelector('[aria-label="Add to chart"]').getBoundingClientRect();
        const menu = document.querySelector('[data-role="setting-search"]').getBoundingClientRect();
        const tbRect = tb.getBoundingClientRect();
        const buttonRects = [...tb.querySelectorAll('button')].map(button => button.getBoundingClientRect());
        return {
            toolbarOverflow: tb.scrollWidth > tb.clientWidth + 1,
            allButtonsVisible: buttonRects.every(rect => rect.width > 0 && rect.height > 0 &&
                rect.left >= Math.max(0, tbRect.left) - 1 &&
                rect.right <= Math.min(window.innerWidth, tbRect.right) + 1),
            makeTop: make.getBoundingClientRect().top,
            actionsTop: actions.getBoundingClientRect().top,
            overlap: !(find.right <= add.left || add.right <= find.left),
            menuLeft: menu.left,
            menuRight: menu.right,
            viewport: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth
        };
    });
    check('Find does not collide with Add at laptop width', !geometry.overlap, JSON.stringify(geometry));
    check('Narrow toolbar keeps every button inside the accessible width',
        !geometry.toolbarOverflow && geometry.allButtonsVisible, JSON.stringify(geometry));
    check('Narrow toolbar stacks stable control zones instead of overflowing left',
        geometry.actionsTop > geometry.makeTop, JSON.stringify(geometry));
    check('Find menu stays inside the viewport', geometry.menuLeft >= 0 && geometry.menuRight <= geometry.viewport + 1,
        JSON.stringify(geometry));
    check('Find does not add horizontal document overflow', geometry.scrollWidth <= before + 1, JSON.stringify(geometry));
}, { width: 560, height: 1100 });

await browser.close();
if (fails) {
    console.error(`\n${fails} setting-search check(s) failed`);
    process.exit(1);
}
console.log('\nAll setting-search checks passed.');
