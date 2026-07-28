// Punch list t4-03, t4-09, t4-11, t4-12, t4-16 and t4-17: the small honesty
// and hygiene items.
//
//   t4-03  no licence, copyright or citation surface anywhere in the app, while
//          about.html tells a citing researcher to use the number under Help IN
//          THE APP. Grepping the shell for cite / GPL / licence / copyright
//          returned nothing, and the portable HTML is the form most likely to
//          travel without the site attached.
//   t4-09  the start centre said "Open a project, recover recent work, or begin
//          from data" - written for someone who already owns projects.
//   t4-11  "Help Me Choose" was the one Title Case string in a sentence-cased
//          app, and it is the feature instructors name in course materials.
//   t4-12  about 5 KB of unused osprey path data plus a dead CSS rule, shipped
//          in every copy of a 3.4 MB download.
//   t4-16  Chart settings > Diagnostics wrote a localStorage flag and called a
//          function defined only in the jamovi module: live, persisted, inert.
//   t4-17  the LOESS confidence band approximates R's degrees of freedom, so
//          the curve matches and the band does not. Disclosed only in a README.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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

const here = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(path.resolve(here, '..', 'index.html'), 'utf8');

console.log('case 1: nothing dead ships in the download (t4-12)');
ok(!/<symbol id="ps-pandion-logo"/.test(src),
   'the never-used osprey symbol is gone');
ok(!/\.ps-datarow\s*\{/.test(src),
   'and so is the CSS rule no markup ever carried');

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(here, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(800);

console.log('case 2: the start centre says what this is (t4-09)');
const welcome = await page.evaluate(() =>
    document.getElementById('ps-welcome').innerText);
ok(!/Open a project, recover recent work, or begin from data/.test(welcome),
   'the copy written for someone who already owns projects is gone');
ok(/statistical figures/.test(welcome) && /editable/.test(welcome),
   `it says what the product is and what makes it different ` +
   `("${(welcome.match(/Create[^\n]*/) || [''])[0].slice(0, 90)}")`);
ok(/stays on this machine/.test(welcome),
   'and keeps the privacy promise the site leads with');

await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

console.log('case 3: the app carries its own licence and citation (t4-03)');
const about = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('about');
    await sleep(500);
    const d = document.getElementById('ps-about-dialog');
    return { open: d && getComputedStyle(d).display !== 'none',
             text: d ? d.innerText : '',
             version: (document.getElementById('ps-about-version') || {}).textContent,
             apa: (document.getElementById('ps-about-apa') || {}).textContent,
             buttons: Array.from(d.querySelectorAll('button')).map(b => b.textContent) };
});
ok(about.open, 'About is a dialog, not a 2.8-second toast');
ok(/GPL-3\.0/.test(about.text) && /Torry Scott Dennis/.test(about.text),
   'it states the licence and the copyright');
ok(/Pandion Plots \(Version/.test(about.apa || '') &&
   about.apa.indexOf(about.version) !== -1,
   `and gives a citation carrying the app's OWN version, which is the number ` +
   `about.html sends people here for ("${about.apa}")`);
ok(about.buttons.some(b => /APA/.test(b)) &&
   about.buttons.some(b => /BibTeX/.test(b)),
   `copyable in both forms a student is asked for ` +
   `(${JSON.stringify(about.buttons)})`);
// The version has to be ONE number: about.html tells a citing researcher to
// read it here, so a second, different number is worse than none.
ok(about.version === '3.0.0',
   `the app version matches the site's (${about.version})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 4: one capitalisation convention (t4-11)');
const casing = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('new-chart');
    await sleep(500);
    const card = document.querySelector('[data-analysis-help]');
    const label = card ? card.querySelector('strong').textContent : '';
    card.click();
    await sleep(700);
    const title = (document.getElementById('ps-help-choose-title') || {}).textContent;
    return { label, title };
});
ok(casing.label === 'Help me choose' && casing.title === 'Help me choose',
   `the gallery card and the dialog agree, in the app's own sentence case ` +
   `("${casing.label}" / "${casing.title}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('case 5: the Diagnostics checkbox does something (t4-16)');
const dbg = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const before = !!document.getElementById('ps-dbg-overlay');
    localStorage.setItem('gb2_debug_timing', '1');
    // The hook the ENGINE calls, which nothing in the shell used to define.
    const defined = typeof window.__gb2_buildDbgOverlay === 'function';
    if (defined) window.__gb2_buildDbgOverlay();
    await sleep(300);
    const o = document.getElementById('ps-dbg-overlay');
    const out = { before, defined, on: !!o,
                  text: o ? o.innerText.replace(/\n/g, ' ') : '',
                  ignored: o ? /ignore-html/.test(o.className) : false };
    localStorage.removeItem('gb2_debug_timing');
    if (window.__gb2_buildDbgOverlay) window.__gb2_buildDbgOverlay();
    await sleep(200);
    out.offAgain = !document.getElementById('ps-dbg-overlay');
    return out;
});
ok(!dbg.before, 'nothing is drawn while the flag is off');
ok(dbg.defined && dbg.on,
   'the shell defines the hook the engine already calls');
ok(/Render/.test(dbg.text) && /Payload build/.test(dbg.text) &&
   /rows/.test(dbg.text) && /Engine/.test(dbg.text),
   `and draws lines that mean something HERE ("${dbg.text.slice(0, 110)}")`);
ok(dbg.ignored,
   'marked ignore-html, so it can never ride into a copy or an export');
ok(dbg.offAgain, 'and switching it off removes it');

console.log('case 6: the LOESS band admits it is approximate (t4-17)');
const loess = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
    await sleep(800);
    const plain = window.PS_SHELL.buildPayload().missingNote;
    window.setOption('xyShowFit', true);
    window.setOption('xyFitType', 'loess');
    await sleep(700);
    const fitOnly = window.PS_SHELL.buildPayload().missingNote;
    window.setOption('xyShowCI', true);
    await sleep(700);
    const band = window.PS_SHELL.buildPayload().missingNote;
    window.setOption('xyFitType', 'linear');
    await sleep(700);
    return { plain, fitOnly, band,
             linear: window.PS_SHELL.buildPayload().missingNote };
});
ok(/approximate/.test(loess.band),
   `a drawn LOESS band says so on the chart, not only in a README ` +
   `("${loess.band}")`);
ok(!/approximate/.test(loess.fitOnly),
   'the curve alone does not, because the CURVE is not the approximation');
ok(!/approximate/.test(loess.linear) && !/approximate/.test(loess.plain),
   'and an OLS band never claims it');

console.log('case 7: an error is not announced like a confirmation (t4-22)');
const toast = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const host = document.getElementById('ps-toast');
    host.innerHTML = '';
    window.PS_SHELL.toastForTest('a plain confirmation', false);
    await sleep(150);
    const polite = { live: host.getAttribute('aria-live'),
                     role: host.getAttribute('role') };
    host.innerHTML = '';
    window.PS_SHELL.toastForTest('something went wrong', true);
    await sleep(150);
    const err = { live: host.getAttribute('aria-live'),
                  role: host.getAttribute('role') };
    // Past the 2.8s a confirmation gets: the message a user must not miss
    // used to be the one that left soonest.
    await sleep(3200);
    return { polite, err,
             errorSurvives: host.textContent.indexOf('went wrong') !== -1 };
});
ok(toast.polite.live === 'polite' && toast.polite.role === 'status',
   `a confirmation stays polite (${JSON.stringify(toast.polite)})`);
ok(toast.err.live === 'assertive' && toast.err.role === 'alert',
   `an error is assertive, on its own channel ` +
   `(${JSON.stringify(toast.err)})`);
ok(toast.errorSurvives,
   'and outlives a confirmation, because reading it is the whole point');

console.log('case 8: the menu bar has a keyboard model (t4-20)');
const menu = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const key = (k, target) => (target || document.activeElement)
        .dispatchEvent(new KeyboardEvent('keydown',
            { key: k, bubbles: true, cancelable: true }));
    const focused = () => (document.activeElement.getAttribute &&
        document.activeElement.getAttribute('data-ps-menu')) || null;
    document.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'F10', bubbles: true, cancelable: true }));
    await sleep(200);
    const entry = focused();
    key('ArrowRight'); await sleep(200);
    const right = focused();
    key('h'); await sleep(200);
    const typed = focused();
    key('End'); await sleep(200);
    const end = focused();
    key('Home'); await sleep(200);
    const home = focused();
    return { entry, right, typed, end, home };
});
ok(menu.entry === 'file',
   `F10 is an entry point to the bar (${menu.entry})`);
ok(menu.right && menu.right !== menu.entry,
   `Left/Right walks between menus (${menu.entry} -> ${menu.right})`);
ok(menu.typed === 'help',
   `typeahead jumps to a menu by its first letter (${menu.typed})`);
ok(menu.end === 'help' && menu.home === 'file',
   `and Home/End reach the ends (${menu.home} / ${menu.end})`);

console.log('case 9: an excluded cell is not called missing data (t4-19)');
const excl = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('freqplotbuilder');
    window.PS_SHELL.setRoles('freqplotbuilder', { var: 'condition' });
    await sleep(700);
    const clean = window.PS_SHELL.buildPayload().missingNote;
    window.PS_SHELL.setExcluded('condition', 0, true);
    await sleep(700);
    const excluded = window.PS_SHELL.buildPayload().missingNote;
    window.PS_SHELL.setExcluded('condition', 0, false);
    window.PS_SHELL.setExcluded('hours', 0, true);
    await sleep(700);
    const elsewhere = window.PS_SHELL.buildPayload().missingNote;
    window.PS_SHELL.setExcluded('hours', 0, false);
    return { clean, excluded, elsewhere };
});
ok(excl.clean === '', 'setup: a clean chart says nothing');
ok(/missing or excluded/.test(excl.excluded),
   `a hand-excluded cell is not attributed to missing data, which is the one ` +
   `wording a reader takes as reassurance ("${excl.excluded}")`);
ok(excl.elsewhere === '',
   `and an exclusion in a column this chart never reads changes nothing ` +
   `("${excl.elsewhere}")`);

// The scoping, which the first version of this fix got wrong: Compare Groups,
// Repeated Measures and Distribution restore the excluded value so the engine
// paints a slashed ghost at its coordinate. The removal is VISIBLE there and
// the count still means what it says, so the wording must NOT change - which
// is the M4l contract m1-shell case 9 pins, and which a blanket rewrite broke.
const ghosted = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // GENUINE missing data as well as an exclusion. Without a real missing
    // value the note is empty, and "an empty string contains no 'excluded'"
    // is true however the code behaves - which is exactly how the first
    // version of this check passed with the blanket rewrite still in place.
    window.PS_SHELL.loadTable('ghosts', ['grp', 'score'], [
        ['a', '4'], ['a', ''], ['b', '6'], ['b', '7']
    ], { grp: 'nominal', score: 'continuous' });
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'grp', yvar: 'score' });
    await sleep(800);
    const before = window.PS_SHELL.buildPayload().missingNote;
    window.PS_SHELL.setExcluded('score', 0, true);
    await sleep(800);
    return { before, after: window.PS_SHELL.buildPayload().missingNote };
});
ok(/missing values/.test(ghosted.before),
   `setup: a genuinely missing value produces a note ("${ghosted.before}")`);
ok(!/excluded/.test(ghosted.after),
   `and a module that SHOWS the removal keeps that wording, because its ` +
   `count still means what it says ("${ghosted.after}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('POLISH CHECK PASS');
await browser.close();
