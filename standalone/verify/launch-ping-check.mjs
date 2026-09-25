// The hosted copy's launch ping (Sep 2026, worker/README.md).
//
// The copy of the app served from pandionplots.com sends one empty
// POST /api/hit/launch when it boots, and POST /api/hit/launch-day once
// per browser per calendar day, so the site can count launches. Nothing
// else ever sends it: the gate is the hostname (psUpdateHosted) and
// navigator.webdriver being false.
//
// Cases:
//   1. the app loaded under a routed https://pandionplots.com/app/ with
//      webdriver false: exactly one launch ping and one launch-day ping,
//      both POST with no body and no cookie; the About dialog's hosted
//      note is shown; a reload sends launch again but not launch-day.
//   2. the same page from file:// (the desktop and portable copies): no
//      ping, the About note stays hidden.
//   3. the hosted page under a headless browser (webdriver true, the
//      state every probe and screenshot script runs in): no ping.
// CONTROL (the shell before the ping): case 1 finds no request.
//
// Usage: node standalone/verify/launch-ping-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const pw = loadPlaywright();
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const APP_DIR = path.join(ROOT, 'standalone');
const PAGE_FILE = process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE) : path.join(APP_DIR, 'index.html');
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
// Serve the repo under https://pandionplots.com: /app/<x> is the standalone
// folder (or the built dist when PS_PAGE points at it), anything else is
// the repo root (the engine bundle lives under /inst/).
function serveHosted(ctx, hits) {
    return ctx.route('https://pandionplots.com/**', route => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith('/api/hit/')) {
            hits.push({ kind: u.pathname.slice('/api/hit/'.length), method: route.request().method(),
                        body: route.request().postData(), cookie: route.request().headers()['cookie'] || null });
            return route.fulfill({ status: 204 });
        }
        let file;
        if (u.pathname === '/app/' || u.pathname === '/app/index.html') file = PAGE_FILE;
        else if (u.pathname.startsWith('/app/')) file = path.join(path.dirname(PAGE_FILE), u.pathname.slice('/app/'.length));
        else file = path.join(ROOT, u.pathname);
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
        return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
}
async function newCtx(browser, opts) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(o => {
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
        if (o.human) {
            try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
        }
    }, opts);
    return ctx;
}
const aboutNoteShown = page => page.evaluate(() => { const n = document.getElementById('ps-about-hosted-note'); return n ? !n.hidden : null; });

const browser = await pw.chromium.launch();
try {
    // Case 1: hosted, a human browser.
    {
        const ctx = await newCtx(browser, { human: true });
        const hits = [];
        await serveHosted(ctx, hits);
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e)));
        await page.goto('https://pandionplots.com/app/');
        await page.waitForTimeout(2500);
        ok(hits.length === 2 && hits[0].kind === 'launch' && hits[1].kind === 'launch-day',
           'hosted: one launch ping and one launch-day ping at boot (' + hits.map(h => h.kind).join(', ') + ')');
        ok(hits.every(h => h.method === 'POST' && !h.body && !h.cookie), 'hosted: the pings are empty POSTs with no cookie');
        ok(await aboutNoteShown(page) === true, 'hosted: the About dialog says this copy sends the ping');
        await page.reload();
        await page.waitForTimeout(2500);
        ok(hits.length === 3 && hits[2].kind === 'launch', 'hosted: a reload sends launch again but not launch-day (' + hits.map(h => h.kind).join(', ') + ')');
        ok(errors.length === 0, 'hosted: no page errors' + (errors.length ? ': ' + errors[0] : ''));
        await ctx.close();
    }
    // Case 2: the same page from file://, a human browser.
    {
        const ctx = await newCtx(browser, { human: true });
        const page = await ctx.newPage();
        const pings = [];
        page.on('request', r => { if (/\/api\/hit\//.test(r.url())) pings.push(r.url()); });
        await page.goto('file://' + PAGE_FILE);
        await page.waitForTimeout(2500);
        ok(pings.length === 0, 'file://: no ping (' + pings.length + ')');
        ok(await aboutNoteShown(page) === false, 'file://: the About note stays hidden');
        await ctx.close();
    }
    // Case 3: hosted, but a headless browser.
    {
        const ctx = await newCtx(browser, { human: false });
        const hits = [];
        await serveHosted(ctx, hits);
        const page = await ctx.newPage();
        await page.goto('https://pandionplots.com/app/');
        await page.waitForTimeout(2500);
        ok(hits.length === 0, 'headless (webdriver): no ping (' + hits.length + ')');
        await ctx.close();
    }
} finally {
    await browser.close();
}
if (failures) { console.log('LAUNCH PING CHECK: ' + failures + ' failure(s)'); process.exit(1); }
console.log('LAUNCH PING CHECK: ALL GREEN');
