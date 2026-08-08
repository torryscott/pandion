// brackclaim: a bracket may not show a significance mark that no test
// produced. LANDED in inst/widget/graphbuilder2.js.
//
// THE BUG IT PINS. "+ Add > Sig. bracket" drops a bracket whose label is
// "*" with autoPValue off and no anchors, so the asterisk is a placeholder
// glyph. It exports into the figure, and before this rule "Check my chart"
// answered "Looks good. No common pitfalls found." - the app's own honesty
// checker giving a positive assurance over a fabricated significance
// claim. Reproduce the old behaviour by reverting the rule and watching
// case 2 fail at the "Looks good" line.
//
// Cases 1 to 4 read the Check-graph PANEL, which is what a user sees, and
// need nothing but the shipping engine.
//
// Cases 5 and 6 cover the UNLANDED half of the same proposal: a
// __gb2_graphLint host hook and the status-bar receipt the shell builds
// from it. They SKIP when the hook is absent, so this file stays green
// either way; run them with
//     python3 standalone/proto/make-proto.py
//     PS_BOOT=4000 PS_PAGE=standalone/proto-lint.html node <this file>
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
// A prototype page can carry the un-minified engine, which parses slowly.
await page.waitForTimeout(Number(process.env.PS_BOOT || 1400));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1800);

// The engine drops synthesized clicks at (0,0) with detail 0, and floats
// invisible hit chrome over the svg, so every gesture is a real one at a
// resolved centre.
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
const receipt = () => page.evaluate(() => {
    const b = document.getElementById('ps-status-check');
    if (!b) return { absent: true };
    return { hidden: b.hidden, state: b.getAttribute('data-state'),
             text: b.textContent, tip: b.getAttribute('data-tip') || '' };
});
const openAdd = () => page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#psroot button'))
        .find(x => /add/i.test(x.getAttribute('aria-label') || ''));
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
// What the user actually reads. Opened through the Help menu, the way the
// shell reaches every engine teaching panel.
const readPanel = async () => {
    await page.click('[data-ps-menu="help"]');
    await page.waitForTimeout(350);
    await page.evaluate(() => Array.from(
        document.querySelectorAll('#ps-appmenu button'))
        .find(x => /Check my chart/.test(x.textContent)).click());
    await page.waitForTimeout(1700);
    return page.evaluate(() => {
        const p = Array.from(document.querySelectorAll('#psroot div'))
            .filter(d => /run against/i.test(d.textContent) &&
                         d.getBoundingClientRect().height > 100)
            .sort((a, b) => a.textContent.length - b.textContent.length)[0];
        return p ? p.innerText : '';
    });
};

console.log('case 1: a clean chart passes every check');
const clean = await readPanel();
ok(/All passed\.?/.test(clean) && /Looks good/.test(clean),
   'the sample chart reports all passed');
ok(!/Significance marks are earned/.test(clean),
   'with no bracket on the chart the new check is not even applicable');

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
const svgStar = await page.evaluate(async () => {
    const s = await window.PS_SHELL.exportSource();
    return s ? />\*</.test(s.svg) : false;
});
ok(svgStar, 'and the exported figure carries the asterisk, so it is a real claim');
const bad = await readPanel();
// THE LINE THAT USED TO READ "Looks good. No common pitfalls found."
ok(/needs? a look/.test(bad),
   'the panel no longer answers "Looks good" on this chart');
ok(/but no test was run/.test(bad),
   'it names the bracket: "A bracket says \\"*\\" but no test was run"');
ok(/Compare pairs/.test(bad),
   'and points at Compare pairs, which runs the tests and places them');

console.log('case 3: brackets the Statistics panel placed are NOT flagged');
await page.evaluate(() => window.__gb2_setOption('annotationsJson', '[]'));
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
const placed = await readPanel();
ok(!/but no test was run/.test(placed) && !/significance marks that no test/.test(placed),
   'real placed brackets do not fire the rule');
ok(/Significance marks are earned/.test(placed),
   'they report it as a PASSED check instead, so the pass is earned rather than absent');

console.log('case 4: a plain typed bracket label is left alone');
await page.evaluate(() => {
    const a = JSON.parse(window.PS_SHELL.optionStore().annotationsJson || '[]');
    a.push({ id: 'ann_probe_plain', kind: 'bracket', text: 'Delta = 4.2',
             x: 200, x2: 320, y: 90, autoPValue: false, fontSize: 13 });
    window.__gb2_setOption('annotationsJson', JSON.stringify(a));
});
await page.waitForTimeout(2400);
const plain = await readPanel();
ok(!/but no test was run/.test(plain),
   'a bracket reading "Delta = 4.2" is an annotation, not a claim, and is not flagged');

// ---- the unlanded half: host hook + status-bar receipt ------------------
const hasHook = await page.evaluate(() => {
    const h = document.querySelector('.graphbuilder2-host');
    return !!h && typeof h.__gb2_graphLint === 'function';
});
if (!hasHook) {
    console.log('cases 5-6: SKIPPED (no __gb2_graphLint hook on this engine)');
    console.log('           see standalone/proto/README.md to run them');
} else {
    console.log('case 5: the receipt counts what the panel found');
    await page.evaluate(() => window.__gb2_setOption('annotationsJson', '[]'));
    await page.waitForTimeout(2400);
    const r0 = await receipt();
    ok(r0.hidden === false && r0.state === 'ok' && /Checks passed/.test(r0.text),
       `a passing chart says so quietly ("${r0.text}")`);
    await openAdd();
    await page.waitForTimeout(450);
    await clickIn(/^Sig\. bracket$/);
    await page.waitForTimeout(2300);
    await page.evaluate(() => {
        window.__gb2_setOption('yMinOverride', true);
        window.__gb2_setOption('yMin', 30);
    });
    await page.waitForTimeout(2700);
    const r2 = await receipt();
    ok(r2.state === 'warn' && /2 things to check/.test(r2.text),
       `the fabricated bracket and the truncated baseline both count ("${r2.text}")`);
    ok(/zero/i.test(r2.tip),
       'and the tooltip names the worst one rather than making the user click to find out');

    console.log('case 6: the receipt belongs to the chart workspace');
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(700);
    ok((await receipt()).hidden === true, 'it hides in Data');
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(900);
    ok((await receipt()).hidden === false, 'and comes back in Charts');
}

console.log('case 7: a NOTE is not a fault, on either surface');
// The two colour surfaces used to contradict each other on an untouched
// default-palette chart: the lint reported a green "Colorblind safety"
// pill while Chart settings > Accessibility said two series merge under
// grayscale. The lint tests the red-green family only, so the pill was
// claiming more than it had checked. It now names what it tested, and
// black-and-white legibility is reported separately as information -
// never as a failed check, because past about six series it often cannot
// be solved with colour at all.
// Clear what the earlier cases armed: case 5 truncated the value axis and
// that warning is still live, which would make this case pass for the
// wrong reason (a fault, not a note).
await page.evaluate(() => {
    window.__gb2_setOption('annotationsJson', '[]');
    window.__gb2_setOption('yMinOverride', false);
});
await page.waitForTimeout(2400);
// site x score by condition: three series on the stock palette, and the
// ONLY thing the rubric finds is the black-and-white note, which is what
// makes this a clean test of "a note is not a fault". Grouping by the x
// variable instead produces a degenerate chart with real warnings and
// would have passed this case for the wrong reason.
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'site', yvar: 'score', groupVar: 'condition' }));
await page.waitForTimeout(2000);
const grouped = await page.evaluate(() =>
    document.querySelectorAll('#psroot [data-legend-row]').length);
ok(grouped >= 2, `a grouped chart, so the colour checks apply (${grouped} series)`);
const colour = await readPanel();
ok(!/Colorblind safety/.test(colour),
   'the pill no longer claims "Colorblind safety" for a red-green-only test');
ok(/Red-green color safety/.test(colour),
   'it names what it actually tested');
const bw = /merge in black and white/.test(colour);
if (bw) {
    ok(!/Black-and-white legibility/.test(colour.split('PASSED')[1] || ''),
       'black and white is reported as a note, never as a passed pill');
    const note = await receipt();
    ok(note.state === 'ok' && /note/.test(note.text),
       `and a note leaves the receipt quiet rather than amber ("${note.text}")`);
} else {
    console.log('  --   this palette has no black-and-white merge; ' +
                'note path not exercised on this fixture');
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART CHECK: PASS');
await browser.close();
