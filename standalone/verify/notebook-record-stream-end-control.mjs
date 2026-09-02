// notebook-record-stream-end-control.mjs - the CONTROL for the candidate-end
// cascade in standalone/verify/notebook-record-check.mjs (Sep 2026; the
// cascade was designed Aug 24 2026 but never landed, and its control lived
// in a session scratchpad that was wiped - this file is the durable copy,
// kept beside the probe it controls; scratchpad/ is gitignored).
//
// NOT in run.sh's roster (300 exports take about three minutes); run it by
// hand after any change to the probe's extractor or to the PDF exporter:
//   node standalone/verify/notebook-record-stream-end-control.mjs
//   PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/notebook-record-stream-end-control.mjs
//
// The hazard: jsPDF writes "<flate data>\nendstream". The last data byte is
// the low byte of the Adler-32 checksum, which is 0x0A or 0x0D about 1 run
// in 128 per stream. An extractor that strips "all trailing newlines" by
// byte class eats that byte too, DecompressionStream rejects the truncated
// stream, and the page whose record lived in it silently drops out of the
// text. The failure clusters in time (the plaintext differs across probe
// runs only by the kept hh:mm) and it took every dist gate red on Sep 2.
//
// Recipe: export the three-page, two-section notebook N times with a
// different note each time (so the checksum is effectively random per
// export), and run BOTH extractors over every blob:
//   hazard      = exports with at least one stream whose last data byte is
//                 0x0A/0x0D (measured directly from the bytes);
//   naiveMiss   = exports where the naive trim loses one of the three
//                 "Section n · Page i of k" lines;
//   cascadeMiss = the same for the cascade.
// Asserts: hazard > 0 (the run actually met the condition), naiveMiss > 0,
// every naiveMiss export is a hazard export (the mechanism, not a race),
// and cascadeMiss === 0. N defaults to 300 (expected hazard ~ 6-9).
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

const N = Number(process.env.NRC_N || 300);
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
}

async function chartOrigin() {
    return page.evaluate(() => {
        const h = document.querySelector('.graphbuilder2-host');
        let best = null, a = 0;
        for (const s of h.querySelectorAll('svg')) {
            const r = s.getBoundingClientRect();
            if (r.width * r.height > a) { a = r.width * r.height; best = r; }
        }
        return { x: best.x, y: best.y };
    });
}
async function keepInto(label) {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(350);
    const o = await chartOrigin();
    await page.mouse.click(o.x + 40, o.y + 20, { button: 'right' });
    await page.waitForTimeout(250);
    await page.evaluate(() => [...document.querySelectorAll(
        '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')]
        .find(n => /Keep to Notebook/.test(n.textContent)).click());
    await page.waitForTimeout(300);
    await page.evaluate((m) => {
        const list = [...document.querySelectorAll(
            '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
        (list.find(n => n.textContent.trim() === m) || list[0]).click();
    }, label);
    await page.waitForTimeout(850);
}

// One "Entire notebook" PDF export; returns the analysis of its bytes.
async function exportAndAnalyse(iter) {
    await page.evaluate((i) => {
        window.__nbBlob = null;
        if (!URL.__nbHooked) {
            const o = URL.createObjectURL;
            URL.createObjectURL = function (b) { window.__nbBlob = b; return o.call(URL, b); };
            URL.__nbHooked = true;
        }
        window.showSaveFilePicker = undefined;
        HTMLAnchorElement.prototype.click = function () { };
        // A different note on EVERY page per export: each page's content
        // stream, and with it its checksum byte, then changes every time
        // instead of drifting by the minute. (Varying one page's note only
        // randomises that page; the others stay byte-identical within a
        // minute, which is exactly the clustering the probe suffered.)
        const pins = window.PS_SHELL.project.pinboards.flatMap(b => b.pins);
        pins.forEach((p, k) => {
            p.note = 'Control export ' + i + ' page ' + k + ' ' +
                'x'.repeat((i + 3 * k) % 17) + ' ' +
                Math.random().toString(36).slice(2, 2 + ((i + k) % 9));
        });
    }, iter);
    await page.click('#ps-export');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
        const list = [...document.querySelectorAll(
            '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
        (list.find(n => /Entire notebook/i.test(n.textContent)) || list[list.length - 1]).click();
    });
    await page.waitForTimeout(250);
    await page.click('.ps-export-format:has(input[value="pdf"])');
    await page.evaluate(() => { window.__psPinExportLast = null; });
    await page.click('#ps-export-go');
    await page.waitForFunction(() => window.__psPinExportLast, null, { timeout: 30000 });
    return page.evaluate(async () => {
        const buf = new Uint8Array(await window.__nbBlob.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        const inflate = async (bytes) => {
            for (const kind of ['deflate', 'deflate-raw']) {
                try {
                    const ab = await new Response(new Blob([bytes]).stream()
                        .pipeThrough(new DecompressionStream(kind))).arrayBuffer();
                    return new TextDecoder('latin1').decode(ab);
                } catch (e) { /* next */ }
            }
            return null;
        };
        const lines = (out) => {
            const joined = (out.match(/\(((?:\\.|[^\\)])*)\)/g) || [])
                .map(x => x.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('');
            const t = out + '\n' + joined;
            return [/Section 1 · Page 1 of 1/.test(t), /Section 2 · Page 1 of 2/.test(t),
                    /Section 2 · Page 2 of 2/.test(t)].filter(Boolean).length;
        };
        let naive = s, cascade = s, hazard = 0, streams = 0;
        const re = /stream\r?\n/g;
        let m;
        while ((m = re.exec(s))) {
            const start = m.index + m[0].length;
            const end = s.indexOf('endstream', start);
            if (end === -1) break;
            // /stream\r?\n/ also matches inside the previous "endstream\n";
            // that phantom span (from there to the NEXT endstream) ends on
            // the same byte as a real stream and would double-count the
            // hazard. Skip it: a real keyword is not preceded by "end".
            if (s.slice(Math.max(0, m.index - 3), m.index) === 'end') continue;
            streams++;
            // The hazard, read straight off the bytes: jsPDF's separator is
            // the one "\n" at end-1, so the data's last byte is at end-2.
            const last = s[end - 2];
            if (last === '\n' || last === '\r') hazard++;
            // Naive: strip every trailing newline by byte class.
            let e1 = end;
            while (e1 > start && (s[e1 - 1] === '\n' || s[e1 - 1] === '\r')) e1--;
            const tN = await inflate(buf.subarray(start, e1));
            if (tN !== null) naive += '\n' + tN;
            // Cascade: candidate ends, first that inflates wins.
            let tC = null;
            for (const cut of [end - 1, end - 2, end]) {
                if (cut <= start) continue;
                tC = await inflate(buf.subarray(start, cut));
                if (tC !== null) break;
            }
            if (tC !== null) cascade += '\n' + tC;
        }
        return { streams, hazard, naiveLines: lines(naive), cascadeLines: lines(cascade) };
    });
}

console.log('setup: three pages in two sections');
await keepInto('Section 1');
await keepInto('New section');
await keepInto('Section 2');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);

console.log('control: ' + N + ' exports, both extractors over every blob');
let hazardRuns = 0, naiveMiss = 0, cascadeMiss = 0, naiveMissOutsideHazard = 0;
let streamsPer = null;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
    const r = await exportAndAnalyse(i);
    if (streamsPer === null) streamsPer = r.streams;
    const hz = r.hazard > 0;
    if (hz) hazardRuns++;
    if (r.naiveLines < 3) { naiveMiss++; if (!hz) naiveMissOutsideHazard++; }
    if (r.cascadeLines < 3) cascadeMiss++;
    if (r.naiveLines < 3 || r.cascadeLines < 3 || hz)
        console.log('  export ' + i + ': streams=' + r.streams + ' hazardStreams=' + r.hazard +
                    ' naiveLines=' + r.naiveLines + ' cascadeLines=' + r.cascadeLines);
    if (i % 50 === 49) console.log('  ... ' + (i + 1) + ' exports, ' +
        Math.round((Date.now() - t0) / 1000) + 's, hazard ' + hazardRuns +
        ' naiveMiss ' + naiveMiss + ' cascadeMiss ' + cascadeMiss);
}
console.log('summary: N=' + N + ' streams/export=' + streamsPer + ' hazard=' + hazardRuns +
            ' naiveMiss=' + naiveMiss + ' cascadeMiss=' + cascadeMiss +
            ' naiveMissOutsideHazard=' + naiveMissOutsideHazard);
ok(hazardRuns > 0, 'the run met the hazard: at least one export has a stream whose ' +
   'last data byte is 0x0A/0x0D (' + hazardRuns + ' of ' + N + ')');
ok(naiveMiss > 0, 'the naive byte-class trim lost a page record in ' + naiveMiss +
   ' of those exports (the pre-fix extractor goes red)');
ok(naiveMissOutsideHazard === 0, 'every naive miss is a hazard export: the mechanism ' +
   'is the checksum byte, not a gesture race');
ok(cascadeMiss === 0, 'the candidate-end cascade recovered every page in every export');
ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join(' | ') + ')');
console.log('NOTEBOOK RECORD STREAM-END CONTROL PASS');
await browser.close();
