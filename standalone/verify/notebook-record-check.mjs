// The Notebook export carries the RECORD, not just the picture.
//
// A kept page is evidence. What makes it evidence rather than a chart
// export is the note the user wrote under it, the date it was kept, the
// analysis it came from, and whether that source has moved on since. All
// four lived only inside the app: the PDF, the SVG and the raster exports
// carried the bare chart, so the sentence explaining a figure did not
// survive the trip out. This asserts the band exists, says the right
// things, numbers pages the way the screen does, names the section only
// when a file holds more than one, honours the dialog's checkbox, and
// leaves the stored page untouched.
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
const ctxItems = () => page.evaluate(() =>
    [...document.querySelectorAll('#ps-contextmenu [role="menuitem"], ' +
        '#ps-contextmenu button')].map(n => (n.textContent || '').trim()));
// Keep the live chart into the section whose label matches.
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
async function noteOn(pinId, text) {
    await page.evaluate((id) => {
        const p = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]');
        p.scrollIntoView({ block: 'center' });
        p.click();
    }, pinId);
    await page.waitForTimeout(250);
    await page.click('#ps-pininsp-note');
    await page.type('#ps-pininsp-note', text, { delay: 1 });
    await page.evaluate(() => document.getElementById('ps-pininsp-note').blur());
    await page.waitForTimeout(300);
}
// Drive the export dialog and hand back the captured blob as a byte string.
async function exportAndRead(format, scopeMatch, opts) {
    await page.evaluate(() => {
        window.__nbBlob = null;
        if (!URL.__nbHooked) {
            const o = URL.createObjectURL;
            URL.createObjectURL = function (b) { window.__nbBlob = b; return o.call(URL, b); };
            URL.__nbHooked = true;
        }
        window.showSaveFilePicker = undefined;
        HTMLAnchorElement.prototype.click = function () { };
    });
    await page.click('#ps-export');
    await page.waitForTimeout(350);
    await page.evaluate((m) => {
        const list = [...document.querySelectorAll(
            '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
        (list.find(n => new RegExp(m, 'i').test(n.textContent)) || list[list.length - 1]).click();
    }, scopeMatch);
    await page.waitForTimeout(400);
    await page.click('.ps-export-format:has(input[value="' + format + '"])');
    if (opts && opts.record === false)
        await page.uncheck('#ps-export-record');
    else if (opts && opts.record === true)
        await page.check('#ps-export-record');
    await page.evaluate(() => { window.__psPinExportLast = null; });
    await page.click('#ps-export-go');
    await page.waitForFunction(() => window.__psPinExportLast, null, { timeout: 30000 });
    return page.evaluate(async (fmt) => {
        const b = window.__nbBlob;
        const buf = new Uint8Array(await b.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        if (fmt !== 'pdf') return { text: s, stamp: window.__psPinExportLast };
        // jsPDF writes with compress:true, so the drawn text lives inside
        // FlateDecode streams. A raw byte search would pass for the wrong
        // reason (and fail for the wrong one), so inflate every stream.
        // Match the keyword followed by its newline: a bare indexOf also
        // hits "endstream" and walks the offsets off the real data.
        let out = s;
        const re = /stream\r?\n/g;
        let m;
        while ((m = re.exec(s))) {
            const start = m.index + m[0].length;
            let end = s.indexOf('endstream', start);
            if (end === -1) break;
            // Trim the newline PDF writes before the keyword: node's inflate
            // tolerates trailing bytes, DecompressionStream rejects them.
            while (end > start && (s[end - 1] === '\n' || s[end - 1] === '\r')) end--;
            const bytes = buf.subarray(start, end);
            for (const kind of ['deflate', 'deflate-raw']) {
                try {
                    const ab = await new Response(new Blob([bytes]).stream()
                        .pipeThrough(new DecompressionStream(kind))).arrayBuffer();
                    out += '\n' + new TextDecoder('latin1').decode(ab);
                    break;
                } catch (e) { /* try the next encoding, else skip */ }
            }
        }
        // PDF text operators split a run into (chunk)Tj pieces; join the
        // parenthesised literals so a sentence reads back as a sentence.
        const joined = (out.match(/\(((?:\\.|[^\\)])*)\)/g) || [])
            .map(x => x.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('');
        return { text: out + '\n' + joined, stamp: window.__psPinExportLast };
    }, format);
}

console.log('case 1: the dialog offers the record, on by default');
await keepInto('Section 1');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);
await page.click('#ps-export');
await page.waitForTimeout(350);
await page.evaluate(() => [...document.querySelectorAll(
    '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')][0].click());
await page.waitForTimeout(400);
const dlg = await page.evaluate(() => ({
    shown: document.getElementById('ps-export-record-field').style.display !== 'none',
    checked: document.getElementById('ps-export-record').checked,
    label: document.querySelector('#ps-export-record-field .ps-export-check span').textContent,
}));
ok(dlg.shown && dlg.checked,
   'the Notebook exporter shows the record option, checked ("' + dlg.label + '")');
await page.click('#ps-export-close');
await page.waitForTimeout(300);
const chartSideHidden = await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    return true;
});
ok(chartSideHidden, 'switched to Charts to check the chart exporter is unaffected');
await page.click('#ps-export');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
    document.getElementById('ps-export-record-field').style.display === 'none' &&
    document.getElementById('ps-export-caption-field').style.display !== 'none'),
   'a CHART export still shows its caption box and no record option');
await page.click('#ps-export-close');
await page.waitForTimeout(300);

console.log('case 2: the note, the date, the analysis and the drift ride the PDF');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
const firstId = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins[0].id);
const NOTE = 'The high dose group sits well clear of control.';
await noteOn(firstId, NOTE);
const pdf = await exportAndRead('pdf', 'notebook');
ok(pdf.text.indexOf(NOTE) !== -1,
   'the note I wrote about the page is in the PDF');
ok(/Page 1 of 1/.test(pdf.text),
   'so is the page number the card shows on screen');
ok(/kept /.test(pdf.text), 'so is the date it was kept');
ok(/Compare Groups: condition, score/.test(pdf.text),
   'so is the analysis and the variables it came from');
ok(pdf.stamp.pages === 1 && pdf.stamp.format === 'pdf',
   'and the export stamp is unchanged in shape');

console.log('case 3: an edited source chart says so on the exported page');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(400);
await page.evaluate(() => window.setOption('graphType', 'box'));
await page.waitForTimeout(1700);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
const drifted = await exportAndRead('pdf', 'notebook');
ok(/source chart has changed since this page was kept/.test(drifted.text),
   'the honest freshness verdict travels with the record, in the export ' +
   'a reader actually sees');

console.log('case 4: page numbers are per section, and the section is ' +
            'named only when the file holds more than one');
await keepInto('New section');
await keepInto('Section 2');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);
const all = await exportAndRead('pdf', 'Entire notebook');
ok(/Section 1 · Page 1 of 1/.test(all.text) &&
   /Section 2 · Page 1 of 2/.test(all.text) &&
   /Section 2 · Page 2 of 2/.test(all.text),
   'every page names its section and counts within it, matching the cards');
const oneSection = await exportAndRead('pdf', 'This section');
ok(/Page 1 of 2/.test(oneSection.text) && !/Section 2 · Page/.test(oneSection.text),
   'a single-section file drops the redundant section name');

console.log('case 4b: one page exported alone still knows where it sits');
// Section 2 holds two pages. Export only the second.
await page.evaluate(() => {
    const p = [...document.querySelectorAll('.ps-pinpage')][1];
    p.scrollIntoView({ block: 'center' });
    p.click();
});
await page.waitForTimeout(300);
const one = await exportAndRead('pdf', 'This page');
ok(/Page 2 of 2/.test(one.text) && !/Page 1 of 1/.test(one.text),
   "the number is the page's place in its SECTION, not in the export, so " +
   'exporting page 2 alone does not relabel it page 1 of 1');

console.log('case 5: SVG carries it too, and unchecking the box removes it');
const svgOn = await exportAndRead('svg', 'This section');
ok(/data-role="pin-record"/.test(svgOn.text),
   'an SVG export nests the page and typesets the record under it');
const svgOff = await exportAndRead('svg', 'This section', { record: false });
ok(!/data-role="pin-record"/.test(svgOff.text),
   'unchecking the box exports the bare page, exactly as before');
await exportAndRead('svg', 'This section', { record: true });

console.log('case 6: the stored page is never rewritten');
const untouched = await page.evaluate(() => {
    const p = window.PS_SHELL.project.pinboards.flatMap(b => b.pins);
    return p.every(x => x.src.indexOf('data:image/svg+xml') === 0 &&
        x.src.indexOf('pin-record') === -1);
});
ok(untouched,
   'composition happens at export time: the kept page keeps its own bytes');

ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join(' | ') + ')');
console.log('notebook-record-check: all cases passed');
await browser.close();
