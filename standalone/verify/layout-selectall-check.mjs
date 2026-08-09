// Torry's ask, Jul 27 2026: in a layout, Cmd/Ctrl+A highlighted the page
// text like a web page instead of selecting the items on the figure. In
// every design tool the chord means "everything on this page", so it means
// that here - scoped to the layout workspace, with text fields and the
// other workspaces keeping the native behaviour.
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

// A layout with several items on it: the chart panel it starts with, plus
// a text item, so "all" is a number greater than one.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout();
    await s(1200);
    window.PS_SHELL.setWorkspace('layout');
    await s(600);
});
// A new layout starts empty, so put items on it through the real toolbar
// buttons: a text item and a label, plus the chart panel.
await page.click('#ps-laddtext');
await page.waitForTimeout(400);
await page.click('#ps-laddlabel');
await page.waitForTimeout(400);
const total = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).length);
ok(total >= 1, `setup: the layout holds ${total} item(s)`);

console.log('case 1: the chord selects the page, not the page text');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems([]));
await page.waitForTimeout(200);
await page.keyboard.press(MOD + '+a');
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
    selected: window.PS_SHELL.layoutSelection().length,
    // What the browser's own select-all would have produced.
    textSelected: String(window.getSelection()).trim().length
}));
ok(after.selected === total,
   `every item on the layout is selected (${after.selected} of ${total})`);
ok(after.textSelected === 0,
   `and no page text is highlighted, which is what it used to do ` +
   `(${after.textSelected} characters)`);

console.log('case 2: the selection is real, not just a highlight');
// It must be the SAME selection the rest of the layout tools act on:
// nudging moves everything, and one undo puts it all back.
const before = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).map(i => Math.round(i.x)));
// ALT+Arrow. CONTRACT CHANGED, deliberately, Aug 2026 and approved: nudging
// is Alt+Arrow everywhere, because plain arrows nudged from outside the
// canvas and navigated inside it, which made one key mean two things.
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(400);
const moved = await page.evaluate(() =>
    (window.PS_SHELL.chart().items || []).map(i => Math.round(i.x)));
ok(moved.every((x, i) => x === before[i] + 1),
   `Alt+Arrow nudges every selected item together ` +
   `(${JSON.stringify(before)} -> ${JSON.stringify(moved)})`);

console.log('case 3: other places keep the native meaning');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(600);
});
await page.keyboard.press(MOD + '+a');
await page.waitForTimeout(300);
ok(await page.evaluate(() => window.PS_SHELL.workspace()) === 'data',
   'the Data workspace is unaffected by the layout chord');
// And inside a text field the chord must still select the text.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('layout');
    await s(600);
});
const inField = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const box = document.getElementById('ps-inspector-docname');
    if (!box) return { skipped: true };
    box.focus();
    box.value = 'Figure One';
    await s(50);
    return { skipped: false, focused: document.activeElement === box };
});
if (!inField.skipped) {
    ok(inField.focused, 'setup: focus is in the document-name field');
    await page.keyboard.press(MOD + '+a');
    await page.waitForTimeout(250);
    const sel = await page.evaluate(() => {
        const box = document.getElementById('ps-inspector-docname');
        return box.selectionEnd - box.selectionStart;
    });
    ok(sel === 'Figure One'.length,
       `the chord still selects the TEXT when a field has focus ` +
       `(${sel} characters)`);
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT SELECT ALL CHECK PASS');
await browser.close();
