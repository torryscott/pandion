// Changing a measure type can empty a column, and the app said nothing.
//
// "$12.50", "1,234" and "45%" parse as no number at all, so a currency or a
// thousands-separated variable flipped to Continuous loses every value at
// once. The raw text survives and one undo restores the type, so nothing is
// destroyed, but the only report was Valid 0 in a summary panel the user has
// no reason to be reading at that moment. The type select sits directly above
// it, which is exactly where the answer belongs.
//
// The app deliberately has no confirm() anywhere, so this follows the house
// answer instead. Do it, say what it did, and carry the way back.
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

const toastText = () => page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));
// Snapshot and diff, never remove. Removing toast nodes takes the app's own
// container with them (the container carries a toast class while showing),
// so later toasts have nowhere to render and every "nothing is announced"
// assertion after that passes no matter what the app does.
const voidToastCount = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-toast .ps-toast-item'))
    .filter(n => /could (not )?be read/.test(n.innerText)).length);
const validOf = c => page.evaluate(cc => {
    const v = window.PS_SHELL.project.table.columns[cc] || [];
    return v.filter(x => x != null).length;
}, c);
async function load(vals) {
    await page.evaluate(v => window.PS_SHELL.loadTable(
        'f', ['g', 'amount'], v.map((x, i) => ['g' + (i % 2), x])), vals);
    await page.waitForTimeout(650);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(250);
}

console.log('case 1: a whole column lost is reported');
await load(['$12.50', '$8.75', '$19.00', '$4.25', '$33.10', '$7.05', '$14.90', '$21.40']);
ok((await validOf('amount')) === 8, 'eight values to begin with');
await page.evaluate(() => window.PS_SHELL.setColType('amount', 'continuous'));
await page.waitForTimeout(700);
ok((await validOf('amount')) === 0, 'the flip does empty the column');
const t1 = await toastText();
ok(/amount/.test(t1) && /could (not )?be read/.test(t1),
   'and the app says so, naming the column, got ' + JSON.stringify(t1));
ok(/Cmd\/Ctrl\+Z/.test(t1), 'the message carries the way back, got ' + JSON.stringify(t1));

console.log('case 2: the way back works');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(700);
ok((await validOf('amount')) === 8, 'undo restores every value, got ' + (await validOf('amount')));

console.log('case 3: an ordinary type change stays quiet');
await load(['12', '8', '19', '4', '33', '7', '14', '21']);
const before3 = await voidToastCount();
await page.evaluate(() => window.PS_SHELL.setColType('amount', 'nominal'));
await page.waitForTimeout(600);
ok((await validOf('amount')) === 8, 'nothing was lost');
ok((await voidToastCount()) <= before3,
   'so nothing new is announced, ' + before3 + ' stale before and ' +
   (await voidToastCount()) + ' after');

console.log('case 4: losing one stray value is not worth an interruption');
await load(['12', '8', '19', '4', 'n/a', '7', '14', '21']);
const before4 = await voidToastCount();
await page.evaluate(() => window.PS_SHELL.setColType('amount', 'continuous'));
await page.waitForTimeout(600);
ok((await validOf('amount')) === 7, 'one value went missing, got ' + (await validOf('amount')));
ok((await voidToastCount()) <= before4,
   'and it is not announced, because the variable advice card already names it');
// The counter itself must be live, or the two quiet cases above prove
// nothing. The whole-column flip from case 1 is repeated and must count.
await load(['$12.50', '$8.75', '$19.00', '$4.25', '$33.10', '$7.05', '$14.90', '$21.40']);
const before5 = await voidToastCount();
await page.evaluate(() => window.PS_SHELL.setColType('amount', 'continuous'));
await page.waitForTimeout(600);
ok((await voidToastCount()) > before5,
   'the toast counter still sees a real announcement when one fires');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('TYPE CHANGE COST CHECK: ALL GREEN');
await browser.close();
