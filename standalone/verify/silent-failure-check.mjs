// B13-B18: the app failing without saying so.
//
// B17 a later toast destroyed a pending Undo without running it; B15 the
// download fallback swallowed everything in an empty catch; B16 library
// writes failed silently and were lost on reload; B13 the save chip claimed
// "Modified - autosaved" while autosave was dead; B14 one lucky write erased
// all evidence of failure and the snapshot carried no timestamp; B18 opening
// a recent project replaced never-saved work with nothing to bring it back.
//
// Everything here is driven through the app's own paths: the B17 collision
// is a real autosave error landing inside a real layout-delete offer.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 },
                                     acceptDownloads: true });
// Headless Chromium exposes showSaveFilePicker but cannot show it, so the
// save has to take the download fallback (the m1-shell-check idiom).
await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('download', d => d.cancel().catch(() => {}));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(250);
}

const machineId = await page.evaluate(() =>
    window.PS_SHELL.buildPayload().paletteLibraryMachineId);
const toastText = () => page.evaluate(() =>
    document.getElementById('ps-toast').textContent);
const undoButtons = () => page.evaluate(() =>
    document.querySelectorAll('#ps-toast .ps-toast-action button').length);
const chip = () => page.evaluate(() =>
    document.getElementById('ps-save-state').textContent.trim());
const detail = () => page.evaluate(() =>
    document.getElementById('ps-status-document').textContent.trim());
const breakStorage = on => page.evaluate(broken => {
    if (broken) {
        if (!window.__realSet)
            window.__realSet = window.localStorage.setItem.bind(window.localStorage);
        window.localStorage.setItem = function () {
            throw new DOMException('exceeded the quota', 'QuotaExceededError');
        };
    } else if (window.__realSet) {
        window.localStorage.setItem = window.__realSet;
    }
}, on);
const layItems = () => page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    return l ? l.items.length : -1;
});

// ---- B17: a REAL autosave error landing inside a REAL delete offer ----
await page.evaluate(() => { window.PS_SHELL.showLayoutGallery(); });
await page.waitForTimeout(150);
await page.click('[data-layout-template="single"]');
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(400);
const startItems = await layItems();
if (startItems < 1) throw new Error('setup: the template produced no items');

await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.selectLayoutItems([l.items[0].id]);
});
await page.keyboard.press('Delete');
await page.waitForTimeout(150);
if (await undoButtons() !== 1) throw new Error('setup: no undo offer after delete');

await breakStorage(true);
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));  // persists
await page.waitForTimeout(250);
let t = await toastText();
if (await undoButtons() !== 1)
    throw new Error('an autosave error destroyed the pending Undo offer');
if (!/storage|recovery/i.test(t))
    throw new Error('the autosave error never reached the screen: "' + t + '"');
if (!/Removed from the layout/.test(t))
    throw new Error('the delete offer did not survive alongside it: "' + t + '"');

const shapes = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-toast .ps-toast-item')).map(n => ({
        err: n.classList.contains('ps-toast-error'),
        act: n.classList.contains('ps-toast-action')
    })));
if (shapes.length < 2 || !shapes.some(s => s.err && !s.act) ||
    !shapes.some(s => s.act && !s.err))
    throw new Error('the error and the offer were not independent pills: ' +
                    JSON.stringify(shapes));
console.log('  ok  an error toast shares the screen with an offer, never replaces it');

await page.evaluate(() => {
    const l = window.PS_SHELL.charts().find(d => Array.isArray(d.items));
    window.PS_SHELL.switchChart(l.id);
});
await page.waitForTimeout(200);
await page.click('#ps-toast .ps-toast-action button');
await page.waitForTimeout(400);
if (await layItems() !== startItems)
    throw new Error('the surviving Undo did not restore the deleted panel');
console.log('  ok  the surviving offer still performs its restore');

// ---- B13: the chip is honest once a file has been saved ----
await breakStorage(false);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.click('#ps-save');
await page.waitForTimeout(500);
if (/autosave/i.test(await chip()) || !/Saved/i.test(await chip()))
    throw new Error('setup: the file save did not register: "' + (await chip()) + '"');
await breakStorage(true);
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
await page.waitForTimeout(250);
let c = await chip();
if (!/not autosaved/i.test(c))
    throw new Error('the chip claimed autosave while it was failing: "' + c + '"');
console.log('  ok  the save chip reports a dead autosave even after a file save');

// ---- B14: a lucky write does not erase the evidence ----
await breakStorage(false);
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
await page.waitForTimeout(250);
const d = await detail();
if (!/failed/i.test(d))
    throw new Error('a successful write erased the failure history: "' + d + '"');
if (/not autosaved/i.test(await chip()))
    throw new Error('the chip stayed alarmed after autosave recovered');
console.log('  ok  a recovered autosave still reports that it had been failing');

const stamped = await page.evaluate(() => {
    const raw = window.localStorage.getItem('psstandalone.project.v2');
    const snap = raw ? JSON.parse(raw) : null;
    return !!(snap && snap.savedAt && !isNaN(Date.parse(snap.savedAt)));
});
if (!stamped)
    throw new Error('the autosave snapshot still carries no savedAt timestamp');
console.log('  ok  the autosave snapshot is timestamped');

// ---- B15: a blocked download is not indistinguishable from a save ----
await page.waitForTimeout(3000);
await page.evaluate(() => {
    window.__realBlobUrl = URL.createObjectURL;
    URL.createObjectURL = function () { throw new Error('blocked'); };
});
await page.click('#ps-save');
await page.waitForTimeout(300);
t = await toastText();
if (!/Could not save the project file/i.test(t))
    throw new Error('a blocked save was silent, exactly like a successful one: "' +
                    t + '"');
await page.evaluate(() => { URL.createObjectURL = window.__realBlobUrl; });
console.log('  ok  a save that cannot complete says so instead of looking like a save');

// ---- B16: a failed library write says so ----
await page.waitForTimeout(3000);            // let the pile expire
await breakStorage(true);
await page.evaluate(mid => {
    window.setOption('styleLibrary', JSON.stringify({
        kind: 'save', name: 'Probe style',
        groups: ['text'], opts: { chartTextColor: '#8b1a1a' },
        machineId: mid, timestamp: Date.now()
    }));
}, machineId);
await page.waitForTimeout(300);
t = await toastText();
if (!/styles and palettes/i.test(t))
    throw new Error('a failed style-library write was still silent: "' + t + '"');
await breakStorage(false);
console.log('  ok  a style library that cannot be written says so');

// ---- B18: replacing never-saved work is offered back ----
await page.evaluate(() => window.PS_SHELL.loadSample());   // a second project id
await page.waitForTimeout(300);
await page.evaluate(() => {
    window.PS_SHELL.project.name = 'My unsaved analysis';
    window.PS_SHELL.addChart('plotbuilder');               // persists the rename
});
await page.waitForTimeout(300);
const recentCount = await page.evaluate(() => {
    const raw = window.localStorage.getItem('psstandalone.recent.v1');
    return raw ? JSON.parse(raw).length : 0;
});
if (recentCount < 2)
    throw new Error('setup: fewer than two recent projects to swap between');
await page.waitForTimeout(3000);
await page.evaluate(() => window.PS_SHELL.showWelcome());
await page.waitForTimeout(250);
// The FIRST recent is the project we are already in; open the second.
await page.click('#ps-recent-list .ps-recent-item:nth-child(2)');
await page.waitForTimeout(500);
if (await page.evaluate(() => window.PS_SHELL.project.name) === 'My unsaved analysis')
    throw new Error('setup: opening the recent project did not replace the project');
if (await undoButtons() !== 1)
    throw new Error('replacing never-saved work offered nothing to bring it back');
await page.click('#ps-toast .ps-toast-action button');
await page.waitForTimeout(600);
const restored = await page.evaluate(() => window.PS_SHELL.project.name);
if (restored !== 'My unsaved analysis')
    throw new Error('the replaced project did not come back: "' + restored + '"');
console.log('  ok  opening a recent project over unsaved work is reversible');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SILENT FAILURE CHECK PASS');
await browser.close();
