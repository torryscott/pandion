// Punch list t3-55 and t3-56: the two Help surfaces that were decoration.
//
//   t3-55  Thirteen hand-written shortcut rows that had already drifted from
//          the app: no Cmd+N, no Cmd+comma, no Cmd+F, none of the level or
//          formula keys, one row conflating the grid's TSV copy with
//          copy-as-image, and "Undo / redo" as ONE line for what is
//          deliberately three arbitrated histories. And the sheet itself had
//          no keyboard route: no F1, no bare ?, and commandCatalog excluded it
//          from the palette, so the place you go when you cannot remember
//          where something is could not find the sheet that answers that.
//   t3-56  The app contained ZERO external links of any kind, so a stuck
//          student's only escape hatch was their instructor. No release notes
//          either, so a student on an old copy had no way to tell.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

console.log('case 1: the sheet has a keyboard route of its own (t3-55)');
await page.keyboard.press('F1');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       getComputedStyle(document.getElementById('ps-shortcuts-dialog'))
           .display !== 'none'),
   'F1 opens it');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       getComputedStyle(document.getElementById('ps-shortcuts-dialog'))
           .display === 'none'),
   'and Escape closes it');
// Bare ? was the obvious second key, and the ENGINE already binds it at
// capture phase to open the chart's own help panel. Taking it would have been
// a steal, and the engine's panel is the better answer when a chart is what
// you are looking at - so this asserts the key still does the engine's job.
await page.keyboard.press('Shift+Slash');
await page.waitForTimeout(700);
const qKey = await page.evaluate(() => ({
    sheet: getComputedStyle(document.getElementById('ps-shortcuts-dialog'))
        .display !== 'none',
    engine: Array.from(document.querySelectorAll(
        '.graphbuilder2-host [data-helpnav]')).length
}));
ok(!qKey.sheet && qKey.engine > 0,
   `bare ? still opens the chart's own help panel rather than being stolen ` +
   `(${qKey.engine} tabs)`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('F1');
await page.waitForTimeout(400);

console.log('case 2: it is READ from the menus, so it cannot drift');
const sheet = await page.evaluate(() => {
    const body = document.getElementById('ps-shortcuts-body');
    const rows = Array.from(body.querySelectorAll('.ps-shortcut-list span'))
        .map((s, i, a) => [s.textContent,
             s.nextElementSibling ? s.nextElementSibling.textContent : '']);
    return { text: body.innerText,
             heads: Array.from(body.querySelectorAll('.ps-shortcut-head'))
                 .map(h => h.textContent),
             rows };
});
// The keys the old sheet had already lost. Each is genuinely bound in the app.
for (const [what, key] of [['New project', 'Cmd/Ctrl + N'],
                           ['Preferences', 'Cmd/Ctrl + ,'],
                           // Workspace-scoped since Cmd/Ctrl+F was routed by
                           // findScope(): in Charts it finds a chart setting,
                           // in Data it finds data, and the row says which.
                           ['Find (in data|a chart setting)', 'Cmd/Ctrl + F']]) {
    const hit = sheet.rows.find(r => new RegExp(what, 'i').test(r[0]));
    ok(hit && hit[1].replace(/\s+/g, '') === key.replace(/\s+/g, ''),
       `${what} is listed with its real key (${hit ? hit[1] : 'MISSING'})`);
}
// These have no menu entry to be read from, which is exactly why the authored
// half of the sheet exists.
ok(/Alt \+ Up \/ Down/.test(sheet.text),
   'the level-reordering keys are there, which no menu declares');
ok(/Cmd\/Ctrl \+ Enter/.test(sheet.text),
   'and the formula key');

// The conflation: one row for two genuinely different copies.
const copyRows = sheet.rows.filter(r => /copy/i.test(r[0]));
ok(copyRows.some(r => /tab-separated/i.test(r[0])),
   `the grid's copy says what it copies (${JSON.stringify(
       copyRows.map(r => r[0]))})`);
ok(!copyRows.some(r => /paste/i.test(r[0])),
   'and copy and paste are no longer one row saying "Copy / paste"');

// The three histories, which one "Undo / redo" row hid.
ok(/in Data/.test(sheet.text) && /Layouts/.test(sheet.text) &&
   /styling history/.test(sheet.text),
   'undo is explained as the three arbitrated histories it actually is');

console.log('case 3: the chart keys are pointed at, not copied');
ok(/Editing a chart/.test(sheet.heads.join('|')),
   `there is a section for them (${JSON.stringify(sheet.heads)})`);
ok(sheet.rows.some(r => /chart's own help panel/i.test(r[0]) && r[1] === '?'),
   `and it names the engine's key, which is what the item was about: the ` +
   `chart keys lived ONLY in the engine's own table`);
const hasBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll(
        '#ps-shortcuts-body .ps-shortcut-note button'));
    return b.length === 1 && b[0].textContent;
});
ok(!!hasBtn,
   `with a button that opens that table rather than duplicating it ("${hasBtn}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 4: the palette can find the sheet it is the answer to');
const palette = await page.evaluate(() => {
    const cat = window.PS_SHELL.runCommandCatalog();
    return cat.map(c => c.command);
});
ok(palette.indexOf('shortcuts') !== -1 && palette.indexOf('about') !== -1,
   'Keyboard shortcuts and About are in the command palette');
ok(palette.indexOf('command-palette') === -1,
   'and only the palette itself is still excluded, which is the one command ' +
   'that cannot mean anything from inside it');

console.log('case 5: there is somewhere to go (t3-56)');
const help = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="help"]').click();
    await sleep(300);
    const items = Array.from(
        document.querySelectorAll('#ps-appmenu button')).map(b => ({
            label: b.textContent.trim(),
            command: b.getAttribute('data-app-command') }));
    document.querySelector('[data-ps-menu="help"]').click();
    return items;
});
for (const cmd of ['user-guide', 'site-gallery', 'site-home', 'whats-new']) {
    const hit = help.find(i => i.command === cmd);
    ok(!!hit, `Help offers ${cmd} ("${hit ? hit.label : 'MISSING'}")`);
}
// An app whose whole promise is that nothing leaves the machine must say so
// before it opens a connection.
for (const cmd of ['site-gallery', 'site-home']) {
    const hit = help.find(i => i.command === cmd);
    ok(/\(online\)/.test(hit.label),
       `and ${cmd} names itself as leaving the machine ("${hit.label}")`);
}

const opened = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const seen = [];
    const real = window.open;
    window.open = (u) => { seen.push(u); return null; };
    window.PS_SHELL.runCommand('site-gallery');
    await sleep(400);
    const toast = document.getElementById('ps-toast').textContent;
    window.open = real;
    return { seen, toast };
});
ok(opened.seen.length === 1 && /gallery/.test(opened.seen[0]),
   `the gallery entry opens the gallery (${opened.seen[0]})`);
ok(/pandionplots\.com/.test(opened.toast),
   `and says where it went, out loud ("${opened.toast.trim()}")`);

console.log('case 6: release notes, pinned to the version they describe');
await page.evaluate(() => window.PS_SHELL.runCommand('whats-new'));
await page.waitForTimeout(400);
const news = await page.evaluate(() => ({
    open: getComputedStyle(document.getElementById('ps-whatsnew-dialog'))
        .display !== 'none',
    text: document.getElementById('ps-whatsnew-body').innerText,
    versions: Array.from(document.querySelectorAll('#ps-whatsnew-body strong'))
        .map(s => s.textContent),
    current: !!document.querySelector('#ps-whatsnew-body .ps-rel-current'),
    appVersion: document.getElementById('ps-about-version')
}));
ok(news.open && news.versions.length >= 1,
   `What's new lists releases (${JSON.stringify(news.versions)})`);
// The staleness guard. Authored notes drift; a probe that fails when they do
// is the only thing that stops it happening quietly.
const shipped = fs.readFileSync(
    path.resolve(new URL('.', import.meta.url).pathname, '..', 'js/ps-shell.js'),
    'utf8').match(/APP_VERSION = "([^"]+)"/)[1];
ok(news.versions[0] === 'Version ' + shipped,
   `and the newest entry is the version actually shipping ` +
   `(${news.versions[0]} vs ${shipped})`);
ok(news.current,
   'which the dialog marks, so a student can tell what they are running');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 7: chart help is honest on an undrawn chart');
// Torry's ruling, Jul 29 2026. The four chart-help entries open panels
// that live in a drawn chart's toolbar. On a chart with no variables the
// old behavior was the worst of both: the commands looked available,
// polled for a toolbar that could not exist, then toasted "Open a chart
// first" - false, a chart tab was open. Now: "Which graph should I use?"
// stays enabled and opens Help me choose (the pre-chart form of exactly
// that question); the three that operate ON a drawn chart are disabled
// and say what is missing.
{
    await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
    await page.waitForTimeout(700);
    const readHelp = () => page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('[data-ps-menu="help"]').click();
        await s(350);
        const m = document.getElementById('ps-appmenu');
        const grab = (cmd) => {
            const b = m.querySelector('[data-app-command="' + cmd + '"]');
            return b ? { off: b.disabled,
                         tip: b.getAttribute('data-tip') || '' } : null;
        };
        const out = {
            chooser: grab('help-chooser'),
            lint: grab('help-lint'),
            anatomy: grab('help-anatomy'),
            glossary: grab('help-glossary'),
        };
        document.querySelector('[data-ps-menu="help"]').click();
        await s(150);
        return out;
    });
    const empty = await readHelp();
    ok(!empty.chooser.off,
       'on an empty chart, "Which graph should I use?" stays available');
    ok(empty.lint.off && /Assign variables/.test(empty.lint.tip),
       `while "Check my chart" is off and says what is missing ` +
       `("${empty.lint.tip}")`);
    ok(empty.anatomy.off && empty.glossary.off,
       'and so are Label the chart parts and the Glossary');
    // The reroute: the enabled entry opens Help me choose, not a dead end.
    await page.evaluate(() => window.PS_SHELL.runCommand('help-chooser'));
    await page.waitForTimeout(400);
    ok(await page.locator('#ps-help-choose').isVisible(),
       'and picking it opens Help me choose instead of a dead end');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // Drawn chart: everything comes alive.
    await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score' }));
    await page.waitForTimeout(2600);
    const drawn = await readHelp();
    ok(!drawn.chooser.off && !drawn.lint.off && !drawn.anatomy.off &&
       !drawn.glossary.off,
       'once the chart draws, all four help entries are live');
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('HELP CHECK PASS');
await browser.close();
