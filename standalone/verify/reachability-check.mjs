// Punch list items 2, 3 and 4: the teaching layer existed and could not be
// reached from the application.
//
//   2  the engine's first-run hint is permanently disabled by an early return
//      and the shell added no replacement, so click-anything-to-edit - the
//      product's defining capability and what the website leads with - was
//      announced nowhere passively. A student saw a finished chart and six
//      identical icon buttons and concluded the app draws one fixed chart.
//   3  Which graph?, Check graph, Glossary and Label parts were reachable only
//      through one unlabelled 29px "?" inside the engine toolbar, and
//      commandCatalog excluded the Help group so the palette could not find
//      them either. Grepping the shell for glossary / graphLint /
//      graphChooser / setInspectorSelection returned zero hits.
//   4  docs/user-guide.html (2.46 MB, 15 screenshots) was orphaned:
//      userGuidePath appeared in no template, so the engine's own "Open the
//      user guide" button never rendered, and Help had no entry.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(900);
}

// ------------------------------------------------------------------ item 2
console.log('case 1: the app says the chart is clickable, once');
const coach = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.coachReset();
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.switchChart(window.PS_SHELL.chart().id);
    await sleep(1200);
    const c = document.getElementById('ps-coach');
    const r = c.getBoundingClientRect();
    const svg = document.querySelector('#psroot svg');
    const sr = svg ? svg.getBoundingClientRect() : null;
    return { shown: !c.hidden, text: c.innerText,
             buttons: Array.from(c.querySelectorAll('button'))
                 .map(b => b.textContent),
             onScreen: r.width > 0 && r.top > 0 &&
                       r.top < window.innerHeight - 40,
             nearChart: sr ? Math.abs(r.left - sr.left) < 120 : false };
});
ok(coach.shown, 'a first-run cue appears once a chart has actually drawn');
ok(/editable/i.test(coach.text) && /Click a bar/.test(coach.text),
   `naming the capability in the reader's words ` +
   `("${coach.text.replace(/\n/g, ' ').slice(0, 100)}")`);
ok(coach.onScreen && coach.nearChart,
   'anchored at the chart rather than floating somewhere else');
ok(coach.buttons.length === 2 && /Show me how/.test(coach.buttons.join(' ')),
   `with a way to dismiss it and a way to go deeper ` +
   `(${JSON.stringify(coach.buttons)})`);

// Once dismissed it never returns, including across a reload. A cue that
// reappears is a nag, which is what the disabled engine hint was avoiding.
await page.click('#ps-coach-ok');
await page.waitForTimeout(200);
ok(await page.evaluate(() => document.getElementById('ps-coach').hidden),
   'dismissing it puts it away');
await page.reload();
await page.waitForTimeout(1400);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue').catch(() => {});
    await page.waitForTimeout(800);
}
ok(await page.evaluate(() => document.getElementById('ps-coach').hidden),
   'and it stays away across a reload, so it can never become a nag');

// Clicking the chart proves the point better than the note does.
const proved = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.coachReset();
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.switchChart(window.PS_SHELL.chart().id);
    await sleep(1200);
    const before = !document.getElementById('ps-coach').hidden;
    const host = document.getElementById('psroot');
    host.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, cancelable: true }));
    await sleep(150);
    return { before: before,
             after: !document.getElementById('ps-coach').hidden };
});
ok(proved.before && !proved.after,
   'and a click on the chart dismisses it, since that demonstrates the point');

// ------------------------------------------------------------------ item 3
console.log('case 2: the teaching panels are in the Help menu');
const helpMenu = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="help"]').click();
    await sleep(300);
    const m = document.getElementById('ps-appmenu');
    return Array.from(m.querySelectorAll('button')).map(b => ({
        label: b.textContent, command: b.getAttribute('data-command') }));
});
const labels = helpMenu.map(i => i.label).join(' | ');
for (const want of ['Which graph', 'Check my chart', 'Label the chart parts',
                    'Glossary']) {
    ok(new RegExp(want).test(labels),
       `Help offers "${want}" (${labels.length} chars of menu)`);
}
ok(/User guide/.test(labels),
   `and the user guide (${JSON.stringify(helpMenu.map(i => i.label))})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 3: and in the command palette, which excluded Help entirely');
const palette = await page.evaluate(() =>
    window.PS_SHELL.runCommandCatalog()
        .filter(c => c.group === 'Help')
        .map(c => c.command));
ok(palette.indexOf('help-chooser') !== -1 &&
   palette.indexOf('help-glossary') !== -1 &&
   palette.indexOf('user-guide') !== -1,
   `the palette can now find them (${JSON.stringify(palette)})`);

console.log('case 4: each one actually opens the engine panel');
for (const [command, tab] of [['help-chooser', 'graphChooser'],
                              ['help-lint', 'graphLint'],
                              ['help-glossary', 'glossary'],
                              ['help-anatomy', 'anatomy']]) {
    const opened = await page.evaluate(async ({ command, tab }) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.runCommand(command);
        await sleep(1100);
        const host = document.getElementById('psroot');
        const active = host.querySelector('[data-helpnav]')
            ? Array.from(host.querySelectorAll('[data-helpnav]'))
                .filter(b => b.style.fontWeight === '600')
                .map(b => b.getAttribute('data-helpnav'))[0]
            : null;
        return { navPresent: !!host.querySelector('[data-helpnav="' + tab + '"]'),
                 active: active };
    }, { command, tab });
    ok(opened.navPresent && opened.active === tab,
       `${command} lands on the ${tab} panel (active: ${opened.active})`);
}

// A data or layout workspace has to come back to the chart first: these are
// chart tools and silently doing nothing would be the old bug again.
const fromData = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await sleep(500);
    window.PS_SHELL.runCommand('help-lint');
    await sleep(1400);
    return { workspace: window.PS_SHELL.workspace(),
             active: Array.from(document.querySelectorAll(
                 '#psroot [data-helpnav]'))
                 .filter(b => b.style.fontWeight === '600')
                 .map(b => b.getAttribute('data-helpnav'))[0] };
});
ok(fromData.workspace === 'chart' && fromData.active === 'graphLint',
   `asking for a chart tool from the data workspace goes to the chart ` +
   `(${JSON.stringify(fromData)})`);

// ------------------------------------------------------------------ item 4
console.log('case 5: the user guide resolves to a copy that exists');
const guide = await page.evaluate(() => ({
    target: window.PS_SHELL.userGuideTarget(),
    devPage: !!document.querySelector('script[src*="graphbuilder2"]'),
    label: window.PS_SHELL.runCommandCatalog()
        .filter(c => c.command === 'user-guide')[0].label
}));
if (guide.devPage) {
    ok(/\.\.\/docs\/user-guide\.html/.test(guide.target.url) &&
       guide.target.online === false,
       `the repo layout uses its own local copy (${guide.target.url})`);
    ok(!/online/i.test(guide.label),
       `and the label does not claim otherwise ("${guide.label}")`);
} else {
    ok(/^https:/.test(guide.target.url) && guide.target.online === true,
       `the shipped single file has no local copy, so it goes to the ` +
       `published one (${guide.target.url})`);
    ok(/online/i.test(guide.label),
       `and the label says so BEFORE the click, since an app that promises ` +
       `nothing leaves the machine must not quietly contact a server ` +
       `("${guide.label}")`);
}
// The link opens rather than doing nothing, which is the whole complaint.
const openedTab = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let asked = null;
    const real = window.open;
    window.open = function (u) { asked = u; return null; };
    window.PS_SHELL.runCommand('user-guide');
    await sleep(300);
    window.open = real;
    return asked;
});
ok(openedTab && /user-guide|\/docs\//.test(openedTab),
   `and clicking it opens the guide (${openedTab})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('REACHABILITY CHECK PASS');
await browser.close();
