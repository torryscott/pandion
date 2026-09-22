// Load data's Preview button (Sep 21 2026, Torry): it previews the paste box
// and nothing else, so it shows only while the box holds rows, and the
// preview's summary line names where the rows came from. What this pins:
//   1. Paste data opens the loader with no Preview button and an empty box;
//   2. typing rows shows the button, labelled for what it does; a click
//      previews them and the summary says Pasted rows; clearing the box
//      hides the button again;
//   3. a file fetched from a link previews with its name and host in the
//      summary, and the button stays away (the box is empty).
// CONTROL (the parent branch): case 1 fails (the button is visible).
//
// Usage: node standalone/verify/paste-preview-check.mjs

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
const HERE = new URL('.', import.meta.url).pathname;
const PAGE = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE) : path.resolve(HERE, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }
const CSV = 'group,score,hours\nA,12,3.1\nA,15,2.8\nB,20,4.4\n';

const browser = await chromium.launch();
async function boot(query) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.clear(); } catch (e) {} });
    await page.route('https://example.test/**', route => route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/csv' }, body: CSV }));
    await page.goto(PAGE + (query || '')); await page.waitForTimeout(1100);
    return { ctx, page };
}
const state = page => page.evaluate(() => ({
    loader: getComputedStyle(document.getElementById('ps-loader')).display !== 'none',
    button: document.getElementById('ps-paste-use').getClientRects().length > 0,
    label: document.getElementById('ps-paste-use').textContent.trim(),
    box: document.getElementById('ps-paste').value,
    summary: (document.querySelector('#ps-import-preview .ps-import-summary') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim(),
    importShown: document.getElementById('ps-import-use').style.display !== 'none'
}));
{
    const { ctx, page } = await boot('');
    await page.click('#ps-welcome-paste'); await page.waitForTimeout(400);
    let s = await state(page);
    ok(s.loader && !s.button && s.box === '', '1: Paste data opens the loader with an empty box and no Preview button');
    await page.type('#ps-paste', 'condition,score\nControl,61\nDrug,70\n'); await page.waitForTimeout(200);
    s = await state(page);
    ok(s.button && s.label === 'Preview pasted rows', '2: typing rows shows the button, labelled for what it does (' + s.label + ')');
    await page.click('#ps-paste-use'); await page.waitForTimeout(400);
    s = await state(page);
    ok(/^Pasted rows · 2 rows × 2 columns/.test(s.summary) && s.importShown, '2: a click previews them and the summary says where they came from (' + s.summary + ')');
    await page.fill('#ps-paste', ''); await page.waitForTimeout(200);
    s = await state(page);
    ok(!s.button, '2: clearing the box hides the button again');
    await ctx.close();
}
{
    const { ctx, page } = await boot('?data=https://example.test/lab/scores.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1200);
    const s = await state(page);
    ok(s.loader && /^scores\.csv from example\.test · 3 rows × 3 columns/.test(s.summary) && !s.button && s.importShown, '3: a link-fetched file previews with its name and host, and no Preview button (' + s.summary + ')');
    await ctx.close();
}
await browser.close();
console.log(failures ? 'paste-preview: FAIL (' + failures + ')' : 'paste-preview: PASS');
process.exit(failures ? 1 : 0);
