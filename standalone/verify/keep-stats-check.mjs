// Keep the ANOVA and several comparisons with the chart (Sep 21 2026,
// Torry: the Omnibus tab could not be kept to the Notebook, and he wants
// main effects and interactions kept together with the chart). What this
// pins:
//   1. the Omnibus card carries Keep; pressing it adds ONE Notebook page
//      whose text carries every effect row exactly as the table prints it
//      (F, df, p, the effect size) plus the model footnote, and whose image
//      is the chart with the card underneath;
//   2. Compare pairs carries Keep ticked, disabled until a row is ticked;
//      with two rows ticked it keeps ONE page listing both, in table order,
//      each with its section, test, statistic, p and effect;
//   3. unticking everything disables it again and a click keeps nothing;
//   4. a page kept this way reads back in the Notebook rail.
// CONTROL (main): case 1 fails at the first assertion (no Keep on Omnibus).
//
// Usage: node standalone/verify/keep-stats-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {} });
await page.goto(PAGE); await page.waitForTimeout(1200);
const pinCount = () => page.evaluate(() => (window.PS_SHELL.project.pinboards || []).reduce((n, b) => n + (b.pins || []).length, 0));
const lastPin = () => page.evaluate(() => { const all = []; (window.PS_SHELL.project.pinboards || []).forEach(b => (b.pins || []).forEach(p => all.push(p))); const p = all[all.length - 1]; if (!p) return null; const src = String(p.src || ''); const svg = src.indexOf('data:image/svg+xml') === 0 ? decodeURIComponent(src.slice(src.indexOf(',') + 1)) : src; return { eyebrow: p.momEyebrow, title: p.momTitle, text: p.momText, svgStart: svg.slice(0, 5), srcHasCard: /<tspan[^>]*>(Main|effect|comparison)/i.test(svg), srcHasChart: /<rect|<path/.test(svg), chips: (svg.match(/data-role="sig-chip"/g) || []).length }; });

// ---- 1. the Omnibus keep
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' }); await s(1500);
    document.querySelector('#psroot button[aria-label="Statistics"]').click(); await s(900);
    document.querySelector('[data-gb2-inspector] [data-st-tab="omnibus"]').click(); await s(700);
});
const omni = await page.evaluate(() => {
    const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="omnibus"]');
    const keep = pane && pane.querySelector('[data-ps-moment-keep-omni]');
    const rows = pane ? [...pane.querySelectorAll('table tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim())).filter(r => r.length >= 4) : [];
    const heads = pane ? [...pane.querySelectorAll('th')].map(t => t.textContent.trim()) : [];
    return { keep: !!keep, copy: !!(pane && pane.querySelector('[data-ps-moment-copy-omni]')), rows, heads, sig: pane ? pane.querySelectorAll('table [data-cmp-sig]').length : 0 };
});
ok(omni.keep && omni.copy, '1: the Omnibus card carries Keep and Copy with chart');
ok(omni.rows.length >= 3, '1: the example chart yields a factorial table (' + omni.rows.length + ' effect rows: ' + omni.rows.map(r => r[0]).join(' / ') + ')');
const before1 = await pinCount();
await page.click('[data-gb2-inspector] [data-st-pane="omnibus"] [data-ps-moment-keep-omni]'); await page.waitForTimeout(500);
const after1 = await pinCount();
const pin1 = await lastPin();
ok(after1 === before1 + 1 && pin1, '1: Keep adds exactly one Notebook page (' + before1 + ' -> ' + after1 + ')');
ok(pin1 && pin1.eyebrow === 'Compare Groups \u00b7 Omnibus' && /ANOVA/.test(pin1.title), '1: the page names the tab and the model (' + (pin1 && pin1.eyebrow) + ' | ' + (pin1 && pin1.title) + ')');
const expectLines = omni.rows.map(r => { const p = /^[<>]/.test(r[3]) ? 'p ' + r[3] : 'p = ' + r[3]; return r[0] + ': F(' + r[2] + ') = ' + r[1] + ', ' + p + (r[4] && r[4] !== '—' ? ', ' + omni.heads[4] + ' = ' + r[4] : ''); });
const textLines = pin1 ? pin1.text.split('\n') : [];
ok(expectLines.every(l => textLines.includes(l)), '1: every effect row is kept verbatim from the table (' + expectLines[0] + ' ...)');
ok(!textLines.some(l => /Type III|visible chart/.test(l)) && pin1.title === 'Two-way ANOVA with interaction', '1: the footnote stays off the card; the title names the design (' + pin1.title + ')');
ok(pin1 && omni.sig >= 1 && pin1.chips === omni.sig, '1: the significance chip is drawn on the page for each significant effect (' + (pin1 && pin1.chips) + ' of ' + omni.sig + ')');
ok(pin1 && pin1.svgStart === '<svg ' && pin1.srcHasCard && pin1.srcHasChart, '1: the page image is one svg carrying the chart and the card text');
// ---- 2. Keep ticked on Compare pairs
await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[data-gb2-inspector] [data-st-tab="pairs"]').click(); await s(600); });
const t0 = await page.evaluate(() => { const b = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"] [data-ps-moment-keep-ticked]'); return b ? { disabled: b.disabled, label: b.textContent } : null; });
ok(t0 && t0.disabled && t0.label === 'Keep ticked', '2: Keep ticked sits on the Compare pairs action row, disabled with nothing ticked (' + JSON.stringify(t0) + ')');
const picked = await page.evaluate(() => {
    const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"]');
    const cbs = [...pane.querySelectorAll('input[data-cmp-cb]')];
    const rows = cbs.map(cb => cb.closest('tr'));
    const plain = rows.find(tr => !tr.querySelector('[data-cmp-sig]')), sig = rows.find(tr => tr.querySelector('[data-cmp-sig]'));
    const chosen = [plain, sig].map(tr => tr.querySelector('input[data-cmp-cb]'));
    return chosen.map(cb => { cb.click(); const tr = cb.closest('tr'); const tds = [...tr.querySelectorAll('td')].filter(td => !td.querySelector('input')); return tds.map(td => td.textContent.trim()); });
});
await page.waitForTimeout(300);
const t1 = await page.evaluate(() => { const b = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"] [data-ps-moment-keep-ticked]'); return { disabled: b.disabled, label: b.textContent }; });
ok(!t1.disabled && t1.label === 'Keep ticked (2)', '2: ticking two rows enables it and counts them (' + t1.label + ')');
const before2 = await pinCount();
await page.click('[data-gb2-inspector] [data-st-pane="pairs"] [data-ps-moment-keep-ticked]'); await page.waitForTimeout(500);
const after2 = await pinCount();
const pin2 = await lastPin();
ok(after2 === before2 + 1 && pin2 && /Compare pairs/.test(pin2.eyebrow) && pin2.title === '2 comparisons', '2: one page for both comparisons (' + (pin2 && pin2.eyebrow) + ' | ' + (pin2 && pin2.title) + ')');
const lines2 = pin2 ? pin2.text.split('\n') : [];
const has = (row, line) => line.indexOf(row[0]) !== -1 && line.indexOf(row[1]) !== -1 && line.indexOf(row[2]) !== -1 && line.indexOf(row[5]) !== -1;
ok(lines2.length >= 2 && has(picked[0], lines2[0]) && has(picked[1], lines2[1]), '2: the two lines carry each row\'s comparison, test, statistic and effect in table order (' + lines2[0] + ' | ' + lines2[1] + ')');
ok(/^[A-Z][^:]*: /.test(lines2[0]), '2: each line leads with its section (' + lines2[0].split(':')[0] + ')');
ok(lines2.some(l => /significant at/.test(l)), '2: the tally rides along as the last paragraph');
ok(pin2 && pin2.chips === 1, '2: one chip on the page: the significant row gets it, the other does not (' + (pin2 && pin2.chips) + ')');
// ---- 3. unticking disables and a click keeps nothing
await page.evaluate(() => { document.querySelectorAll('[data-gb2-inspector] [data-st-pane="pairs"] input[data-cmp-cb]:checked').forEach(cb => cb.click()); });
await page.waitForTimeout(300);
const t2 = await page.evaluate(() => { const b = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"] [data-ps-moment-keep-ticked]'); return { disabled: b.disabled, label: b.textContent }; });
const before3 = await pinCount();
await page.evaluate(() => { const b = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"] [data-ps-moment-keep-ticked]'); b.click(); });
await page.waitForTimeout(300);
ok(t2.disabled && (await pinCount()) === before3, '3: with nothing ticked the button is disabled and keeps nothing');
// ---- 3b. the pinned-row keep (the focus card) carries the chip as well
const pinnedKeep = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="pairs"]');
    const tr = [...pane.querySelectorAll('tr[data-link]')].find(t => t.querySelector('[data-cmp-sig]'));
    tr.querySelector('td:nth-child(2)').click(); await s(500);
    const card = document.querySelector('[data-role="st-focus-card"]');
    const keep = card && card.querySelector('[data-ps-moment-keep]');
    if (!keep) return { card: !!card, keep: false };
    keep.click(); await s(500);
    return { card: true, keep: true };
});
const pin3 = await lastPin();
ok(pinnedKeep.keep && pin3 && pin3.chips === 1 && !/comparisons/.test(pin3.title), '3b: keeping a pinned significant row from its focus card draws its chip (' + (pin3 && pin3.chips) + ')');
// ---- 4. the kept ANOVA reads back in the Notebook rail
const rail = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL; S.setWorkspace('pinboard'); await s(700);
    const pages = [...document.querySelectorAll('#ps-pinscroll .ps-pinpage')];
    const first = pages[0]; if (!first) return { pages: 0 };
    first.click(); await s(400);
    return { pages: pages.length, stat: (document.getElementById('ps-pininsp-stat') || {}).textContent || '' };
});
ok(rail.pages === 3 && /Main effect of condition/.test(rail.stat) && /Omnibus/.test(rail.stat), '4: the Notebook shows both pages and the ANOVA page\'s rail text is readable (' + rail.stat.slice(0, 60) + '...)');
ok(errors.length === 0, 'no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
await browser.close();
console.log(failures ? 'keep-stats: FAIL (' + failures + ')' : 'keep-stats: PASS');
process.exit(failures ? 1 : 0);
