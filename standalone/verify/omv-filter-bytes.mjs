// MANUAL DIAGNOSTIC, not a probe. Takes a file, so it is deliberately NOT in
// run.sh FEATURE_PROBES.
//
//   node standalone/verify/omv-filter-bytes.mjs path/to/file.omv
//
// It answers the one open question behind the jamovi filter disclosure. The
// reader currently steps over filter columns (see the comment at the skip site
// in js/ps-omv.js). Those columns DO occupy a full column of per-row data, and
// jamovi's own writer sends every non-virtual column's cells through
// column.raw(i) packed as int32, while internally jamovi carries
// "filter BOOLEAN NOT NULL DEFAULT true" and defines is_row_filtered as NOT
// that value. So the shape should be one int per row, truthy meaning kept.
//
// That is an inference from reading jamovi's source. It has never been checked
// against a file jamovi actually wrote, and the cost of it being wrong is a
// silently wrong row count, which is the exact failure the disclosure exists
// to prevent. This settles it.
//
// What to compare against: the N that jamovi itself reports for the same file
// with the filter on. Run Exploration then Descriptives on any variable and
// read its N. If the number below matches, the bytes are the evaluated result
// and the skip in ps-omv.js can become a read.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const file = process.argv[2];
if (!file) {
    console.error('usage: node standalone/verify/omv-filter-bytes.mjs <file.omv>');
    process.exit(2);
}
if (!fs.existsSync(file)) {
    console.error('no such file: ' + path.resolve(file));
    process.exit(2);
}

function readZip(buf) {
    let eo = -1;
    for (let i = buf.length - 22; i >= 0; i--)
        if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
    if (eo < 0) throw new Error('not a zip, so not an .omv');
    const count = buf.readUInt16LE(eo + 10);
    let p = buf.readUInt32LE(eo + 16);
    const out = {};
    for (let k = 0; k < count; k++) {
        const nLen = buf.readUInt16LE(p + 28), xLen = buf.readUInt16LE(p + 30);
        const cLen = buf.readUInt16LE(p + 32);
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const lho = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nLen).toString('utf8');
        const lnLen = buf.readUInt16LE(lho + 26), lxLen = buf.readUInt16LE(lho + 28);
        const dStart = lho + 30 + lnLen + lxLen;
        const raw = buf.slice(dStart, dStart + csize);
        out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
        p += 46 + nLen + xLen + cLen;
    }
    return out;
}

const entries = readZip(fs.readFileSync(file));
if (!entries['metadata.json'] || !entries['data.bin']) {
    console.error('this does not look like an .omv (no metadata.json or data.bin)');
    process.exit(2);
}
const meta = JSON.parse(entries['metadata.json'].toString('utf8'));
const ds = meta.dataSet || meta;
const fields = ds.fields || [];
const n = ds.rowCount || 0;
const bin = entries['data.bin'];
const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
const NA = -2147483648;

console.log('file      ' + path.basename(file));
console.log('rows      ' + n);
console.log('fields    ' + fields.length);
console.log('');

let off = 0, found = 0;
for (const f of fields) {
    const size = f.type === 'number' ? 8 : 4;
    if (f.columnType !== 'Filter') { off += size * n; continue; }
    found++;
    const vals = [];
    for (let r = 0; r < n; r++)
        vals.push(size === 8 ? dv.getFloat64(off + r * 8, true)
                             : dv.getInt32(off + r * 4, true));
    off += size * n;

    const tally = new Map();
    for (const v of vals) tally.set(v, (tally.get(v) || 0) + 1);
    const distinct = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const kept = vals.filter(v => v !== 0 && v !== NA && !Number.isNaN(v)).length;

    console.log('FILTER COLUMN  ' + (f.name || '(unnamed)'));
    console.log('  formula      ' + (f.formula || '(none)'));
    console.log('  active       ' + (f.active !== false));
    console.log('  storage      ' + f.type + ', ' + size + ' bytes per row');
    console.log('  distinct     ' + distinct.map(([v, c]) =>
        (v === NA ? 'NA' : v) + ' x' + c).join(', '));
    console.log('  truthy rows  ' + kept + ' of ' + n);

    const onlyBinary = distinct.every(([v]) => v === 0 || v === 1 || v === NA);
    console.log('');
    if (!onlyBinary) {
        console.log('  VERDICT  these are NOT plain 0/1 values. The inference is');
        console.log('           WRONG for this file, and the skip in ps-omv.js should');
        console.log('           stay a skip. Paste this whole output back.');
    } else if (kept === n) {
        console.log('  VERDICT  every row is truthy, so this filter hides nothing.');
        console.log('           Inconclusive. Redo it with a filter that actually');
        console.log('           excludes some rows, and make sure it is switched ON.');
    } else {
        console.log('  VERDICT  the shape is right. jamovi should be reporting');
        console.log('           N = ' + kept + ' for this file with the filter on.');
        console.log('           Check that against a Descriptives table in jamovi.');
        console.log('           If it matches, the bytes ARE the evaluated result.');
    }
    console.log('');
}

if (!found) {
    console.log('No filter columns in this file.');
    console.log('In jamovi, add one under Data then Filters, make sure it is');
    console.log('switched on, save, and run this again.');
    process.exit(1);
}
