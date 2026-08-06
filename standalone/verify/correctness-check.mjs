// B5, B6, B9, B11, B12: silently wrong output.
//
// B5 an order comparison on a text column failed EVERY row, so retyping a
// filtered column to Nominal blanked every chart in the project; B6 rows
// dropped because the filter column was MISSING were attributed to the stated
// threshold; B9 an unmapped .omv measureType became continuous and every text
// label read as missing, reported as a clean success; B11 the overlay
// fingerprint was a column SUM, so two compensating edits kept a stale
// overlay drawing against data that no longer existed; B12 style edits still
// inside the engine's 700ms guard were lost when the tab closed.
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
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(400);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(300);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

// ---- B5: an order comparison on a retyped column must not empty the project
const kept = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return {
        all: t.raw[t.order[0]].length,
        shown: t.filteredView
            ? t.filteredView.raw[t.filteredView.order[0]].length : null,
        inapplicable: t.filterInapplicable || [],
        missingDrops: t.filterMissingDrops || 0
    };
});
// Filter on a column the CHART does not plot, so retyping it leaves the
// chart valid and the note observable. (Retyping a plotted Y to nominal
// invalidates the roles and yields a placeholder, not a chart with a note.)
await page.evaluate(() => {
    window.PS_SHELL.setFilters([{ col: 'hours', op: 'gt', value: '3' }]);
});
await page.waitForTimeout(400);
const numeric = await kept();
ok(numeric.shown > 0 && numeric.shown < numeric.all,
   `a numeric filter keeps a real subset (${numeric.shown} of ${numeric.all})`);

await page.evaluate(() => window.PS_SHELL.setColType('hours', 'nominal'));
await page.waitForTimeout(600);
const retyped = await kept();
ok(retyped.shown === retyped.all,
   `retyping the filtered column to Nominal keeps every row ` +
   `(${retyped.shown} of ${retyped.all}), instead of emptying the project`);
ok(retyped.inapplicable.length === 1 && /hours/.test(retyped.inapplicable[0]),
   `the inapplicable condition is recorded (${JSON.stringify(retyped.inapplicable)})`);

// and the chart says so rather than showing an unexplained empty
const note = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();   // B7 put this in the FIGURE
    return p ? (p.chartNote || '') : '';
});
ok(/not applied/i.test(note) && /needs numbers/i.test(note),
   `the chart note explains the skipped condition ("${note.slice(0, 90)}")`);
await page.evaluate(() => window.PS_SHELL.setColType('hours', 'continuous'));
await page.waitForTimeout(400);

// ---- B6: rows dropped for a MISSING value are disclosed separately
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    t.raw.score[0] = '';
    t.raw.score[1] = '';
    window.PS_SHELL.retypeTable();
    window.PS_SHELL.setFilters([{ col: 'score', op: 'gt', value: '0' }]);
});
await page.waitForTimeout(500);
const miss = await kept();
ok(miss.missingDrops === 2,
   `rows dropped for a missing value are counted separately (${miss.missingDrops})`);
const note2 = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return p ? (p.chartNote || '') : '';
});
ok(/missing/i.test(note2),
   `the note says the drop was missingness, not the threshold ` +
   `("${note2.slice(0, 110)}")`);
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(300);

// ---- B11: two compensating edits must change the overlay fingerprint
const fpOf = () => page.evaluate(() => window.PS_SHELL.overlayFingerprint());
await page.evaluate(() => {
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
});
await page.waitForTimeout(500);
const fp0 = await fpOf();
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const a = Number(t.raw.score[0]), b = Number(t.raw.score[1]);
    t.raw.score[0] = String(a - 2);
    t.raw.score[1] = String(b + 2);        // sum, row count and roles unchanged
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(300);
const fp1 = await fpOf();
ok(fp0 !== fp1,
   'a compensating pair of edits changes the overlay fingerprint');

// a pure SWAP is the same multiset in the same column: order must still count
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const a = t.raw.score[0];
    t.raw.score[0] = t.raw.score[1];
    t.raw.score[1] = a;
    window.PS_SHELL.retypeTable();
});
await page.waitForTimeout(300);
ok((await fpOf()) !== fp1, 'swapping two values changes the overlay fingerprint');

// ---- B12: an edit still inside the engine guard survives a tab teardown ----
// The engine DOES flush on pagehide, so a naive version of this test passes
// with or without the shell's handler. The real bug is narrower: _flushOpts
// begins with "if (Date.now() - __gb2_inspectorInputAt < 700) { setTimeout(
// _flushOpts, 150); return; }", and a setTimeout scheduled during unload
// never runs. So the guard has to be ARMED for this to reproduce - drag a
// slider, release, close the tab within 700 ms. Everything runs
// synchronously inside one evaluate; dispatchEvent is synchronous, so no
// timer of anyone's can fire in between.
const flushed = await page.evaluate(() => {
    const commits = [];
    const real = window.setOption;
    window.setOption = function (k) { commits.push(k); return real.apply(this, arguments); };
    try {
        window.__gb2_pendingOpts = {
            chartSpec: JSON.stringify({ barOpacity: 0.31 })
        };
        window.__gb2_inspectorInputAt = Date.now();   // mid-interaction
        window.dispatchEvent(new Event('pagehide'));
        return {
            committed: commits.indexOf('chartSpec') !== -1,
            left: Object.keys(window.__gb2_pendingOpts || {}).length
        };
    } finally { window.setOption = real; }
});
ok(flushed.committed && flushed.left === 0,
   'an edit inside the engine 700ms interaction guard still commits on pagehide');

await page.waitForTimeout(400);
const stored = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.optionStore().chartSpec || ''));
ok(/0\.31/.test(stored),
   `the in-flight edit reached the option store (${stored.slice(0, 60)})`);

// ---- B9: an unmapped .omv measureType must not read as entirely missing ----
// Built here rather than shipped as a fixture, because the whole point is a
// measureType MEASURE_MAP does not cover, and no real jamovi file in the repo
// has one. Stored (method 0) entries only; the reader does not check CRCs.
function zipOf(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const [name, bytes] of files) {
        const nm = enc.encode(name);
        const lh = new Uint8Array(30 + nm.length);
        const ldv = new DataView(lh.buffer);
        ldv.setUint32(0, 0x04034b50, true);
        ldv.setUint16(4, 20, true);
        ldv.setUint16(8, 0, true);              // stored
        ldv.setUint32(18, bytes.length, true);  // compressed
        ldv.setUint32(22, bytes.length, true);  // uncompressed
        ldv.setUint16(26, nm.length, true);
        lh.set(nm, 30);
        parts.push(lh, bytes);
        const ch = new Uint8Array(46 + nm.length);
        const cdv = new DataView(ch.buffer);
        cdv.setUint32(0, 0x02014b50, true);
        cdv.setUint16(10, 0, true);             // stored
        cdv.setUint32(20, bytes.length, true);
        cdv.setUint32(24, bytes.length, true);
        cdv.setUint16(28, nm.length, true);
        cdv.setUint32(42, offset, true);
        ch.set(nm, 46);
        central.push(ch);
        offset += lh.length + bytes.length;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);
    const all = [...parts, ...central, eocd];
    const total = all.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const a of all) { out.set(a, at); at += a.length; }
    return out;
}
const meta = JSON.stringify({ dataSet: { rowCount: 3, fields: [
    // measureType values MEASURE_MAP does not cover
    { name: 'grp', type: 'string', columnType: 'Data',
      dataType: 'Text', measureType: 'Grouping' },
    { name: 'num', type: 'number', columnType: 'Data',
      dataType: 'Decimal', measureType: 'Scale' }
] } });
const xdata = JSON.stringify({ grp: { labels: [[0, 'alpha'], [1, 'beta']] } });
const bin = new Uint8Array(3 * 4 + 3 * 8);
const bdv = new DataView(bin.buffer);
[0, 1, 0].forEach((v, i) => bdv.setInt32(i * 4, v, true));
[1.5, 2.5, 3.5].forEach((v, i) => bdv.setFloat64(12 + i * 8, v, true));
const enc = new TextEncoder();
const omv = zipOf([['metadata.json', enc.encode(meta)],
                   ['xdata.json', enc.encode(xdata)],
                   ['data.bin', bin]]);

const parsedOmv = await page.evaluate(async bytes => {
    const buf = new Uint8Array(bytes).buffer;
    const r = await window.PSOmv.parse(buf, 'probe.omv');
    return { types: r.types, unmapped: r.unmapped || [],
             firstRow: r.rows[0], header: r.header };
}, Array.from(omv));
ok(parsedOmv.types.grp === 'nominal',
   `an unmapped measureType on a Text column reads nominal, not continuous ` +
   `(got ${parsedOmv.types.grp})`);
ok(parsedOmv.types.num === 'continuous',
   `an unmapped measureType on a Decimal column still reads continuous ` +
   `(got ${parsedOmv.types.num})`);
ok(parsedOmv.firstRow[0] === 'alpha',
   `the text labels survive instead of reading as missing ` +
   `(${JSON.stringify(parsedOmv.firstRow)})`);
ok(parsedOmv.unmapped.length === 2 && /grp/.test(parsedOmv.unmapped.join(' ')),
   `the guessed columns are reported for disclosure ` +
   `(${JSON.stringify(parsedOmv.unmapped)})`);

// ---- B8: a throwing payload must not wedge the app ----
// The engine's own render() call was already wrapped; buildPayload and the
// aggregation path in front of it were not, and render() is the last
// statement in nearly every mutation path - so a throw left the state
// committed and persisted with NOTHING on screen, and reloading replayed the
// same stored options. The escape matters as much as the catch.
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    window.__psRealBuild = window.GraphBuilder2.render;
    window.GraphBuilder2.render = function () {
        throw new TypeError('probe: synthetic payload failure');
    };
});
await page.evaluate(() => window.PS_SHELL.render());
await page.waitForTimeout(400);
const failure = await page.evaluate(() => {
    const host = document.getElementById('psroot');
    return {
        text: host.innerText,
        blank: host.innerText.trim().length === 0,
        actions: Array.from(host.querySelectorAll('button')).map(b => b.textContent),
        status: (document.getElementById('ps-status-context') || {}).textContent
    };
});
ok(!failure.blank,
   'a failing render leaves an explanation on screen, not a blank host');
ok(/could not be drawn/i.test(failure.text),
   `the failure is stated in plain language ("${failure.text.split('\n')[1] || ''}")`);
ok(failure.actions.some(t => /Reset/i.test(t)),
   `the wedge has a way out (${JSON.stringify(failure.actions)})`);
ok(!/ready/i.test(failure.status || ''),
   `the status bar does not claim success ("${failure.status}")`);

// and the app is still usable: restore the engine and re-render
await page.evaluate(() => {
    window.GraphBuilder2.render = window.__psRealBuild;
    window.PS_SHELL.render();
});
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
    document.querySelectorAll('#psroot svg').length > 0),
   'the app recovers and draws again once the fault clears');

// The headline case: a throw BEFORE the engine call. Only the engine's own
// render() was ever wrapped, so the aggregation path in front of it could
// blank the app with the state already committed and persisted.
const preRender = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const keep = t.columns;
    t.columns = null;                       // aggregation cannot survive this
    let threw = false;
    try { window.PS_SHELL.render(); } catch (e) { threw = true; }
    const host = document.getElementById('psroot');
    const out = { threw, text: host.innerText,
                  actions: Array.from(host.querySelectorAll('button'))
                      .map(b => b.textContent) };
    t.columns = keep;
    return out;
});
ok(!preRender.threw,
   'a throw in the aggregation path is caught rather than escaping render()');
ok(/could not be drawn/i.test(preRender.text) &&
   preRender.actions.some(t => /Reset/i.test(t)),
   'the pre-render failure gets the same explanation and the same way out');
await page.evaluate(() => window.PS_SHELL.render());
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
    document.querySelectorAll('#psroot svg').length > 0),
   'and the chart returns once the underlying fault is gone');

// the global handlers make an out-of-band throw visible instead of silent
await page.waitForTimeout(3000);      // clear the 4s throttle
await page.evaluate(() => {
    document.getElementById('ps-toast').className = '';
    window.dispatchEvent(new ErrorEvent('error', {
        message: 'probe: synthetic background failure'
    }));
});
await page.waitForTimeout(250);
ok(/something went wrong/i.test(await page.evaluate(() =>
    document.getElementById('ps-toast').textContent)),
   'an error thrown outside the render path is surfaced, not swallowed');

// ---- B10: computed-variable cycles and forward references ----
// knownColumns includes every OTHER computed column including later ones, and
// evaluation ran in column order writing as it went: "A = B + 1" with
// "B = A + 1" compiled clean and drifted on every edit with no signal, and a
// forward reference read one edit behind forever.
const cyc = await page.evaluate(() => {
    // The cycle has to be built by EDITING: you cannot reference a column
    // that does not exist yet, which is exactly why this shipped unnoticed.
    window.PS_SHELL.saveComputedColumn('beta', 'score + 1');
    window.PS_SHELL.saveComputedColumn('alpha', 'beta + 1');
    window.PS_SHELL.saveComputedColumn('beta', 'alpha + 1', 'beta');
    const t = window.PS_SHELL.project.table;
    return {
        errs: t.computedErrors || {},
        alpha: t.raw.alpha ? t.raw.alpha.slice(0, 2) : null,
        beta: t.raw.beta ? t.raw.beta.slice(0, 2) : null
    };
});
ok(/circular/i.test(cyc.errs.alpha || '') && /circular/i.test(cyc.errs.beta || ''),
   `a mutual reference is refused on BOTH columns ` +
   `(${JSON.stringify([cyc.errs.alpha, cyc.errs.beta])})`);
ok((cyc.alpha || []).every(v => v === '') && (cyc.beta || []).every(v => v === ''),
   'the cyclic columns hold no drifting values');

// A forward reference (defined before its dependency in column order) must
// read the CURRENT value, not the previous cycle's.
const fwd = await page.evaluate(() => {
    function tOrderMove(tb, a, b) {          // put a immediately before b
        const ai = tb.order.indexOf(a);
        if (ai !== -1) tb.order.splice(ai, 1);
        tb.order.splice(tb.order.indexOf(b), 0, a);
        return tb.order.slice();
    }
    const t = window.PS_SHELL.project.table;
    delete t.computed.alpha; delete t.computed.beta;
    t.order = t.order.filter(c => c !== 'alpha' && c !== 'beta');
    delete t.raw.alpha; delete t.raw.beta;
    // "early" is defined FIRST but depends on "late", defined after it
    // "early" ends up BEFORE "late" in column order but depends on it
    window.PS_SHELL.saveComputedColumn('late', 'score + 1');
    window.PS_SHELL.saveComputedColumn('early', 'late * 2');
    const ord = tOrderMove(window.PS_SHELL.project.table, 'early', 'late');
    window.PS_SHELL.retypeTable();            // re-evaluate in the new order
    const tt = window.PS_SHELL.project.table;
    return { order: ord, early: tt.raw.early[0], late: tt.raw.late[0],
             errs: tt.computedErrors || {} };
});
ok(!fwd.errs.early && !fwd.errs.late,
   `a forward reference compiles cleanly (${JSON.stringify(fwd.errs)})`);
ok(Number(fwd.early) === Number(fwd.late) * 2,
   `a forward reference reads the CURRENT value, not one edit behind ` +
   `(early=${fwd.early}, late=${fwd.late})`);

// ---- B3: the engine undo stack must not be shared across chart tabs ----
// One host, one engine, one fixed localStorage key, and switchChart never
// partitioned it. _undoApply re-emits _setOption(key, oldValue) and the shell
// sink writes to the ACTIVE chart, so styling A, switching to B and pressing
// Cmd+Z landed A's old value on B and persisted it.
//
// The edit MUST be made through the engine's own UI. A direct
// window.setOption() call creates NO undo step by design - the engine
// snapshots data[key], and its handlers poke that before committing - so an
// earlier version of this test had no history to leak and passed vacuously.
// The shell's own walkthrough driver performs a real recolour.
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
async function playTour(key, timeoutMs = 60000) {
    // Tour cards hold until the reader advances (no reading timer), so
    // this driver plays the reader: press Next until the tour finishes.
    // A press during a card's action only pre-arms the advance - the
    // action (the real recolour this test depends on) always runs.
    await page.evaluate(k => { window.PS_TOUR.play(k); }, key);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        await page.waitForTimeout(700);
        if (!await page.evaluate(() => window.PS_TOUR.isRunning())) break;
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('[data-role="ps-tour-layer"] button')]
                .find(x => x.textContent.indexOf('Next') >= 0);
            if (b) b.click();
        });
    }
    if (await page.evaluate(() => window.PS_TOUR.isRunning()))
        throw new Error(`walkthrough "${key}" did not finish`);
}
const barFills = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#psroot [data-bar-cat]'))
    .map(n => n.getAttribute('fill') || ''));

const ids = await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    const a = window.PS_SHELL.chart().id;
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    return { a };
});
await page.waitForTimeout(900);
await playTour('one-bar-color');                 // a REAL engine-side edit on A
await page.waitForTimeout(900);
const aRecoloured = (await barFills()).filter(f => /c2242c/i.test(f)).length;
ok(aRecoloured >= 1, `chart A really was recoloured through the engine ` +
   `(${aRecoloured} bars)`);
const undoArmed = await page.evaluate(() => {
    const b = document.querySelector('.graphbuilder2-host button[aria-label="Undo"]');
    return !!(b && !b.disabled);
});
ok(undoArmed, 'the engine undo stack actually has a step to give away');

await page.evaluate(() => {
    window.PS_SHELL.addChart('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
});
await page.waitForTimeout(1400);
// The symptom a user meets: a chart they have NEVER edited offers Undo, and
// taking it changes something they never did. Asserting on B's pixels is not
// enough - undoing A's recolour on B restores a value B already had, so the
// contamination is invisible there (the first version of this test passed
// with the fix disabled for exactly that reason).
const bArmed = await page.evaluate(() => {
    const u = document.querySelector('.graphbuilder2-host button[aria-label="Undo"]');
    return { present: !!u, enabled: !!(u && !u.disabled) };
});
ok(bArmed.present && !bArmed.enabled,
   `a never-edited chart offers nothing to undo (${JSON.stringify(bArmed)})`);

const bBefore = await barFills();
for (let i = 0; i < 3; i++) {
    await page.keyboard.press(`${MOD}+z`);       // the reflex press, on B
    await page.waitForTimeout(400);
}
await page.waitForTimeout(900);
const bAfter = await barFills();
ok(JSON.stringify(bAfter) === JSON.stringify(bBefore),
   "undo on chart B changes nothing on chart B");
ok(!bAfter.some(f => /c2242c/i.test(f)),
   "chart A's colour never leaked onto chart B");

await page.evaluate(id => window.PS_SHELL.switchChart(id), ids.a);
await page.waitForTimeout(1200);
ok((await barFills()).filter(f => /c2242c/i.test(f)).length >= 1,
   'chart A kept its own edit across the round trip');
await page.keyboard.press(`${MOD}+z`);
await page.waitForTimeout(1500);
ok((await barFills()).filter(f => /c2242c/i.test(f)).length === 0,
   "and undo on chart A still reverts chart A's own edit");

// ---- B7: the filter disclosure must ride the exported FIGURE ----
// It used to be prepended to payload.missingNote, which the engine renders as
// a dismissible HTML pill appended to the wrap, NOT to the svg. So every
// export, every layout snapshot and the copy-as-image showed a filtered
// subset with no indication anything had been left out.
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    window.PS_SHELL.setFilters([{ col: 'score', op: 'gt', value: '40' }]);
});
await page.waitForTimeout(1500);
const inSvg = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const svg = host && host.querySelector('svg[data-role], svg');
    const all = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    return {
        svgText: all ? Array.from(all.querySelectorAll('text'))
            .map(t => t.textContent).join(' | ') : '',
        serialized: (document.getElementById('psroot').__gb2_serializeSvg
            ? document.getElementById('psroot').__gb2_serializeSvg() : '')
    };
});
ok(/Filter:/.test(inSvg.svgText),
   'the filter sentence is drawn inside the chart svg');
ok(/Filter:/.test(inSvg.serialized),
   'and it survives the exact serializer every export path uses');

// a note the user wrote must not be replaced by ours
const bothNotes = await page.evaluate(() => {
    const store = window.PS_SHELL.optionStore();
    const spec = JSON.parse(store.chartSpec || '{}');
    spec.chartNote = 'Pilot data, do not cite.';
    window.setOption('chartSpec', JSON.stringify(spec));
    return true;
});
await page.waitForTimeout(1600);
const merged = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    // Only the note-ish nodes: joining EVERY text node makes a failure
    // message that shows axis labels and hides the thing under test.
    return all ? Array.from(all.querySelectorAll('text'))
        .map(t => t.textContent)
        .filter(t => /Filter:|Pilot data/.test(t)).join(' | ') : '';
});
ok(/Pilot data/.test(merged) && /Filter:/.test(merged),
   `the user's own note is appended to, not replaced ("${merged}")`);
ok(!/Filter:/.test(await page.evaluate(() =>
        String(JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}')
            .chartNote || ''))),
   'and the derived sentence is never written into the stored options');
await page.evaluate(() => window.PS_SHELL.setFilters([]));
await page.waitForTimeout(800);

// ---- B21, third state (Torry, Jul 31 2026): the engine's download icon is
// hidden AGAIN - one blue Export per workspace, in the command bar - and the
// Basics sentence that sank the FIRST hide is retargeted, not left dangling.
const expBtn = await page.evaluate(() => {
    const b = document.querySelector(
        '.graphbuilder2-host button[title="Export plot"]');
    return { present: !!b,
             hidden: !b || getComputedStyle(b).display === 'none' };
});
ok(expBtn.hidden,
   `the engine's toolbar export icon is hidden in the standalone ` +
   `(${JSON.stringify(expBtn)})`);
const cmdExport = await page.evaluate(() => {
    const b = document.getElementById('ps-export');
    return { visible: b.offsetParent !== null, label: b.textContent };
});
ok(cmdExport.visible && cmdExport.label === 'Export chart',
   `the command bar carries the one chart export ("${cmdExport.label}")`);
await page.click('#ps-export');
await page.waitForTimeout(400);
ok(await page.locator('#ps-exporter').isVisible(),
   "and clicking it opens the shell's export dialog");
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// The help sentence names the button that exists now.
await page.click('.graphbuilder2-host button[title="Help & shortcuts"]');
await page.waitForTimeout(500);
const helpTxt = await page.evaluate(() => {
    const p = document.querySelector('.gb2-panel');
    return p ? p.textContent : '';
});
ok(/Export chart.*button.*saves the chart as SVG/.test(helpTxt) &&
   !/export button in the toolbar saves/.test(helpTxt),
   'the Basics help names the Export chart button, not the hidden icon');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

// ---- B22: the ensure pass must notice a capture that never takes ----
// step() shifted the next id, rendered, and scheduled the next one
// unconditionally: no post-check, no retry cap, no error surface. So a chart
// that RENDERS but fails to capture (captureChartSnapshot returns silently
// when the largest svg is missing or under 200px) looked exactly like one
// never visited, and the export refusal then told the user to "open its tab
// once, then export again" - the very thing the pass had just done.
const uncap = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.addChart('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    const doomed = window.PS_SHELL.chart().id;
    await sleep(900);
    window.PS_SHELL.addLayout();
    await sleep(500);
    const lay = window.PS_SHELL.chart();
    lay.items = [{ id: 'i1', kind: 'chart', chartId: doomed,
                   x: 20, y: 20, w: 400, h: 300 }];
    // Force the capture to fail the way it fails in the wild: the engine
    // draws, but no svg large enough to snapshot is found.
    window.__psRealGet = Element.prototype.querySelectorAll;
    window.PS_SHELL.dropSnapshots();
    return doomed;
});
await page.evaluate(() => {
    // Make every capture attempt find nothing, without touching the render.
    const host = document.getElementById('psroot');
    host.__psBlockCapture = true;
    const real = host.querySelectorAll.bind(host);
    host.querySelectorAll = function (sel) {
        if (host.__psBlockCapture && sel === 'svg') return [];
        return real(sel);
    };
});
await page.evaluate(() => window.PS_SHELL.render());
await page.waitForTimeout(2500);
const refusal = await page.evaluate(() => ({
    uncapturable: window.PS_SHELL.uncapturable(),
    panels: window.PS_SHELL.undrawablePanels()
}));
ok(refusal.uncapturable.length === 1,
   `a chart that renders but never captures is recorded ` +
   `(${JSON.stringify(refusal.uncapturable)})`);
ok(refusal.panels.length === 1 &&
   /could not be captured as an image/.test(refusal.panels[0].why),
   `and the export refusal names the real cause instead of a dead end ` +
   `("${(refusal.panels[0] || {}).why}")`);
// Undo the sabotage, or every later case inherits a broken capture path.
await page.evaluate(() => {
    const host = document.getElementById('psroot');
    host.__psBlockCapture = false;
    window.PS_SHELL.dropSnapshots();
});
await page.evaluate(() => window.PS_SHELL.render());
await page.waitForTimeout(1200);

// ---- B23 / B24: two snapshot-audit findings, REPRODUCED then fixed ----
// Both were filed from code reading and NOT reproduced at the time. B23
// turned out to be made deterministic by this session's own B12 fix, and B24
// reproduced on the third attempt - the same pattern as the layout-blanking
// regression earlier in this sweep.
const snapIds = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const mk = async () => {
        window.PS_SHELL.addChart('plotbuilder');
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
        await sleep(700);
        return window.PS_SHELL.chart().id;
    };
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    await sleep(700);
    const a = window.PS_SHELL.chart().id;
    const b = await mk(), c = await mk();
    window.PS_SHELL.addLayout();
    await sleep(400);
    const lay = window.PS_SHELL.chart();
    // A is IN the layout (t4-31 postscript): the old fixture held only b
    // and c, yet the case asserted the canvas showed A's pending title -
    // which could only pass via the cross-document pin bleed t4-31 fixed
    // (the planted pendingOpts painted PENDINGTITLE into b's and c's
    // offscreen snapshot renders). With A a real panel, the assertion is
    // A's own; b and c are asserted CLEAN below.
    lay.items = [
        { id: 'i0', kind: 'chart', chartId: a, x: 320, y: 10, w: 300, h: 200 },
        { id: 'i1', kind: 'chart', chartId: b, x: 10, y: 10, w: 300, h: 200 },
        { id: 'i2', kind: 'chart', chartId: c, x: 10, y: 230, w: 300, h: 200 }];
    window.PS_SHELL.switchChart(a);
    await sleep(900);
    return { a, b, c, lay: lay.id };
});

// B23: a pending engine edit at the moment of the switch. switchChart flushes
// it (B12), and every commit bumps the snapshot epoch - so flushing BEFORE
// the capture stamped a freshly-valid revision onto a picture that predates
// the edit, which no later ensure pass would refresh.
const b23 = await page.evaluate(async ids => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const spec = JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}');
    spec.chartTitle = 'PENDINGTITLE';
    window.__gb2_pendingOpts = { chartSpec: JSON.stringify(spec) };
    window.PS_SHELL.switchChart(ids.lay);
    await sleep(2500);
    const snap = window.PS_SHELL.snapshotOf(ids.a);
    const snapB = window.PS_SHELL.snapshotOf(ids.b);
    const snapC = window.PS_SHELL.snapshotOf(ids.c);
    const canvas = document.getElementById('ps-lcanvas');
    return {
        committed: /PENDINGTITLE/.test(
            (window.PS_SHELL.charts().find(x => x.id === ids.a)
                .options.plotbuilder || {}).chartSpec || ''),
        snapValid: !!(snap && snap.valid),
        snapHasEdit: !!(snap && /PENDINGTITLE/.test(snap.svg)),
        panelHasEdit: canvas ? /PENDINGTITLE/.test(canvas.innerHTML) : false,
        bleedB: !!(snapB && /PENDINGTITLE/.test(snapB.svg)),
        bleedC: !!(snapC && /PENDINGTITLE/.test(snapC.svg))
    };
}, snapIds);
ok(b23.committed, 'setup: the pending edit did commit on the switch');
ok(!(b23.snapValid && !b23.snapHasEdit),
   `no snapshot is stamped VALID while holding the pre-edit picture ` +
   `(${JSON.stringify(b23)})`);
ok(b23.panelHasEdit,
   'the layout panel shows the edit rather than a stale figure it would export');
ok(!b23.bleedB && !b23.bleedC,
   'and the OTHER charts\' snapshots stay clean: A\'s in-flight edit is ' +
   'A\'s alone (t4-31)');

// B24: the ensure pass renders other charts offscreen through the same
// function that repoints LAST_CHART_ID, so a LATE engine commit landed on
// whichever chart the pass visited last instead of the edited one.
const b24 = await page.evaluate(async ids => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.switchChart(ids.a);
    await sleep(900);
    window.PS_SHELL.dropSnapshots();
    window.PS_SHELL.switchChart(ids.lay);
    await sleep(2500);                       // the ensure pass runs here
    window.setOption('chartSpec', JSON.stringify({ chartTitle: 'LATE_EDIT' }));
    await sleep(700);
    return window.PS_SHELL.charts()
        .filter(x => !Array.isArray(x.items))
        .filter(x => /LATE_EDIT/.test((x.options.plotbuilder || {}).chartSpec || ''))
        .map(x => x.id);
}, snapIds);
ok(b24.length === 1 && b24[0] === snapIds.a,
   `a late commit lands on the chart that produced it, not on the last one ` +
   `the snapshot pass happened to visit (landed on ${JSON.stringify(b24)}, ` +
   `expected ${snapIds.a})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CORRECTNESS CHECK PASS');
await browser.close();
