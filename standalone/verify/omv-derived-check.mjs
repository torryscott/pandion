// What a jamovi file derived, and then lost on the way in.
//
// Two separate silences, both in the .omv reader, both about a column that is
// not what it appears to be.
//
// FILTERS. A jamovi filter HIDES rows. The reader's whole answer was
//   if (f.columnType === "Filter") { off += size * n; continue; }
// so a sender who filtered 240 cases down to 120 and charted that got a
// recipient charting 240, with the string "Filter 1" appearing nowhere in the
// app. A different N with no disclosure. The formulas are a full expression
// language and translating them would change N a second way, so what is built
// here is the DISCLOSURE and nothing else. The file's filters are named, their
// formulas quoted, and the fact that every row is being shown is stated.
//
// COMPUTED COLUMNS. A column with columnType "Computed" and a formula arrived
// as an ordinary Continuous data column. The variable panel showed a name, a
// measure type and summary statistics, and nothing anywhere said the values
// were derived. Edit a source value and the derived column silently goes
// stale. The app's own formula language is a different vocabulary, so the
// answer is honest labelling rather than translation, matching the wording the
// date Extract year and Extract month columns already use for a snapshot.
//
// The fixture is built at run time from the shipped .omv by rewriting
// metadata.json inside the zip, so the ground truth stays a real jamovi file
// rather than something hand-rolled to suit the test. The filter column is
// inserted FIRST, which is where jamovi puts it, so a mistake in the offset
// walk would corrupt every column after it and the fidelity case would say so.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

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
const srcOmv = path.resolve(here, 'fixtures', 'graphbuilder-test-data.omv');
if (!fs.existsSync(srcOmv)) {
    console.error('fixture missing: ' + srcOmv);
    process.exit(2);
}

// ---- minimal zip read and write, store-only on the way out -----------------
function readZip(buf) {
    let eo = -1;
    for (let i = buf.length - 22; i >= 0; i--)
        if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('not a zip');
    const count = buf.readUInt16LE(eo + 10);
    let p = buf.readUInt32LE(eo + 16);
    const out = [];
    for (let k = 0; k < count; k++) {
        const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30);
        const cLen = buf.readUInt16LE(p + 32);
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const lho = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nLen).toString('utf8');
        const lxLen = buf.readUInt16LE(lho + 28), lnLen = buf.readUInt16LE(lho + 26);
        const dStart = lho + 30 + lnLen + lxLen;
        const raw = buf.slice(dStart, dStart + csize);
        out.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : raw });
        p += 46 + nLen + xLen + cLen;
    }
    return out;
}
function crc32(b) {
    let c, t = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    let r = 0xffffffff;
    for (let i = 0; i < b.length; i++) r = t[(r ^ b[i]) & 0xff] ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
}
function writeZip(entries) {
    const locals = [], central = [];
    let off = 0;
    for (const e of entries) {
        const nm = Buffer.from(e.name, 'utf8');
        const crc = zlib.crc32 ? zlib.crc32(e.data) : crc32(e.data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);   // stored
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(e.data.length, 18);
        lh.writeUInt32LE(e.data.length, 22);
        lh.writeUInt16LE(nm.length, 26);
        locals.push(lh, nm, e.data);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(e.data.length, 20);
        ch.writeUInt32LE(e.data.length, 24);
        ch.writeUInt16LE(nm.length, 28);
        ch.writeUInt32LE(off, 42);
        central.push(ch, nm);
        off += 30 + nm.length + e.data.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(off, 16);
    return Buffer.concat([Buffer.concat(locals), cd, eocd]);
}

// ---- the fixture -----------------------------------------------------------
// Field shapes copied from jamovi's own writer (formatio/omv.py). Every column
// carries formula and formulaMessage, a filter column additionally carries
// filterNo and active, and a recoded column points at a transform by id.
const entries = readZip(fs.readFileSync(srcOmv));
const meta = JSON.parse(entries.find(e => e.name === 'metadata.json').data.toString('utf8'));
const ds = meta.dataSet || meta;
const nRows = ds.rowCount;
const binEntry = entries.find(e => e.name === 'data.bin');

function filterField(name, no, formula, active) {
    return { name, id: 900 + no, columnType: 'Filter', dataType: 'Integer',
             measureType: 'Nominal', formula, formulaMessage: '', parentId: 0,
             width: 78, type: 'integer', importName: name, description: '',
             transform: 0, edits: [], missingValues: [],
             filterNo: no, active };
}
// TWO filters, one of them switched off in jamovi, because "carries a filter"
// and "carries a filter that is doing nothing" are different facts and a
// disclosure that flattens them is a new small lie.
ds.fields.unshift(filterField('Filter 2', 1, "group == 'A'", false));
ds.fields.unshift(filterField('Filter 1', 0, 'score > 0.5', true));
// A computed column, and a recoded one, which is the same trap wearing
// jamovi's other name for it.
const scoreField = ds.fields.find(f => f.name === 'score');
scoreField.columnType = 'Computed';
scoreField.formula = 't1 + t2';
// A formula is a string out of a file someone else wrote, and it now reaches
// innerHTML in two places, so one of them carries a payload.
const rtField = ds.fields.find(f => f.name === 'rt');
rtField.columnType = 'Computed';
rtField.formula = 'x"><img src=x onerror="window.__psPwn=1">';
const hoursField = ds.fields.find(f => f.name === 'hours');
hoursField.columnType = 'Recoded';
hoursField.transform = 1;
ds.transforms = [{ name: 'Log hours', id: 1, suffix: ' - log',
                   formula: ['LOG10($source)'], formulaMessage: [''],
                   measureType: 'Continuous', description: '' }];
// Two int32 columns of evaluated filter results, prepended, because the filter
// fields were prepended. data.bin is column-major in fields order.
const filterBytes = Buffer.alloc(4 * nRows * 2);
for (let r = 0; r < nRows; r++) {
    filterBytes.writeInt32LE(r % 2, r * 4);              // Filter 1
    filterBytes.writeInt32LE(1, 4 * nRows + r * 4);      // Filter 2
}
binEntry.data = Buffer.concat([filterBytes, binEntry.data]);
entries.find(e => e.name === 'metadata.json').data =
    Buffer.from(JSON.stringify(meta), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-omv-derived-'));
const outOmv = path.join(tmp, 'derived.omv');
fs.writeFileSync(outOmv, writeZip(entries));

// ---- boot ------------------------------------------------------------------
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(here, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-open');
    await page.waitForTimeout(400);
}

async function importOmv(file) {
    await page.evaluate(() => { window.PS_SHELL.openLoader(); });
    await page.waitForTimeout(300);
    await page.setInputFiles('#ps-file', file);
    await page.waitForTimeout(2200);
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(400);
}
// Snapshotted, never removed, because the toasts live in a stack the app owns.
const toastText = () => page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));

// ---- case 1. the control, and the fidelity baseline ------------------------
// The shipped file has no filters and no derived columns, so nothing here may
// fire. This is also where the byte-for-byte baseline is taken.
console.log('case 1: an ordinary jamovi file says nothing new');
await importOmv(srcOmv);
const plainToasts = await toastText();
const baseline = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const raw = {};
    t.order.forEach(c => { raw[c] = t.raw[c].slice(); });
    return { order: t.order.slice(), raw,
             imported: t.importedFormulas || null,
             types: Object.assign({}, t.types) };
});
ok(baseline.order.length === 18 && baseline.raw[baseline.order[0]].length === 240,
   'the shipped fixture reads 240 rows by 18 columns');
ok(!/filter/i.test(plainToasts),
   'no filter is claimed on a file that carries none, got ' +
   JSON.stringify(plainToasts.slice(0, 200)));
ok(!/computed in jamovi/i.test(plainToasts),
   'and no column is called computed, got ' +
   JSON.stringify(plainToasts.slice(0, 200)));
ok(!baseline.imported || Object.keys(baseline.imported).length === 0,
   'and nothing is recorded as derived, got ' + JSON.stringify(baseline.imported));
const plainBadges = await page.evaluate(() =>
    document.querySelectorAll('.ps-grid-fx[data-fx-frozen]').length);
ok(plainBadges === 0, 'and no column wears the frozen badge, got ' + plainBadges);

// ---- case 2. the same data, now carrying filters and derived columns -------
console.log('case 2: the data is byte for byte what it was');
await importOmv(outOmv);
const after = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const raw = {};
    t.order.forEach(c => { raw[c] = t.raw[c].slice(); });
    return { order: t.order.slice(), raw };
});
ok(JSON.stringify(after.order) === JSON.stringify(baseline.order),
   'the same 18 columns in the same order, the filters excluded, got ' +
   JSON.stringify(after.order));
let firstDrift = null;
for (const c of baseline.order)
    if (JSON.stringify(after.raw[c]) !== JSON.stringify(baseline.raw[c]))
    { firstDrift = c; break; }
ok(firstDrift === null,
   'and every value in every column is identical to the untouched import' +
   (firstDrift ? ', but ' + firstDrift + ' drifted' : ''));

console.log('case 3: the file says it carries filters, and what they say');
const dToasts = await toastText();
ok(/Filter 1/.test(dToasts) && /Filter 2/.test(dToasts),
   'both filter columns are named, got ' + JSON.stringify(dToasts.slice(0, 400)));
ok(/score > 0\.5/.test(dToasts),
   'the formula is quoted rather than summarised, got ' +
   JSON.stringify(dToasts.slice(0, 400)));
// Stated as what the filters do NOT hide. "All 240 rows are shown" would be
// false the moment the reader added a filter of their own, and this same
// sentence lives on the control they would use to do that.
ok(/none of the 240 rows/i.test(dToasts),
   'and it says the file\'s filters hide no rows, got ' +
   JSON.stringify(dToasts.slice(0, 400)));
ok(/switched off/i.test(dToasts),
   'and the one jamovi had switched off is marked as such, got ' +
   JSON.stringify(dToasts.slice(0, 400)));

console.log('case 4: the disclosure outlives the toast');
const filterTip = await page.evaluate(() => {
    const b = document.getElementById('ps-data-filter-btn');
    return b ? (b.getAttribute('data-tip') || b.title || '') : '';
});
ok(/Filter 1/.test(filterTip) && /not applied/i.test(filterTip),
   'the Filter control carries the file\'s filters, got ' +
   JSON.stringify(filterTip.slice(0, 300)));
// The sentence sits on the control a reader uses to filter, so it has to
// survive them doing exactly that. A claim that all rows are shown would go
// false here while still being displayed.
const withOwn = await page.evaluate(() => {
    window.PS_SHELL.setFilters([{ col: 'rt', op: 'gt', value: '0' }]);
    const b = document.getElementById('ps-data-filter-btn');
    return { tip: b ? (b.getAttribute('data-tip') || '') : '',
             label: b ? b.textContent : '' };
});
ok(!/all \d+ rows are shown/i.test(withOwn.tip),
   'and it makes no claim that goes false under the reader\'s own filter, ' +
   'got ' + JSON.stringify(withOwn.tip.slice(0, 300)));
ok(/Filter 1/.test(withOwn.tip) && /none of the 240 rows/i.test(withOwn.tip),
   'while still saying the jamovi filters hide nothing, got ' +
   JSON.stringify(withOwn.tip.slice(0, 300)));
await page.evaluate(() => { window.PS_SHELL.setFilters([]); });
await page.waitForTimeout(200);

console.log('case 5: a computed column is labelled, and marked a snapshot');
const derived = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { imported: t.importedFormulas || null,
             computed: t.computed || {},
             computedErrors: t.computedErrors || null };
});
ok(derived.imported && derived.imported.score &&
   derived.imported.score.formula === 't1 + t2',
   'the jamovi formula is kept with its column, got ' +
   JSON.stringify(derived.imported && derived.imported.score));
ok(derived.imported && derived.imported.hours &&
   /Log hours/.test(derived.imported.hours.transform || ''),
   'and a recoded column names the transform it came from, got ' +
   JSON.stringify(derived.imported && derived.imported.hours));
// The trap this whole item is avoiding. A jamovi formula must never reach the
// app's own formula engine, whose vocabulary is a different one.
ok(derived.computed.score === undefined && derived.computed.hours === undefined,
   'the jamovi formula is NOT handed to this app\'s formula engine, got ' +
   JSON.stringify(derived.computed));
ok(!derived.computedErrors,
   'so it produces no formula errors either, got ' +
   JSON.stringify(derived.computedErrors));
const dBadge = await page.evaluate(() => {
    const th = Array.from(document.querySelectorAll('th[data-grid-col]'))
        .find(n => n.getAttribute('data-grid-col') === 'score');
    const fx = th ? th.querySelector('.ps-grid-fx') : null;
    return fx ? { frozen: fx.hasAttribute('data-fx-frozen'),
                  tip: fx.getAttribute('data-tip') || '' } : null;
});
ok(dBadge && dBadge.frozen,
   'the column is marked in the grid, got ' + JSON.stringify(dBadge));
ok(/t1 \+ t2/.test(dBadge.tip) && /snapshot/i.test(dBadge.tip),
   'and the mark says the formula and that it is a snapshot, got ' +
   JSON.stringify(dBadge.tip));

console.log('case 6: the variable panel says it too');
await page.evaluate(() => { window.PS_SHELL.selectVariable('score'); });
await page.waitForTimeout(300);
const panel = await page.evaluate(() => {
    const s = document.getElementById('ps-variable-derived-section');
    return s && s.style.display !== 'none' ? s.innerText : '';
});
ok(/t1 \+ t2/.test(panel),
   'the formula is on the panel, got ' + JSON.stringify(panel.slice(0, 300)));
ok(/snapshot/i.test(panel),
   'and it is called a snapshot, the same word the extracted date columns ' +
   'use, got ' + JSON.stringify(panel.slice(0, 300)));
ok(/not follow/i.test(panel),
   'and it says it will not follow its sources, got ' +
   JSON.stringify(panel.slice(0, 300)));
const plainPanel = await page.evaluate(() => {
    window.PS_SHELL.selectVariable('t3');
    const s = document.getElementById('ps-variable-derived-section');
    return s ? s.style.display : 'missing';
});
ok(plainPanel === 'none',
   'while a typed column gets no such section, got ' + plainPanel);

// A formula is a string from a file a stranger wrote, and it now reaches
// innerHTML on the panel and inside a data-tip attribute in the grid header.
console.log('case 6b: a hostile formula is printed, never run');
const hostile = await page.evaluate(() => {
    window.PS_SHELL.selectVariable('rt');
    const s = document.getElementById('ps-variable-derived');
    const th = Array.from(document.querySelectorAll('th[data-grid-col]'))
        .find(n => n.getAttribute('data-grid-col') === 'rt');
    return { pwn: window.__psPwn === undefined,
             injected: document.querySelectorAll('img[src="x"]').length,
             shown: s ? s.innerText : '',
             tip: th && th.querySelector('.ps-grid-fx')
               ? th.querySelector('.ps-grid-fx').getAttribute('data-tip') : '' };
});
ok(hostile.pwn && hostile.injected === 0,
   'nothing from the formula became markup, got ' +
   JSON.stringify({ clean: hostile.pwn, imgs: hostile.injected }));
ok(/onerror/.test(hostile.shown) && /onerror/.test(hostile.tip),
   'and it is shown literally in both places instead, got ' +
   JSON.stringify(hostile.shown.slice(0, 120)));

console.log('case 7: the label survives the bookkeeping');
const kept = await page.evaluate(() => {
    window.PS_SHELL.deleteVariable('hours');
    const t = window.PS_SHELL.project.table;
    return { gone: (t.importedFormulas || {}).hours === undefined,
             stays: !!(t.importedFormulas || {}).score };
});
ok(kept.gone, 'a deleted column takes its formula record with it');
ok(kept.stays, 'and the others keep theirs');
const undone = await page.evaluate(() => {
    window.PS_SHELL.dataUndo();
    const t = window.PS_SHELL.project.table;
    return !!(t.importedFormulas || {}).hours;
});
ok(undone, 'and undo brings it back, so the record rides the history');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('OMV DERIVED CHECK: ALL GREEN');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
