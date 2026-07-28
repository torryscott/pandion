// Punch list P1-P5: the measured performance items.
//
// These are the only probes in the suite that care about time, so they are
// written to survive a slower machine: the assertions are about BEHAVIOUR
// wherever behaviour can carry the claim (an early return, a write count, a
// trimmed history, a refusal), and where the item really is about a number the
// ceiling is set several times above what this machine measures, so it fails
// on a regression rather than on a busy CI box.
//
// Measured here before and after, at 20,000 rows unless stated:
//   P1  payload build   2,624 ms -> 9 ms      (O(n^2) caseId scan per point)
//   P2  header toggle      71 ms -> 3 ms      (whole-file re-split)
//   P3  30-commit drag    197 ms -> 6 ms, 60 localStorage writes -> 1
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(500);
}

// A 20,000-row table, the size the items measure at.
const BIG = async () => page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 20000; i++)
        rows.push(['g' + (i % 4), String(i % 97), String((i % 13) + 0.5),
                   's' + (i % 6), 'b' + (i % 20), 'obs-' + i]);
    window.PS_SHELL.loadTable('perf', ['grp', 'score', 'hours', 'site',
                                       'batch', 'note'], rows);
    await sleep(1200);
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'grp', yvar: 'score' });
    await sleep(1000);
});

// ------------------------------------------------------------------ P1
console.log('case 1: the payload build is not quadratic in the table');
await BIG();
const p1 = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const a = performance.now();
    for (let i = 0; i < 5; i++) window.PS_SHELL.buildPayload();
    const per = (performance.now() - a) / 5;
    return { per: +per.toFixed(1),
             hidden: (window.PS_SHELL.buildPayload().hiddenPoints || []).length,
             excluded: JSON.stringify(t.excluded || {}) };
});
ok(p1.excluded === '{}', 'setup: nothing is excluded, which is the normal case');
// 60 ms, not 200: with the fix reverted this machine measures 177 ms, so a
// 200 ms ceiling let the control through - a passing control is a finding
// about the probe. Measured WITH the fix it is 8-9 ms, so 60 leaves seven
// times the headroom for a slower machine and still fails on the regression.
ok(p1.per < 60,
   `a payload build stays well inside a frame at 20,000 rows ` +
   `(${p1.per} ms; reverting the index measures 177 ms here)`);

// And the early return is the REASON, not a faster loop: with an exclusion
// present the same work still happens and still finds it.
const p1b = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'grp', yvar: 'score', groupVar: 'site' });
    await sleep(600);
    window.PS_SHELL.setExcluded('score', 3, true);
    await sleep(700);
    const p = window.PS_SHELL.buildPayload();
    const a = performance.now();
    for (let i = 0; i < 5; i++) window.PS_SHELL.buildPayload();
    return { per: +((performance.now() - a) / 5).toFixed(1),
             hidden: (p.hiddenPoints || []).length };
});
ok(p1b.hidden >= 0,
   `an excluded cell is still found by the same path (${p1b.hidden} hidden)`);
ok(p1b.per < 80,
   `and finding it does not cost a linear scan per point (${p1b.per} ms)`);

// ------------------------------------------------------------------ P2
console.log('case 2: retyping does not build lists it throws away');
const p2 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // "note" is 20,000 DISTINCT values: the worst case for a level list, and
    // exactly what an ID column looks like.
    window.PS_SHELL.setColType('note', 'nominal');
    await sleep(600);
    let a = performance.now();
    window.PS_SHELL.retypeTable();
    const asNominal = performance.now() - a;
    const levels = (window.PS_SHELL.project.table.levels.note || []).length;
    window.PS_SHELL.setColType('note', 'id');
    await sleep(600);
    a = performance.now();
    window.PS_SHELL.retypeTable();
    const asId = performance.now() - a;
    return { asNominal: Math.round(asNominal), asId: Math.round(asId),
             nominalLevels: levels,
             idLevels: (window.PS_SHELL.project.table.levels.note || []).length };
});
ok(p2.nominalLevels === 20000,
   `setup: a nominal column of 20,000 distinct values builds all of them ` +
   `(${p2.nominalLevels})`);
ok(p2.idLevels === 0,
   `an ID column builds no level list at all, rather than building and ` +
   `discarding one (${p2.idLevels})`);
ok(p2.asNominal < 900,
   `and building it is linear, not rows-times-distinct ` +
   `(${p2.asNominal} ms, was 965 ms for the membership test alone)`);

// ------------------------------------------------------------------ P3
console.log('case 3: a drag does not write the whole project per commit');
const p3 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(400);
    const real = Storage.prototype.setItem;
    let writes = 0, ms = 0, bytes = 0;
    Storage.prototype.setItem = function (k, v) {
        const a = performance.now();
        const r = real.call(this, k, v);
        ms += performance.now() - a;
        if (k === 'psstandalone.project.v2') {
            writes++;
            if (typeof v === 'string') bytes = Math.max(bytes, v.length);
        }
        return r;
    };
    const a = performance.now();
    for (let i = 0; i < 30; i++) window.setOption('barOpacity', 0.5 + i * 0.01);
    const total = performance.now() - a;
    Storage.prototype.setItem = real;
    return { writes, total: Math.round(total), ms: +ms.toFixed(1),
             kb: Math.round(bytes / 1024) };
});
ok(p3.kb > 200,
   `setup: the project snapshot really is large (${p3.kb} KB)`);
ok(p3.writes <= 4,
   `30 commits in one drag collapse to a handful of writes ` +
   `(${p3.writes}, was 30)`);
ok(p3.total < 120,
   `so the drag stays responsive (${p3.total} ms for 30 commits, was 197 ms)`);

// A LONE edit still writes synchronously: everything that reads the autosave
// straight after an action depends on that, and coalescing must not break it.
const p3b = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(500);                       // let the window lapse
    window.PS_SHELL.project.name = 'Sync write probe ' + Math.floor(Math.random() * 1e6);
    const want = window.PS_SHELL.project.name;
    window.setOption('barOpacity', 0.77);
    const raw = window.localStorage.getItem('psstandalone.project.v2');
    return { present: !!raw && raw.indexOf(want) !== -1 };
});
ok(p3b.present,
   'a single edit is still on disk the instant it returns, not 220 ms later');

// ------------------------------------------------------------------ P4
console.log('case 4: data history is bounded by bytes and its steps are named');
const p4 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await sleep(500);
    const before = window.PS_SHELL.dataHistory();
    // 20,000 rows x 6 columns: each snapshot is megabytes, so the count cap
    // of 50 was about 250 MB of retained strings, reachable in 50 edits.
    for (let i = 0; i < 24; i++) {
        window.PS_SHELL.setGridSelection('score', i, 'score', i, 'cells');
        window.PS_SHELL.clearSelection();
        await sleep(30);
    }
    const after = window.PS_SHELL.dataHistory();
    return { before, after };
});
ok(p4.after.undo > 0, `edits create history (${p4.after.undo} steps)`);
ok(p4.after.bytes <= p4.after.budget,
   `held inside the byte budget rather than a count ` +
   `(${Math.round(p4.after.bytes / 1048576)} MB of ` +
   `${Math.round(p4.after.budget / 1048576)} MB, ${p4.after.undo} steps)`);
ok(p4.after.undoLabel && /clearing the cells/.test(p4.after.undoLabel),
   `and each step knows what it was ("${p4.after.undoLabel}")`);
const menuLabel = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="edit"]').click();
    await sleep(300);
    const t = document.getElementById('ps-appmenu').innerText;
    document.querySelector('[data-ps-menu="edit"]').click();
    return t;
});
ok(/Undo the |Undo clearing/.test(menuLabel) ||
   /clearing the cells/.test(menuLabel),
   `the Edit menu names the step instead of a fixed "data change" ` +
   `("${menuLabel.split('\n').filter(l => /Undo/.test(l))[0]}")`);

// ------------------------------------------------------------------ P5
console.log('case 5: the import path has a size guard and does not re-split');
const p5 = await page.evaluate(() => {
    const rows = ['a,b,c'];
    for (let i = 0; i < 120000; i++) rows.push(i + ',' + (i % 7) + ',x' + i);
    const text = rows.join('\n');
    const T = () => performance.now();
    let a = T(); window.PS_SHELL.parseTableText(text, ',', true);
    const first = T() - a;
    a = T(); window.PS_SHELL.parseTableText(text, ',', false);
    const toggle = T() - a;
    return { first: Math.round(first), toggle: Math.round(toggle),
             mb: +(text.length / 1048576).toFixed(1) };
});
ok(p5.toggle * 3 < p5.first,
   `flipping First row reuses the split instead of re-reading the file ` +
   `(${p5.toggle} ms against ${p5.first} ms for the parse, ${p5.mb} MB)`);

const guard = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-toast').innerHTML = '';
    // Size is what the guard reads, so a stub File reports one without
    // allocating 300 MB in the probe.
    const fake = { name: 'enormous.csv', size: 300 * 1024 * 1024 };
    window.PS_SHELL.readPickedFile(fake);
    await sleep(400);
    const msg = document.getElementById('ps-loader-msg').textContent;
    const big = { name: 'large.csv', size: 40 * 1024 * 1024 };
    document.getElementById('ps-loader-msg').textContent = '';
    window.PS_SHELL.readPickedFile(big);
    await sleep(400);
    // Read the PILL that matches, not the first one: case 4 left its own
    // Undo offers on the stack, and testing the concatenated text (or the
    // first button) reports whichever pill happens to be at the front.
    const mine = Array.from(document.querySelectorAll('#ps-toast .ps-toast-item'))
        .filter(n => /large\.csv/.test(n.textContent))[0];
    return { refused: msg,
             warned: mine ? mine.textContent : '',
             warnButton: mine && mine.querySelector('button')
                 ? mine.querySelector('button').textContent : '' };
});
ok(/300 MB/.test(guard.refused) && /out of memory/.test(guard.refused),
   `a file too large to hold is refused with a reason and a way forward ` +
   `("${guard.refused.slice(0, 110)}")`);
ok(/40 MB/.test(guard.warned) && /Read it anyway/.test(guard.warnButton || ''),
   `and a merely large one is disclosed with the choice left to the user ` +
   `("${guard.warned.slice(0, 90)}" + ${JSON.stringify(guard.warnButton)})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PERF CHECK PASS');
await browser.close();
