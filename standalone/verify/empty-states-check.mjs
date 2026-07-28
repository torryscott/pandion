// Punch list items 22 and 23: what the app says when it cannot draw.
//
//   22  the engine-load card told the user to run "bash standalone/build-dist.sh"
//       and the same branch fires in the shipped single file, where that is
//       nonsense the reader cannot act on; the render-failure card printed a
//       raw exception with no way to try again.
//   23  showMessage built its action buttons only when the message started with
//       "Assign ", so every module BUILD error - the harder failures - landed in
//       a branch with no button and one fixed sentence of generic advice. The
//       Likert many-levels refusal even names the right destination without
//       offering a way there.
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
const pagePath = process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html');
const pageUrl = 'file://' + pagePath;
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
    await page.waitForTimeout(400);
}

// ------------------------------------------------------- 23: every-value-missing
console.log('case 1: a column with nothing to plot offers the way in');
const nodata = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Two false starts worth recording, because both LOOK like this case and
    // neither reaches the branch under test:
    //  * a column of nothing but NA infers NOMINAL (no evidence either way),
    //    so the role never sticks and the "Assign ..." placeholder shows;
    //  * excluding every cell routes through the hidden-points path, so the
    //    chart still draws - empty, but drawn.
    // A DECLARED continuous type with no parseable values is the real thing,
    // and it is what a saved project or an .omv column arrives as.
    window.PS_SHELL.loadTable('empty', ['grp', 'value'], [
        ['a', 'NA'], ['a', 'NA'], ['b', 'NA'], ['b', 'NA']
    ], { grp: 'nominal', value: 'continuous' });
    window.PS_SHELL.setModule('distplotbuilder');
    window.PS_SHELL.setRoles('distplotbuilder', { var: 'value' });
    await sleep(700);
    const host = document.getElementById('psroot');
    return { text: host.innerText,
             buttons: Array.from(host.querySelectorAll('button'))
                 .map(b => ({ id: b.id, label: b.textContent })) };
});
ok(/has no usable/.test(nodata.text),
   'setup: the builder refuses with its specific reason');
ok(nodata.buttons.some(b => b.id === 'ps-empty-data'),
   `the harder failure gets a button, not just advice ` +
   `(${JSON.stringify(nodata.buttons.map(b => b.label))})`);
ok(nodata.buttons.some(b => /Look at value in the data/.test(b.label)),
   'and the button names the variable rather than describing a panel');
ok(/missing or excluded/.test(nodata.text),
   'the sentence is specific to this failure, not the generic fallback');

// The button carries out what the old advice merely recommended.
await page.click('#ps-empty-data');
await page.waitForTimeout(600);
const landed = await page.evaluate(() => ({
    workspace: window.PS_SHELL.workspace(),
    selection: window.PS_SHELL.gridSelection(),
    inspecting: document.getElementById('ps-variable-name').value
}));
ok(landed.workspace === 'data' && landed.inspecting === 'value',
   `it opens the data on that variable (${landed.workspace}, ` +
   `${landed.inspecting})`);
ok(landed.selection && landed.selection.focusCol === 'value',
   `with the cursor on the first missing cell ` +
   `(${JSON.stringify(landed.selection && landed.selection.focusRow)})`);

// ------------------------------------------------------- 23: a named destination
console.log('case 2: a refusal that names a destination offers a door to it');
const likert = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Case 1's last click left us in the DATA workspace, so the chart host is
    // parked and reading it here would report stale text.
    window.PS_SHELL.setWorkspace('chart');
    // A many-level NON-numeric battery: the one refusal that already told the
    // user where to go and gave them no way to get there.
    const rows = [];
    for (let i = 0; i < 40; i++)
        rows.push(['note-' + i, 'text-' + i, 'other-' + i]);
    window.PS_SHELL.loadTable('wide', ['q1', 'q2', 'q3'], rows);
    window.PS_SHELL.setModule('likertplotbuilder');
    window.PS_SHELL.setRoles('likertplotbuilder', { items: ['q1', 'q2', 'q3'] });
    await sleep(800);
    const host = document.getElementById('psroot');
    return { text: host.innerText,
             buttons: Array.from(host.querySelectorAll('button'))
                 .map(b => ({ id: b.id, label: b.textContent })) };
});
ok(/belong in the Frequencies analysis/.test(likert.text),
   'setup: the refusal names Frequencies');
ok(likert.buttons.some(b => b.id === 'ps-empty-module' &&
                            /Frequencies/.test(b.label)),
   `and now offers a way there (${JSON.stringify(
       likert.buttons.map(b => b.label))})`);
await page.click('#ps-empty-module');
await page.waitForTimeout(700);
ok(await page.evaluate(() => window.PS_SHELL.chart().module) === 'freqplotbuilder',
   'one click switches the analysis');

// The plain "Assign ..." case is unchanged: it already worked.
const assign = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', {});
    await sleep(600);
    const host = document.getElementById('psroot');
    return { text: host.innerText,
             ids: Array.from(host.querySelectorAll('button')).map(b => b.id) };
});
ok(/needs variables/.test(assign.text) &&
   assign.ids.indexOf('ps-empty-choose') !== -1 &&
   assign.ids.indexOf('ps-empty-hmc') !== -1,
   `the assignment placeholder keeps its own two buttons ` +
   `(${JSON.stringify(assign.ids)})`);

// ------------------------------------------------------- 22: render failure
console.log('case 3: a render failure can be retried');
const rf = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // A chart that genuinely draws, so the throw below is the only reason it
    // does not: with text columns the yvar role never sticks and the
    // ASSIGNMENT placeholder shows instead of the error boundary.
    window.PS_SHELL.loadTable('ok', ['grp', 'score'], [
        ['a', '4'], ['a', '5'], ['b', '6'], ['b', '7']
    ]);
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'grp', yvar: 'score' });
    await sleep(500);
    const real = window.GraphBuilder2.render;
    window.GraphBuilder2.render = function () {
        throw new Error('deliberate probe failure');
    };
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.switchChart(window.PS_SHELL.chart().id);
    await sleep(900);
    const host = document.getElementById('psroot');
    const out = { text: host.innerText,
                  labels: Array.from(host.querySelectorAll('button'))
                      .map(b => b.textContent) };
    window.GraphBuilder2.render = real;   // restore BEFORE the retry click
    return out;
});
ok(/could not be drawn/.test(rf.text),
   'setup: the error boundary caught the throw');
ok(rf.labels.some(l => /Try again/.test(l)),
   `the card offers a retry before it offers to reset anything ` +
   `(${JSON.stringify(rf.labels)})`);
ok(rf.labels.some(l => /Reset this chart/.test(l)) &&
   rf.labels.some(l => /Copy details/.test(l)),
   'alongside the reset and the copyable details');
const retried = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const btn = Array.from(document.querySelectorAll('#psroot button'))
        .filter(b => /Try again/.test(b.textContent))[0];
    btn.click();
    await sleep(900);
    return !!document.querySelector('#psroot svg');
});
ok(retried, 'and once the cause is gone, Try again draws the chart');

// ------------------------------------------------------- 22: engine load card
console.log('case 4: the engine-load card matches who is reading it');
const dev = await page.evaluate(() => {
    const host = document.getElementById('psroot');
    const real = window.GraphBuilder2;
    window.GraphBuilder2 = null;
    let out;
    try {
        window.PS_SHELL.switchChart(window.PS_SHELL.chart().id);
        out = { text: host.innerText,
                labels: Array.from(host.querySelectorAll('button'))
                    .map(b => b.textContent),
                devPage: !!document.querySelector('script[src*="graphbuilder2"]') };
    } finally { window.GraphBuilder2 = real; }
    return out;
});
// This probe runs against BOTH pages, and the whole point of the fix is that
// they say different things, so the assertion has to branch the same way.
if (dev.devPage) {
    ok(/development page/.test(dev.text) && /build-dist\.sh/.test(dev.text),
       'the dev page keeps the build instruction, which is actionable there');
} else {
    ok(!/build-dist\.sh/.test(dev.text) && !/repository/.test(dev.text),
       `the shipped file does not tell a student to run a build script ` +
       `("${dev.text.replace(/\n/g, ' ').slice(0, 120)}")`);
    ok(/download a fresh copy/.test(dev.text),
       'it names the two things that actually help: reload, then re-download');
}
ok(/did not start/.test(dev.text),
   'both say plainly that the engine did not start');
ok(dev.labels.some(l => /Reload the page/.test(l)),
   `and both offer the reload the item says was missing ` +
   `(${JSON.stringify(dev.labels)})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('EMPTY STATES CHECK PASS');
await browser.close();
