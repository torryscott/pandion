// Punch list item 20: the one sample dataset misrepresented Repeated Measures
// and could not demonstrate Likert at all.
//
// loadSample pre-assigned rmplotbuilder: { measures: ["score", "hours"] } on a
// dose-response dataset, so switching the Analysis dropdown - the fastest way
// to explore anything - plotted a test score and a study-hours count as two
// occasions of the same measurement, with Cousineau-Morey within-subject error
// bars over the top. The app's own example demonstrated a textbook
// misconception. Likert got {} and an empty placeholder, because no sample
// variable had a shared response scale.
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

console.log('case 1: three examples are offered, each saying what it suits');
const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-example]')).map(b => ({
        id: b.getAttribute('data-example'),
        title: (b.querySelector('strong') || {}).textContent,
        suits: (b.querySelectorAll('.ps-template-copy span')[0] || {}).textContent
    })));
ok(cards.length === 3,
   `the start centre offers three example datasets (${cards.length})`);
ok(cards[0].id === 'dose',
   'the dose-response study is still first, so every existing path is unmoved');
ok(cards.some(c => /Repeated Measures/.test(c.suits || '')) &&
   cards.some(c => /Likert/.test(c.suits || '')),
   `and between them they name the two analyses the old one could not show ` +
   `(${JSON.stringify(cards.map(c => c.suits))})`);

if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(500);
}

console.log('case 2: the dose study no longer claims to be repeated measures');
const dose = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    return { rm: JSON.stringify(c.roles.rmplotbuilder || {}),
             likert: JSON.stringify(c.roles.likertplotbuilder || {}),
             cg: JSON.stringify(c.roles.plotbuilder || {}) };
});
ok(dose.rm === '{}',
   `no measures are pre-assigned for Repeated Measures on a between-subjects ` +
   `dataset (${dose.rm})`);
ok(/condition/.test(dose.cg) && /score/.test(dose.cg),
   `while the analyses it does suit are still ready to explore (${dose.cg})`);

// Switching the dropdown is the path the item names, so drive exactly that.
const switched = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('rmplotbuilder');
    await sleep(800);
    const host = document.getElementById('psroot');
    return { text: host.innerText,
             svg: !!host.querySelector('svg'),
             buttons: Array.from(host.querySelectorAll('button'))
                 .map(b => b.textContent) };
});
ok(!switched.svg,
   'switching to Repeated Measures draws no chart rather than a false one');
ok(/nothing that would suit it/.test(switched.text),
   `it says the dataset cannot show this ("${switched.text
       .replace(/\n/g, ' ').slice(0, 130)}")`);
ok(switched.buttons.some(b => /Reaction time practice/.test(b)),
   `and offers the example that can (${JSON.stringify(switched.buttons)})`);

console.log('case 3: taking the offer lands a real repeated-measures chart');
await page.click('#ps-empty-example');
await page.waitForTimeout(1200);
const rm = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = window.PS_SHELL.buildPayload();
    return { project: window.PS_SHELL.project.name,
             module: c.module,
             roles: JSON.stringify(c.roles.rmplotbuilder || {}),
             cells: p && p.bars ? p.bars.length : 0,
             xcats: p ? p.xCategories : null,
             svg: !!document.querySelector('#psroot svg') };
});
ok(/Reaction time practice/.test(rm.project) && rm.module === 'rmplotbuilder',
   `the example opens on the analysis it was offered for (${rm.module})`);
ok(rm.xcats && rm.xcats.length === 4,
   `with four genuine occasions of ONE measurement ` +
   `(${JSON.stringify(rm.xcats)})`);
ok(/betweenVar/.test(rm.roles) && /group/.test(rm.roles),
   `and a real between-subjects factor (${rm.roles})`);
ok(rm.svg && rm.cells === 8,
   `and it draws (${rm.cells} cells)`);

// Replacing the project is destructive, so it has to ride item 13. A pristine
// example has no WORK in it, so item 13's second gate correctly stays quiet -
// the first version of this check asserted an offer that should not have been
// made, and item 13's own probe records why that gate exists. So: put work in,
// then take the offer, and require it back.
const offered = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-toast').innerHTML = '';
    window.PS_SHELL.project.name = 'My real analysis';
    window.PS_SHELL.addChart('plotbuilder');       // work: a second document
    await sleep(700);
    window.PS_SHELL.setModule('likertplotbuilder');
    await sleep(700);
    const btn = document.getElementById('ps-empty-example');
    if (!btn) return { offeredExample: false };
    btn.click();
    await sleep(1000);
    const pill = Array.from(document.querySelectorAll('#ps-toast .ps-toast-item'))
        .filter(n => /Undo/.test(n.textContent))[0];
    return { offeredExample: true, pill: pill ? pill.textContent : '',
             name: window.PS_SHELL.project.name };
});
ok(offered.offeredExample && /Course feedback/.test(offered.pill || ''),
   `replacing a project that HAS work offers it straight back ` +
   `("${(offered.pill || '').slice(0, 80)}")`);
const restored = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#ps-toast button').click();
    await sleep(900);
    return window.PS_SHELL.project.name;
});
ok(restored === 'My real analysis',
   `and taking it restores the work (${restored})`);

console.log('case 4: the feedback survey can actually demonstrate Likert');
const lk = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadSample('feedback');
    await sleep(1000);
    const c = window.PS_SHELL.chart();
    const p = window.PS_SHELL.buildPayload();
    return { module: c.module,
             items: JSON.stringify(c.roles.likertplotbuilder || {}),
             levels: p ? p.likertLevels : null,
             cells: p && p.likertCells ? p.likertCells.length : 0,
             means: p && p.likertMeans ? p.likertMeans.length : 0,
             svg: !!document.querySelector('#psroot svg') };
});
ok(lk.module === 'likertplotbuilder',
   `it opens on Likert (${lk.module})`);
ok(lk.levels && lk.levels.join(',') === '1,2,3,4,5',
   `on ONE shared 1-5 response scale, every point of it used ` +
   `(${JSON.stringify(lk.levels)})`);
ok(lk.means === 5 && lk.cells > 0 && lk.svg,
   `and draws all five items (${lk.means} items, ${lk.cells} cells)`);

console.log('case 5: an example never demonstrates what it cannot');
const audit = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    for (const id of ['dose', 'practice', 'feedback']) {
        window.PS_SHELL.loadSample(id);
        await sleep(400);
        const roles = window.PS_SHELL.chart().roles || {};
        out.push({ id: id, roles: roles,
                   name: window.PS_SHELL.project.name });
    }
    return out;
});
// The invariant: every module with pre-assigned roles must BUILD a chart.
// A pre-assignment that produces a placeholder is a claim the data cannot keep.
for (const ex of audit) {
    const built = await page.evaluate(async (id) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.loadSample(id);
        await sleep(400);
        const roles = window.PS_SHELL.chart().roles || {};
        const bad = [];
        for (const mod of Object.keys(roles)) {
            if (!Object.keys(roles[mod] || {}).length) continue;
            window.PS_SHELL.setModule(mod);
            await sleep(350);
            const raw = window.PS_SHELL.buildRaw();
            if (!raw || raw.placeholder) bad.push(mod + ': ' +
                String((raw || {}).placeholder).slice(0, 60));
        }
        return bad;
    }, ex.id);
    ok(built.length === 0,
       `${ex.name}: every analysis it pre-assigns actually draws ` +
       `(${JSON.stringify(built)})`);
}

// ---------------------------------------------------------------------------
// Found while building the examples, and it affects real user data rather than
// just the fixture: a numeric-coded battery's MASTER response scale was the
// union of each item's levels in ITEM order, so a level used only by a later
// item landed at the end. A 1-5 battery whose first item never scores 1 came
// out 2,3,4,5,1 and the diverging stack drew strongly-disagree on the agree
// side. Kept as its own case with data built to force it.
console.log('case 6: a numeric battery orders its response scale ascending');
const scale = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // q1 spans 3-5 only; the 1 and the 2 arrive in q2 and q3.
    window.PS_SHELL.loadTable('battery', ['q1', 'q2', 'q3'], [
        ['5', '4', '2'], ['4', '3', '1'], ['3', '2', '3'],
        ['5', '1', '4'], ['4', '5', '2'], ['3', '3', '5']
    ], { q1: 'ordinal', q2: 'ordinal', q3: 'ordinal' });
    window.PS_SHELL.setModule('likertplotbuilder');
    window.PS_SHELL.setRoles('likertplotbuilder', { items: ['q1', 'q2', 'q3'] });
    await sleep(800);
    const p = window.PS_SHELL.buildPayload();
    return p ? p.likertLevels : null;
});
ok(scale && scale.join(',') === '1,2,3,4,5',
   `the shared scale ascends even when the first item does not span it ` +
   `(${JSON.stringify(scale)})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('EXAMPLES CHECK PASS');
await browser.close();
