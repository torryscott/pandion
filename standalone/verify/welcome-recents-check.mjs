// The welcome's right column (Sep 22 2026, Torry's audit): the autosaved
// project heads Recent projects instead of sitting in the Start list, and
// the section hides when there is nothing to pick up. What this pins:
//   1. a first visit: the Start list holds its four doors and no Continue
//      card, Find open data sits with the datasets, the Recent section is
//      not drawn, and the datasets sit where it was;
//   2. after work and a reload: the Continue row is drawn inside the Recent
//      section, names the project, the Start list is still five, the
//      project's own list entry is not drawn a second time, and Continue
//      resumes the project;
//   3. mid-session, with another recent project: that project is listed
//      and the current one is not drawn twice.
// CONTROL (the parent branch): case 1 fails (no ps-recent-section).
//
// Usage: node standalone/verify/welcome-recents-check.mjs

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

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('filechooser', () => {});
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.evaluate(() => 0).catch(() => {});
const state = () => page.evaluate(() => {
    const vis = el => !!el && el.getClientRects().length > 0;
    const sec = document.getElementById('ps-recent-section');
    const cont = document.getElementById('ps-welcome-continue');
    const startCards = Array.from(document.querySelectorAll('.ps-launch-actions .ps-launch-action')).filter(vis).map(b => b.querySelector('strong').textContent);
    const listed = Array.from(document.querySelectorAll('#ps-recent-list .ps-recent-item'));
    return { welcome: document.getElementById('ps-welcome').style.display === 'flex', sectionDrawn: vis(sec), contDrawn: vis(cont), contInSection: !!sec && !!cont && sec.contains(cont), contMeta: document.getElementById('ps-welcome-continue-meta').textContent,
        startCards, listedNames: listed.map(b => b.querySelector('.ps-recent-name').textContent), drawnNames: listed.filter(vis).map(b => b.querySelector('.ps-recent-name').textContent),
        examplesTop: document.getElementById('ps-examples-section').getBoundingClientRect().top, findWithDatasets: (() => { const f = document.getElementById('ps-welcome-find'); return vis(f) && document.getElementById('ps-examples-section').contains(f); })(), startTop: document.querySelector('.ps-welcome-section h2').getBoundingClientRect().top, name: window.PS_SHELL.project.name };
});
// ---- 1. first visit
await page.goto(PAGE); await page.waitForTimeout(1100);
let s = await state();
ok(s.welcome && !s.sectionDrawn && !s.contDrawn && s.startCards.length === 4 && !s.startCards.includes('Continue autosaved project') && !s.startCards.includes('Find open data') && s.findWithDatasets, '1: a first visit draws four Start doors, Find open data among the datasets, no Continue card, and no Recent section (' + s.startCards.join(', ') + ')');
ok(Math.abs(s.examplesTop - s.startTop) < 30, '1: the examples sit level with the Start heading (' + Math.round(s.examplesTop) + ' vs ' + Math.round(s.startTop) + ')');
// ---- 2. work, then a fresh session
await page.click('[data-example="dose"]'); await page.waitForTimeout(1200);
// A new session: the welcome's dismissal is per tab session, so clear it.
await page.evaluate(() => sessionStorage.clear());
await page.reload(); await page.waitForTimeout(1300);
s = await state();
ok(s.welcome && s.sectionDrawn && s.contDrawn && s.contInSection && /Dose response study/.test(s.contMeta) && /saved/.test(s.contMeta), '2: a new session draws Continue inside Recent projects, naming the project (' + s.contMeta + ')');
ok(s.startCards.length === 4 && !s.startCards.includes('Continue autosaved project'), '2: the Start list is still four doors');
ok(s.listedNames.includes('Dose response study') && !s.drawnNames.includes('Dose response study'), '2: the project is in the recent list but not drawn a second time under its own Continue row');
await page.click('#ps-welcome-continue'); await page.waitForTimeout(400);
s = await state();
ok(!s.welcome && s.name === 'Dose response study', '2: Continue resumes the project');
// ---- 3. a second project, then the welcome mid-session
await page.evaluate(() => window.PS_SHELL.showWelcome(true)); await page.waitForTimeout(400);
await page.click('[data-example="practice"]'); await page.waitForTimeout(1200);
await page.evaluate(() => window.PS_SHELL.showWelcome(true)); await page.waitForTimeout(500);
s = await state();
ok(s.welcome && s.sectionDrawn && s.contDrawn && /Reaction time practice/.test(s.contMeta) && s.drawnNames.includes('Dose response study') && !s.drawnNames.includes('Reaction time practice'), '3: the other project is listed and the current one appears once, as the Continue row (' + s.drawnNames.join(', ') + ')');
await browser.close();
console.log(failures ? 'welcome-recents: FAIL (' + failures + ')' : 'welcome-recents: PASS');
process.exit(failures ? 1 : 0);
