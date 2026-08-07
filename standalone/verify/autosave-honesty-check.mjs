// A session's work was lost with a reassuring message on top of it.
//
// Importing 20,000 rows by 40 columns pushed the autosave past the browser's
// quota. The app said, in full, "Browser storage is full; recent changes
// remain in memory", which names no fix and reads as "you are fine". After a
// reload the start centre offered, as its highlighted default action,
// Continue autosaved project, subtitled "Dose response study, 24 rows, saved
// just now". That subtitle was true of the SNAPSHOT and false of everything
// the user had done since, and the 20,000 row project was gone.
//
// The app already knows how to say the useful thing. At 5k, 8k and 12k rows it
// says "This project is now too large for the local recent-projects list. It
// is still autosaved, but save it to a .pand file so you have a copy that does
// not depend on this browser." That names the fix, and all three of those
// sizes genuinely recover. The one message that would have saved the work
// appeared only in the cases where it was not needed.
//
// Two separable things are pinned here. The quota message must name the fix,
// and a reload must not present a snapshot as current when the autosave that
// would have replaced it failed.
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
const context = await browser.newContext({ viewport: { width: 1500, height: 960 } });
const page = await context.newPage();
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

const toasts = () => page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));

console.log('case 1: a healthy autosave leaves no stale marker');
ok((await page.evaluate(() =>
    window.localStorage.getItem('psstandalone.autosaveStale.v1'))) === null,
   'nothing is marked while autosave is working');

console.log('case 2: when the store is full the message names the fix');
// Force the failure the 20k import produces, without needing 20k rows.
await page.evaluate(() => {
    const real = window.localStorage.setItem.bind(window.localStorage);
    window.__psRealSet = real;
    window.localStorage.setItem = function (k, v) {
        if (String(k).indexOf('psstandalone.project') === 0) {
            const err = new Error('exceeded the quota');
            err.name = 'QuotaExceededError';
            throw err;
        }
        return real(k, v);
    };
});
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw[t.order[1]][0] = '999';
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(900);
const t2 = await toasts();
ok(/\.pand/.test(t2),
   'the message names the file format that survives, got ' +
   JSON.stringify(t2.slice(0, 220)));
ok(/no longer being autosaved/.test(t2),
   'and says plainly that autosaving has stopped, got ' +
   JSON.stringify(t2.slice(0, 220)));
ok(!/remain in memory/.test(t2),
   'and not the old sentence that read as reassurance');

console.log('case 3: the failure is remembered across a reload');
ok((await page.evaluate(() =>
    window.localStorage.getItem('psstandalone.autosaveStale.v1'))) === '1',
   'a marker is written so a new tab can know');

// A NEW TAB, not a reload. Reloading a working tab resumes straight into the
// project via a per-tab sessionStorage dismissal, so the start centre never
// appears; coming back later is what actually shows the Continue card.
await page.close();
const page2 = await context.newPage();
page2.on('pageerror', e => errors.push(String(e)));
await page2.goto(pageUrl);
await page2.waitForTimeout(1500);
ok(await page2.locator('#ps-welcome').isVisible(),
   'a new tab shows the start centre');
const meta = await page2.evaluate(() => {
    const n = document.getElementById('ps-welcome-continue-meta');
    return n ? n.textContent : '';
});
ok(/ran out of room/.test(meta),
   'the Continue card says the recovery predates the lost work, got ' +
   JSON.stringify(meta));
ok(!/saved just now/.test(meta),
   'and no longer claims it was saved just now, got ' + JSON.stringify(meta));

console.log('case 4: a healthy save clears the marker again');
await page2.click('#ps-welcome-continue');
await page2.waitForTimeout(1000);
await page2.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page2.waitForTimeout(300);
await page2.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw[t.order[1]][1] = '77';
    window.PS_SHELL.retypeTable();
});
await page2.waitForTimeout(1000);
ok((await page2.evaluate(() =>
    window.localStorage.getItem('psstandalone.autosaveStale.v1'))) === null,
   'the marker is gone once a save succeeds');

await page2.close();
const page3 = await context.newPage();
page3.on('pageerror', e => errors.push(String(e)));
await page3.goto(pageUrl);
await page3.waitForTimeout(1500);
const meta4 = await page3.evaluate(() => {
    const n = document.getElementById('ps-welcome-continue-meta');
    return n ? n.textContent : '';
});
ok(!/ran out of room/.test(meta4) && /saved/.test(meta4),
   'and the Continue card reads normally again, got ' + JSON.stringify(meta4));

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('AUTOSAVE HONESTY CHECK: ALL GREEN');
await browser.close();
