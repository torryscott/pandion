// Check-for-updates (backlog item, approved Aug 25 2026). The contracts:
//   1. PRIVACY DEFAULT: with factory preferences, loading the app sends
//      NO request to the manifest (the About dialog promises "nothing is
//      sent anywhere"; the automatic check is opt-in).
//   2. Help > Check for updates fetches the manifest and, when it is
//      newer, says so, shows the download-page button, badges the Help
//      button, and relabels the menu item "Update available (x.y)".
//   3. Same-version manifest: "You are up to date", no button, no badge.
//   4. With the preference ON, the automatic check runs once after boot
//      and a reload inside the day does NOT re-fetch (the stamp).
//   5. A dead network fails the manual path with an honest dialog and
//      the automatic path silently; no page errors either way.
//   6. A hostile manifest cannot steer the button off pandionplots.com,
//      and a non-version string is treated as a failed check.
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
const MANIFEST = 'https://pandionplots.com/app/version.json';
const browser = await chromium.launch();

async function boot(opts = {}) {
    const ctx = opts.ctx || await browser.newContext();
    if (opts.prefs && !opts.ctx) {
        await ctx.addInitScript(prefs => {
            try { localStorage.setItem('psstandalone.preferences.v1', JSON.stringify(prefs)); } catch (e) {}
        }, opts.prefs);
    }
    if (!opts.ctx) {
        await ctx.addInitScript(() => {
            window.__psOpened = [];
            const real = window.open;
            window.open = function (u) { window.__psOpened.push(String(u)); return null; };
        });
    }
    const hits = opts.hits || { n: 0 };
    await ctx.route(MANIFEST, route => {
        hits.n++;
        if (opts.dead) return route.abort();
        return route.fulfill({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify(opts.manifest || {})
        });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pageUrl);
    await page.waitForSelector('[data-ps-menu="help"]', { timeout: 20000 });
    // The start center intercepts clicks on a cold load (the tour-check idiom).
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(600);
    }
    return { ctx, page, errors, hits };
}
async function clickHelpItem(page, labelStart) {
    await page.click('[data-ps-menu="help"]');
    await page.waitForTimeout(200);
    const clicked = await page.evaluate(start => {
        const m = document.getElementById('ps-appmenu');
        const btn = Array.from(m ? m.querySelectorAll('button') : [])
            .find(b => (b.textContent || '').trim().indexOf(start) === 0);
        if (btn) { btn.click(); return (btn.textContent || '').trim(); }
        return null;
    }, labelStart);
    await page.waitForTimeout(400);
    return clicked;
}
const dialogText = page => page.evaluate(() => {
    const d = document.getElementById('ps-update-dialog');
    const open = document.getElementById('ps-update-open');
    return {
        shown: !!d && getComputedStyle(d).display !== 'none',
        text: (document.getElementById('ps-update-body') || {}).textContent || '',
        openVisible: !!open && !open.hasAttribute('hidden'),
        dot: !!document.getElementById('ps-update-dot')
    };
});

console.log('case 1: factory defaults send nothing');
{
    const { ctx, page, errors, hits } = await boot({ manifest: { version: '9.9.9' } });
    await page.waitForTimeout(4600);   // the boot check fires at 3.5s when armed
    ok(hits.n === 0, 'no manifest request with the preference off (privacy default)');
    ok(!(await dialogText(page)).dot, 'no badge either');
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
}

console.log('case 2: manual check, newer version');
{
    const { ctx, page, errors } = await boot({
        manifest: { version: '9.9.9', page: 'https://pandionplots.com/download.html' } });
    ok(await clickHelpItem(page, 'Check for updates') !== null, 'the Help menu carries Check for updates');
    let d = await dialogText(page);
    ok(d.shown, 'the update dialog opened');
    ok(d.text.indexOf('9.9.9') >= 0 && d.text.indexOf('is available') >= 0, 'it names the newer version');
    ok(d.text.indexOf('projects are separate') >= 0, 'and reassures about saved projects');
    ok(d.openVisible, 'the download-page button shows');
    ok(d.dot, 'the Help button carries the update dot');
    await page.click('#ps-update-open');
    const opened = await page.evaluate(() => window.__psOpened);
    ok(opened.length === 1 && opened[0] === 'https://pandionplots.com/download.html',
       'the button opens the download page: ' + JSON.stringify(opened));
    await page.click('#ps-update-close');
    const label = await clickHelpItem(page, 'Update available');
    ok(label !== null && label.indexOf('9.9.9') >= 0, 'the menu item relabeled: ' + label);
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
}

console.log('case 3: manual check, already current');
{
    const { ctx, page, errors } = await boot({ manifest: { version: '0.0.1' } });
    await clickHelpItem(page, 'Check for updates');
    const d = await dialogText(page);
    ok(d.shown && d.text.indexOf('up to date') >= 0, 'says up to date');
    ok(!d.openVisible, 'no download button');
    ok(!d.dot, 'no badge');
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
}

console.log('case 4: preference ON checks once, and the stamp holds on reload');
{
    const { ctx, page, errors, hits } = await boot({
        prefs: { updateCheck: 'on' },
        manifest: { version: '9.9.9', page: 'https://pandionplots.com/download.html' } });
    await page.waitForTimeout(4600);
    ok(hits.n === 1, 'exactly one automatic manifest request (' + hits.n + ')');
    ok((await dialogText(page)).dot, 'the badge appeared without any dialog');
    ok(!(await dialogText(page)).shown, 'the automatic check never opens a dialog');
    await page.reload();
    await page.waitForSelector('[data-ps-menu="help"]', { timeout: 20000 });
    await page.waitForTimeout(4600);
    ok(hits.n === 1, 'a reload inside the day does not re-fetch (stamp respected)');
    ok((await dialogText(page)).dot, 'the badge survives the reload from stored state');
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
}

console.log('case 5: dead network');
{
    const { ctx, page, errors } = await boot({ dead: true, prefs: { updateCheck: 'on' } });
    await page.waitForTimeout(4600);   // automatic path: silent
    ok(!(await dialogText(page)).shown, 'automatic failure is silent');
    await clickHelpItem(page, 'Check for updates');
    const d = await dialogText(page);
    ok(d.shown && d.text.indexOf('Could not reach') >= 0, 'manual failure says so honestly');
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();
}

console.log('case 6: hostile manifest');
{
    const { ctx, page, errors } = await boot({
        manifest: { version: '9.9.9', page: 'https://evil.example/steal' } });
    await clickHelpItem(page, 'Check for updates');
    await page.click('#ps-update-open');
    const opened = await page.evaluate(() => window.__psOpened);
    ok(opened.length === 1 && opened[0] === 'https://pandionplots.com/download.html',
       'a foreign page URL is ignored; the button stays on pandionplots.com');
    await ctx.close();

    const bad = await boot({ manifest: { version: '<img src=x>' } });
    await clickHelpItem(bad.page, 'Check for updates');
    const d = await dialogText(bad.page);
    ok(d.shown && d.text.indexOf('Could not reach') >= 0, 'a non-version string is a failed check');
    ok(!d.dot, 'and never a badge');
    ok(bad.errors.length === 0, 'no page errors: ' + bad.errors.join(' | '));
    await bad.ctx.close();
}

await browser.close();
console.log('update-check: ALL GREEN');
