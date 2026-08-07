// A jamovi file's own missing-value rules were dropped in silence.
//
// jamovi lets a sender declare, per column, that a code means missing. The
// .omv reader looked at name, columnType, dataType, measureType and type, and
// never at missingValues, so the rule vanished and the sentinel arrived as
// ordinary data. On a column with a rule of "== 1151", the value 1151 sat in
// the grid and was counted in the mean, the SD and the max, with nothing said.
//
// This app has EXACTLY the right field for it. The per-column missing box is
// right there in the variable panel and its own placeholder describes this
// case, "such as -99 for an age or 9 for a rating". It was simply left empty.
//
// The rules are EXPRESSIONS while the app's list holds literal values, so only
// the equality form translates. A comparison rule cannot be held, and the one
// thing that must not happen is dropping it quietly, so it is carried out and
// named. That is the same answer the unmapped measure types already give.
//
// The fixture is built at run time from the shipped .omv, so the ground truth
// is a real jamovi file rather than something hand-rolled to suit the test.
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
    // End of central directory, then walk the central directory.
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

const entries = readZip(fs.readFileSync(srcOmv));
const meta = JSON.parse(entries.find(e => e.name === 'metadata.json').data.toString('utf8'));
const ds = meta.dataSet || meta;
// The real value to declare missing, taken from the file itself so the
// expectation cannot drift from the data.
const dataEntry = entries.find(e => e.name === 'data.bin');
const rtIdx = ds.fields.findIndex(f => f.name === 'rt');
ok(rtIdx >= 0, 'the shipped fixture has an rt column');
let offBytes = 0;
for (let i = 0; i < rtIdx; i++)
    offBytes += (ds.fields[i].type === 'number' ? 8 : 4) * ds.rowCount;
const dv = new DataView(dataEntry.data.buffer, dataEntry.data.byteOffset,
                        dataEntry.data.byteLength);
const rtVals = [];
for (let r = 0; r < ds.rowCount; r++) {
    const v = dv.getInt32(offBytes + r * 4, true);
    if (v !== -2147483648) rtVals.push(v);
}
const sentinel = Math.max.apply(null, rtVals);          // the slowest trial
ds.fields[rtIdx].missingValues = ['== ' + sentinel];
// A rule this app cannot hold, on a different column, to prove it is named
// rather than dropped.
const hoursIdx = ds.fields.findIndex(f => f.name === 'hours');
ds.fields[hoursIdx].missingValues = ['> 999'];
entries.find(e => e.name === 'metadata.json').data =
    Buffer.from(JSON.stringify(meta), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-omv-'));
const outOmv = path.join(tmp, 'rules.omv');
fs.writeFileSync(outOmv, writeZip(entries));

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
await page.setInputFiles('#ps-file', outOmv);
await page.waitForTimeout(2200);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);

console.log('case 1: the file still reads exactly as before');
const shape = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { cols: t.order.length, rows: t.raw[t.order[0]].length };
});
ok(shape.cols === 18 && shape.rows === 240,
   '240 rows by 18 columns, got ' + JSON.stringify(shape));

console.log('case 2: the declared code is honoured');
const rt = await page.evaluate(s => {
    const t = window.PS_SHELL.project.table;
    const v = (t.columns.rt || []).filter(x => x != null);
    return { tokens: (t.missingTokensByCol || {}).rt || null,
             stillThere: v.indexOf(s) !== -1,
             max: Math.max.apply(null, v) };
}, sentinel);
ok(JSON.stringify(rt.tokens) === JSON.stringify([String(sentinel)]),
   'the per-column missing list carries it, got ' + JSON.stringify(rt.tokens));
ok(!rt.stillThere,
   'and ' + sentinel + ' is no longer a value in rt');
ok(rt.max < sentinel,
   'so the max is a real measurement now, got ' + rt.max);

console.log('case 3: a rule this app cannot hold is named, not dropped');
const toasts = await page.evaluate(() => Array.from(
    document.querySelectorAll('.ps-toast, [class*="toast"]'))
    .map(n => n.innerText).join(' | '));
ok(/hours/.test(toasts) && /> 999/.test(toasts),
   'the unheld rule is quoted back with its column, got ' +
   JSON.stringify(toasts.slice(0, 260)));
ok(/NOT applied/.test(toasts),
   'and it says plainly that it is not applied, got ' +
   JSON.stringify(toasts.slice(0, 260)));
ok(/rt/.test(toasts),
   'while the one that WAS applied is also reported, got ' +
   JSON.stringify(toasts.slice(0, 260)));

console.log('case 4: a file with no rules is unchanged');
await page.evaluate(() => { window.PS_SHELL.openLoader(); });
await page.waitForTimeout(300);
await page.setInputFiles('#ps-file', srcOmv);
await page.waitForTimeout(2200);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);
const plain = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const v = (t.columns.rt || []).filter(x => x != null);
    return { byCol: t.missingTokensByCol || {}, max: Math.max.apply(null, v),
             cols: t.order.length };
});
ok(Object.keys(plain.byCol).length === 0,
   'the shipped fixture declares none, so none are set, got ' +
   JSON.stringify(plain.byCol));
ok(plain.max === sentinel,
   'and its slowest trial is back as ordinary data, got ' + plain.max);
ok(plain.cols === 18, 'and it still reads 18 columns');

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('OMV MISSING RULES CHECK: ALL GREEN');
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
