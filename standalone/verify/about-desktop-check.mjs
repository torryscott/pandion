// The About dialog's privacy sentence tells the desktop truth (Sep 19 2026,
// Torry's option b on the update-check item): the packaged desktop app asks
// GitHub Releases for a newer version at launch and on Help > Check for
// updates, so its About says so instead of promising nothing is ever sent.
// The web app keeps its sentence: it sends nothing unless the opt-in daily
// check is on, which the Preferences copy already explains.
//
// Cases: (1) web app: the sentence is unchanged; (2) with the desktop bridge
// present (shimmed): the sentence names GitHub, the launch check and the
// Help menu path, and still says data is never sent. CONTROL (main): case
// 2 fails.
//
// Usage: node standalone/verify/about-desktop-check.mjs

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
async function aboutText(desktop) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1400, height: 900 } });
    await page.addInitScript((desktop) => {
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {}
        if (desktop) window.PS_DESKTOP = { version: '0.0.0-probe', platform: 'darwin', pickColor: () => Promise.resolve({ ok: false }), onOpenFile: () => {}, onMenuPaste: () => {} };
    }, desktop);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE); await page.waitForTimeout(800);
    // Through the real Help menu, so the shell's showAbout runs.
    await page.click('[data-ps-menu="help"]'); await page.waitForTimeout(300);
    await page.click('#ps-appmenu [data-app-command="about"]'); await page.waitForTimeout(400);
    const text = await page.evaluate(() => {
        const p = document.querySelector('#ps-about-dialog .ps-about-privacy');
        const open = document.getElementById('ps-about-dialog');
        return (open && open.style.display === 'flex' ? '' : '[dialog not open] ') + (p ? p.textContent.replace(/\s+/g, ' ').trim() : '');
    });
    await ctx.close();
    return { text, errors };
}
const web = await aboutText(false);
ok(/nothing is sent anywhere/.test(web.text) && !/GitHub/.test(web.text), '1: the web app keeps its sentence (' + web.text.slice(0, 60) + ')');
ok(web.errors.length === 0, '1: no page errors');
const desk = await aboutText(true);
ok(/GitHub/.test(desk.text) && /when it starts/.test(desk.text) && /Check for updates/.test(desk.text), '2: the desktop About names the launch check, GitHub and the Help path (' + desk.text.slice(0, 80) + ')');
ok(/never sent anywhere/.test(desk.text), '2: and still says the data is never sent');
ok(desk.errors.length === 0, '2: no page errors');
await browser.close();
console.log(failures ? 'about-desktop: FAIL (' + failures + ')' : 'about-desktop: PASS');
process.exit(failures ? 1 : 0);
