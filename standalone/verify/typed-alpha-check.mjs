// A typed significance level on the correlation matrix (Oct 7 2026, option A
// per Torry, for a colleague's Bonferroni-adjusted .0056). The Values tab's
// Alpha row takes a typed number beside its presets. What must hold:
//   - a typed level commits like a preset and drives the fade treatment
//   - the stars keep their fixed .05 / .01 / .001 ladder, gated as they
//     always were on the chart's level: no star on a cell that fails it
//   - the Statistics panel's Alpha select shows the typed level as its own
//     option, and its tally counts pairs against it
//   - a preset click afterwards clears the field
// Control: against the engine before this change the field does not exist,
// so case 1 fails.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++; console.log('  FAIL  ' + msg); return;
    }
    console.log('  ok  ' + msg);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// The click-to-edit coach mark sits over the matrix's first cells; the
// probe is past that lesson.
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
// Five numeric columns with a spread of correlations, so the pairs' p values
// land on both sides of any level the probe picks.
await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    let a = 2; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const g = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const rows = [];
    for (let i = 0; i < 40; i++) {
        const base = g(), b2 = g();
        rows.push([(base).toFixed(3), (0.4 * base + 0.9 * g()).toFixed(3), (0.32 * base + g()).toFixed(3), (0.3 * b2 + 0.28 * base + g()).toFixed(3), (b2 + 0.15 * base).toFixed(3)]);
    }
    window.PS_SHELL.loadTable('corr', ['v1', 'v2', 'v3', 'v4', 'v5'], rows, null, null);
    await w(700);
    window.PS_SHELL.setModule('corrplotbuilder'); await w(250);
    window.PS_SHELL.setRoles('corrplotbuilder', { vars: ['v1', 'v2', 'v3', 'v4', 'v5'] }); await w(1600);
});
const pairs = await page.evaluate(() => window.PS_SHELL.buildPayload().corrCells
    .filter(c => c.a !== c.b && typeof c.p === 'number').map(c => ({ a: c.a, b: c.b, p: c.p })));
const ps = pairs.map(c => c.p).sort((x, y) => x - y);
ok(pairs.length === 10 && ps[1] < ps[2], 'setup: ten pairs with distinct p values (' + ps.map(p => p.toFixed(4)).join(', ') + ')');
// A level strictly between the second and third smallest p: exactly two
// pairs are significant at it, and it is none of the presets.
const alpha = Number(((ps[1] + ps[2]) / 2).toPrecision(2));
const sigAt = a => pairs.filter(c => c.p < a).length;
ok([0.1, 0.05, 0.01, 0.001].indexOf(alpha) < 0 && sigAt(alpha) === 2, 'the probe picks a typed level of ' + alpha + ' (' + sigAt(alpha) + ' pairs below it, ' + sigAt(0.05) + ' below .05)');

// Open the cell panel with a corner click (a centre click lands on the value text).
const openPanel = async () => {
    const pt = await page.evaluate(() => {
        const g = Array.from(document.querySelectorAll('[data-role="corr-cell-g"]')).find(x => x.getAttribute('data-a') !== x.getAttribute('data-b'));
        const r = g.querySelector('[data-role="corr-cell"]').getBoundingClientRect();
        return { x: r.x + r.width * 0.12, y: r.y + r.height * 0.15 };
    });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(400);
};
const clickTab = async id => {
    await page.evaluate(id => { const b = Array.from(document.querySelectorAll('[data-xytab]')).find(x => x.getAttribute('data-xytab') === id); if (b) b.click(); }, id);
    await page.waitForTimeout(300);
};
const spec = () => page.evaluate(() => { try { return JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}'); } catch (e) { return {}; } });

console.log('case 1: the Values tab takes a typed level and commits it');
await openPanel();
await clickTab('values');
await page.evaluate(() => { const c = document.querySelector('[data-field="cr-stars"]'); if (c && !c.checked) c.click(); });
await page.waitForTimeout(400);
await clickTab('layout');
await page.evaluate(() => { const b = Array.from(document.querySelectorAll('[data-field="cr-treat"]')).find(x => x.getAttribute('data-val') === 'fade'); if (b) b.click(); });
await page.waitForTimeout(400);
await clickTab('values');
const field = await page.evaluate(() => { const f = document.querySelector('[data-field="cr-alpha-num"]'); return f ? { present: true, visible: !!f.offsetParent, value: f.value, placeholder: f.placeholder } : { present: false }; });
ok(field.present && field.visible, 'the Alpha row has a typed field (' + JSON.stringify(field) + ')');
await page.fill('[data-field="cr-alpha-num"]', String(alpha));
await page.keyboard.press('Enter');
// The engine flushes option commits after its own debounce; wait it out.
await page.waitForTimeout(2600);
let sp = await spec();
ok(sp.corrSigLevel === alpha, 'the typed level is committed (corrSigLevel ' + sp.corrSigLevel + ')');
const presetsLit = await page.evaluate(() => Array.from(document.querySelectorAll('[data-field="cr-alpha"]')).filter(b => /font-weight:\s*(600|700|bold)/.test(b.style.cssText) || /background:\s*#?[0-9a-f]{3,6}/i.test(b.style.cssText) && !/background:\s*(#fff|white|transparent)/i.test(b.style.cssText)).length);
console.log('  --  preset buttons reading as active: ' + presetsLit);

console.log('case 2: the fade follows the typed level while the stars keep their ladder');
const cells = await page.evaluate(() => Array.from(document.querySelectorAll('[data-role="corr-cell-g"]')).map(g => {
    const rect = g.querySelector('rect'); const text = g.querySelector('text');
    return { a: g.getAttribute('data-a'), b: g.getAttribute('data-b'), opacity: rect ? Number(rect.getAttribute('fill-opacity') || 1) : null, text: text ? text.textContent : '' };
}));
let fadeRight = 0, fadeWrong = [], starsRight = 0, starsWrong = [];
for (const c of cells) {
    const pr = pairs.find(p => (p.a === c.a && p.b === c.b) || (p.a === c.b && p.b === c.a));
    if (!pr) continue;
    const sig = pr.p < alpha;
    const faded = c.opacity !== null && c.opacity < 0.5;
    if (sig === !faded) fadeRight++; else fadeWrong.push(c.a + 'x' + c.b + ' p=' + pr.p.toFixed(4) + ' opacity=' + c.opacity);
    const stars = (c.text.match(/\*/g) || []).length;
    // The engine's rule since Jul 2026: the fixed ladder, but never a star
    // on a cell that fails the chart's own level (a faded, starred cell
    // read as a contradiction). A typed level gates the same way.
    const want = pr.p >= alpha ? 0 : pr.p < 0.001 ? 3 : pr.p < 0.01 ? 2 : pr.p < 0.05 ? 1 : 0;
    if (stars === want) starsRight++; else starsWrong.push(c.a + 'x' + c.b + ' p=' + pr.p.toFixed(4) + ' stars=' + stars + ' want=' + want);
}
ok(fadeRight >= 8 && fadeWrong.length === 0, fadeRight + ' off-diagonal cells fade exactly by the typed level' + (fadeWrong.length ? ' (wrong: ' + fadeWrong.join('; ') + ')' : ''));
ok(starsRight >= 8 && starsWrong.length === 0, 'and the stars follow the .05 / .01 / .001 ladder on the cells that pass it' + (starsWrong.length ? ' (wrong: ' + starsWrong.join('; ') + ')' : ''));
const twoStar = cells.find(c => { const pr = pairs.find(p => (p.a === c.a && p.b === c.b)); return pr && pr.p < alpha && pr.p >= 0.001 && pr.p < 0.01 && (c.text.match(/\*/g) || []).length === 2; });
ok(!!twoStar, 'a pair below the typed level with .001 <= p < .01 carries two stars, not one (the ladder is not the typed level)');

console.log('case 3: the Statistics panel names the typed level and counts against it');
await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Statistic/i.test(x.title || '') || /Statistic/i.test(x.getAttribute('aria-label') || '') || /^Σ?\s*Stats$/.test(x.textContent.trim())); if (b) b.click(); });
await page.waitForTimeout(700);
const st = await page.evaluate(() => {
    const sel = document.querySelector('[data-st-act="corralpha"]');
    const opt = sel ? sel.options[sel.selectedIndex] : null;
    const pane = document.querySelector('[data-st-pane]') || document.body;
    const tally = (pane.textContent.match(/(\d+) of (\d+) pairs? (?:p < |significant at )([.\d]+)/) || []);
    return { value: sel ? sel.value : null, label: opt ? opt.textContent : null, tally: tally.slice(1, 4) };
});
ok(st.value !== null && Number(st.value) === alpha, 'the Alpha select holds the typed level (' + st.value + ')');
ok(/typed/.test(st.label || ''), 'as its own option, marked typed (' + st.label + ')');
ok(st.tally.length === 3 && Number(st.tally[0]) === 2 && Number(st.tally[2]) === alpha, 'the tally reads 2 of 10 pairs below it (' + st.tally.join(' / ') + ')');

console.log('case 4: a preset afterwards clears the field');
// Close the Statistics panel first: while it is open, chart clicks drive it.
await page.evaluate(() => { const b = document.querySelector('[data-role="st-close-btn"]'); if (b) b.click(); });
await page.waitForTimeout(500);
await openPanel();
await clickTab('values');
await page.evaluate(() => { const b = Array.from(document.querySelectorAll('[data-field="cr-alpha"]')).find(x => x.getAttribute('data-val') === '0.05'); b.click(); });
await page.waitForTimeout(2600);
sp = await spec();
const cleared = await page.evaluate(() => (document.querySelector('[data-field="cr-alpha-num"]') || {}).value);
ok(sp.corrSigLevel === 0.05 && cleared === '', 'the .05 preset commits and empties the typed field (' + sp.corrSigLevel + ', "' + cleared + '")');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (failed) { console.log('\ntyped-alpha-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\ntyped-alpha-check: all cases passed');
