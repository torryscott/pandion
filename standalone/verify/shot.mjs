// A pixel baseline for the design-token work (punch list 24 and its
// consequences 31, 32, 33).
//
// Migrating 388 hex literals onto a token layer is supposed to change NOTHING
// on screen; collapsing the scales and raising the grays afterwards is supposed
// to change specific things. Neither claim is checkable by the rest of the
// suite, which asserts structure and text. So: capture the same surfaces
// before and after, and diff them.
//
//   node verify/shot.mjs before        writes /tmp/ps-shots/before/*.png
//   node verify/shot.mjs after         writes /tmp/ps-shots/after/*.png
//   node verify/shot.mjs diff          reports per-surface pixel differences
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
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

const mode = process.argv[2] || 'before';
const OUT = '/tmp/ps-shots';

// ---- a minimal PNG decoder, so the diff needs no extra dependency ----
function decodePng(buf) {
    let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        pos += len + 12;
    }
    if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2))
        throw new Error(`unsupported PNG (depth ${bitDepth}, color ${colorType})`);
    const channels = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(height * stride);
    let rp = 0;
    for (let y = 0; y < height; y++) {
        const filter = raw[rp++];
        const line = raw.subarray(rp, rp + stride);
        rp += stride;
        const cur = out.subarray(y * stride, (y + 1) * stride);
        const prior = y ? out.subarray((y - 1) * stride, y * stride) : null;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? cur[x - channels] : 0;
            const b = prior ? prior[x] : 0;
            const c = (prior && x >= channels) ? prior[x - channels] : 0;
            let v = line[x];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            }
            cur[x] = v & 0xff;
        }
    }
    return { width, height, channels, data: out };
}

if (mode === 'diff') {
    const names = fs.readdirSync(path.join(OUT, 'before'))
        .filter(n => n.endsWith('.png'));
    let worst = 0, report = [];
    for (const n of names) {
        const a = decodePng(fs.readFileSync(path.join(OUT, 'before', n)));
        const b = decodePng(fs.readFileSync(path.join(OUT, 'after', n)));
        if (a.width !== b.width || a.height !== b.height) {
            report.push(`${n}: SIZE ${a.width}x${a.height} -> ${b.width}x${b.height}`);
            worst = 100;
            continue;
        }
        let diff = 0, maxDelta = 0;
        for (let i = 0; i < a.data.length; i += a.channels) {
            let d = 0;
            for (let c = 0; c < 3; c++)
                d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]));
            if (d > 2) { diff++; maxDelta = Math.max(maxDelta, d); }
        }
        const pct = (diff / (a.width * a.height)) * 100;
        worst = Math.max(worst, pct);
        report.push(`${n.padEnd(22)} ${pct.toFixed(3)}% of pixels differ` +
                    (diff ? ` (max channel delta ${maxDelta})` : ''));
    }
    console.log(report.join('\n'));
    console.log(`\nworst surface: ${worst.toFixed(3)}%`);
    process.exit(0);
}

const { chromium } = loadPlaywright();
const dir = path.join(OUT, mode);
fs.mkdirSync(dir, { recursive: true });
const pageUrl = 'file://' + path.resolve(
    new URL('.', import.meta.url).pathname, '..', 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
                                     deviceScaleFactor: 1 });
await page.goto(pageUrl);
await page.waitForTimeout(700);

async function shot(name) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(dir, name + '.png') });
    console.log('  shot ' + name);
}

// The surfaces a user meets in their first minute, which is where item 31
// says four different designs for the same conceptual object show up.
await shot('01-welcome');
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1100);
await shot('02-chart');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await shot('03-data');
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await shot('04-inspector');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.evaluate(() => window.PS_SHELL.runCommand('export'));
await shot('05-exporter');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.runCommand('open'));
await shot('06-loader');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
await shot('07-preferences');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.runCommand('new-chart'));
await shot('08-gallery');
await page.keyboard.press('Escape');
await page.evaluate(async () => {
    window.PS_SHELL.addLayout();
    await new Promise(r => setTimeout(r, 500));
});
await shot('09-layout');
await page.evaluate(() => {
    document.querySelector('[data-ps-menu="file"]').click();
});
await shot('10-menu');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose &&
    window.PS_SHELL.showHelpMeChoose());
await shot('11-hmc');

await browser.close();
console.log(`\n${mode} shots in ${dir}`);
