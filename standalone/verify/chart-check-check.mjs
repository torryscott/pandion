// The chart-check receipt, and the lint rule it exists to carry.
//
// THE BUG IT PINS. "+ Add > Sig. bracket" drops a bracket whose label is
// "*" with autoPValue off and no anchors, so the asterisk is a placeholder
// glyph that no test produced. It exports into the figure, and before this
// change "Check my chart" reported "Looks good. No common pitfalls found."
// - the app's own honesty checker certifying a fabricated significance
// claim. Nothing anywhere else said a word either: not the status bar, not
// a toast, not the chart. Same silence for a bar chart truncated above
// zero, which the lint HAS always caught but only when asked, three levels
// into a menu nobody opens mid-flow.
//
// TWO HALVES, both asserted here:
//   1. engine - a `brackclaim` rule that fires on a significance label with
//      no computed test behind it, and provably does NOT fire on brackets
//      the Statistics panel placed, nor on a plain typed annotation.
//   2. shell  - a status-bar receipt that asks the engine (through the
//      host hook __gb2_graphLint, so there is one judgment and no second
//      copy to drift) after each render and puts the answer where the user
//      is already reading "84 cases - 6 groups".
//
// CONTROL. Run this with PS_PAGE pointed at a page carrying the UNPATCHED
// engine and case 2 fails at "Looks good", which is the whole point:
//     node standalone/verify/chart-check-check.mjs                 # fails
//     PS_PAGE=standalone/proto-lint.html node ...                  # passes
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
// The dev page can carry the un-minified engine, which parses slowly.
await page.waitForTimeout(Number(process.env.PS_BOOT || 1400));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1800);

const receipt = () => page.evaluate(() => {
    const b = document.getElementById('ps-status-check');
    if (!b) return { absent: true };
    return { hidden: b.hidden, state: b.getAttribute('data-state'),
             text: b.textContent, tip: b.getAttribute('data-tip') || '' };
});
const lint = () => page.evaluate(() => {
    const h = document.querySelector('.graphbuilder2-host');
    if (!h || typeof h.__gb2_graphLint !== 'function') return null;
    const r = h.__gb2_graphLint();
    return { total: r.total, fired: r.findings.map(f => f.id),
             warnTitles: r.findings.filter(f => f.sev === 'warn').map(f => f.title),
             passedIds: r.passed.map(p => p.id) };
});
// The engine drops synthesized clicks at (0,0) with detail 0, and floats
// invisible hit chrome over the svg, so every gesture here is a real one at
// a resolved centre.
const clickIn = async (re) => {
    const box = await page.evaluate(r => {
        const rx = new RegExp(r, 'i');
        const c = Array.from(document.querySelectorAll('#psroot button'))
            .filter(e => e.getBoundingClientRect().width > 0 &&
                         rx.test(e.textContent.trim()));
        c.sort((a, b) => a.textContent.length - b.textContent.length);
        if (!c[0]) return null;
        const b = c[0].getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, re.source);
    if (!box) throw new Error('no visible button matching ' + re);
    await page.mouse.click(box.x, box.y);
};
const openAdd = () => page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => /add/i.test(x.getAttribute('aria-label') || ''));
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});

console.log('case 1: a clean chart shows a quiet receipt, not nothing');
const clean = await receipt();
ok(!clean.absent, 'the status bar has a chart-check slot');
ok(clean.hidden === false && clean.state === 'ok' &&
   /Checks passed/.test(clean.text),
   `a passing chart says so quietly ("${clean.text}")`);
ok(/run against \d+ checks/.test(clean.tip),
   'and its tooltip says how many checks ran');
const cleanLint = await lint();
ok(cleanLint && cleanLint.fired.length === 0,
   `the engine agrees: 0 findings over ${cleanLint && cleanLint.total} checks`);
ok(cleanLint.passedIds.indexOf('brackclaim') < 0,
   'with no bracket on the chart, the bracket check is not even applicable');

console.log('case 2: a significance mark no test produced is caught');
await openAdd();
await page.waitForTimeout(450);
await clickIn(/^Sig\. bracket$/);
await page.waitForTimeout(2200);
const anns = await page.evaluate(() =>
    JSON.parse(window.PS_SHELL.optionStore().annotationsJson || '[]')
        .map(a => ({ kind: a.kind, text: a.text, autoP: a.autoPValue === true,
                     anchored: !!(a.anchorLeftCat && a.anchorRightCat) })));
ok(anns.length === 1 && anns[0].kind === 'bracket' && anns[0].text === '*' &&
   !anns[0].autoP && !anns[0].anchored,
   'the Add menu really does drop an unanchored "*" with auto-p off');
const bad = await lint();
ok(bad && bad.fired.indexOf('brackclaim') >= 0,
   'the lint fires brackclaim on it');
ok(/no test was run/.test(bad.warnTitles.join(' ')),
   `and says so plainly ("${bad.warnTitles[0]}")`);
const warned = await receipt();
ok(warned.state === 'warn' && /1 thing to check/.test(warned.text),
   `the status bar turns amber and counts it ("${warned.text}")`);
ok(warned.tip.indexOf(bad.warnTitles[0]) === 0,
   'the tooltip names the finding rather than making the user click to find out');

console.log('case 3: the receipt opens the panel that explains it');
const rb = await page.evaluate(() => {
    const r = document.getElementById('ps-status-check').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(rb.x, rb.y);
await page.waitForTimeout(1700);
const panel = await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll('#psroot div'))
        .filter(d => /run against/i.test(d.textContent) &&
                     d.getBoundingClientRect().height > 100)
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    return p ? p.innerText : '';
});
ok(/needs? a look/.test(panel) && /no test was run/.test(panel),
   'Check my chart opens on the finding');

console.log('case 4: a chart truncated above zero is counted too');
await page.evaluate(() => {
    window.__gb2_setOption('yMinOverride', true);
    window.__gb2_setOption('yMin', 30);
});
await page.waitForTimeout(2600);
const two = await receipt();
ok(two.state === 'warn' && /2 things to check/.test(two.text),
   `both findings are counted ("${two.text}")`);
ok(/zero/i.test(two.tip),
   'and the tooltip leads with the truncated baseline');

console.log('case 5: brackets the Statistics panel placed are NOT flagged');
// A fresh chart, so the fabricated bracket from case 2 is gone.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.reload();
await page.waitForTimeout(Number(process.env.PS_BOOT || 1400));
await page.evaluate(() => {
    const c = document.getElementById('ps-welcome-close');
    if (c && c.getBoundingClientRect().width > 0) c.click();
});
await page.waitForTimeout(1600);
// Clear the previous case's state on the restored document.
await page.evaluate(() => {
    window.__gb2_setOption('annotationsJson', '[]');
    window.__gb2_setOption('yMinOverride', false);
});
await page.waitForTimeout(2200);
await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => /statistics/i.test(x.getAttribute('aria-label') || ''));
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
await page.waitForTimeout(1100);
// A hidden pane measures 0, and Place brackets sits below the fold.
await page.evaluate(() => {
    const p = document.querySelector('.ps-main-workspace');
    if (p) p.scrollTop = p.scrollHeight;
});
await page.waitForTimeout(400);
const ticked = await page.evaluate(() => {
    let n = 0;
    Array.from(document.querySelectorAll('#psroot tr')).forEach(r => {
        const cb = r.querySelector('input[type=checkbox]');
        if (cb && r.querySelector('[data-cmp-sig]')) { cb.click(); n++; }
    });
    return n;
});
ok(ticked > 0, `${ticked} significant comparisons ticked in Compare pairs`);
await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => /^Place brackets/.test(x.textContent.trim()));
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
await page.waitForTimeout(2600);
const placed = await lint();
ok(placed.fired.indexOf('brackclaim') < 0,
   'real placed brackets do not fire the rule');
ok(placed.passedIds.indexOf('brackclaim') >= 0,
   'they report it as a PASSED check instead, so the receipt is earned');

console.log('case 6: a plain typed bracket label is left alone');
await page.evaluate(() => {
    const a = JSON.parse(window.PS_SHELL.optionStore().annotationsJson || '[]');
    a.push({ id: 'ann_probe_plain', kind: 'bracket', text: 'Delta = 4.2',
             x: 200, x2: 320, y: 90, autoPValue: false, fontSize: 13 });
    window.__gb2_setOption('annotationsJson', JSON.stringify(a));
});
await page.waitForTimeout(2400);
const plain = await lint();
ok(plain.fired.indexOf('brackclaim') < 0,
   'a bracket reading "Delta = 4.2" is an annotation, not a claim, and is not flagged');

console.log('case 7: the receipt belongs to the chart workspace');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(700);
ok((await receipt()).hidden === true, 'it hides in Data');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(900);
ok((await receipt()).hidden === false, 'and comes back in Charts');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART CHECK: PASS');
await browser.close();
