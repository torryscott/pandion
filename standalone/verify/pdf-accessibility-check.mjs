// Real export routes, independently parsed by pypdf (PS_PYTHON overrides
// python3). PS_PDF_OUT retains PDFs; PS_PDF_BASELINE=1 only captures fixtures
// for before/after rendering, and is NEVER a passing verification run.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire('/private/tmp/x.js')('playwright');
const out = process.env.PS_PDF_OUT || mkdtempSync(path.join(tmpdir(), 'pandion-pdf-'));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const manifest = [];
const custom = 'Control (n = 3) < Treatment: mean 12 vs 16; 95% CI. ' +
    'Caf\u00e9, \u0394 = 4, \u03b1 = .05, \u65e5\u672c\u8a9e, \ud83d\udcc8; slash \\ and <</Alt (untrusted)>>.';
const second = 'Second capture: box plot of the same two groups; medians 12 and 16.';
const caption = 'Figure 1. Synthetic observations used only to verify export behavior.';
const note = 'This note explains the first capture; its source may subsequently change.';
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // PS_CPU_THROTTLE=<rate> slows the page the way a loaded CI runner does
    // (the chart-caption case lost its caption about one run in ten there).
    if (process.env.PS_CPU_THROTTLE) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PS_CPU_THROTTLE) });
    }
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (/jsPDF PubSub Error/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { Date.now = () => 1788955200000; });
    await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE || path.join(here, '..', 'index.html'))).href);
    await page.locator('#ps-welcome-close').click();
    await page.evaluate(() => {
        PS_SHELL.loadTable('PDF verification', ['Group', 'Score'],
            [['Control', '11'], ['Control', '12'], ['Control', '13'],
             ['Treatment', '15'], ['Treatment', '16'], ['Treatment', '17']],
            { Group: 'nominal', Score: 'continuous' });
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'Group', yvar: 'Score' });
        PS_SHELL.setWorkspace('chart');
        window.setOption('graphType', 'bar');
    });
    await page.waitForTimeout(1500);
    if (await page.locator('#ps-coach-ok').isVisible()) await page.locator('#ps-coach-ok').click();
    // The export dialog focuses and selects its name field on a zero-delay
    // timer after opening. A fill that lands between the dialog opening and
    // that timer firing has its text pulled into the name field by the
    // deferred focus, so the field's input listener never stores it: that
    // is the caption a loaded CI runner lost about one run in ten. Open,
    // then wait for the dialog's own focus to settle, then write; and never
    // export until the shell's state carries the text (a real loss still
    // fails, with the state dumped so the failure explains itself).
    async function openDialog() {
        await page.click('#ps-export');
        await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'ps-export-name');
    }
    async function writeField(id, text, key) {
        await page.fill('#' + id, text);
        const stored = await page.waitForFunction(([k, v]) => {
            const c = PS_SHELL.chart(); return !!(c && c[k] === v);
        }, [key, text], { timeout: 5000 }).then(() => true, () => false);
        if (!stored) {
            const st = await page.evaluate(([k, i]) => ({
                stored: (PS_SHELL.chart() || {})[k], field: document.getElementById(i).value,
                name: document.getElementById('ps-export-name').value,
                active: document.activeElement ? document.activeElement.id : null,
                chart: (PS_SHELL.chart() || {}).id }), [key, id]);
            throw new Error(id + ' was not stored on the chart: ' + JSON.stringify(st));
        }
    }
    async function description(text) {
        await openDialog();
        await writeField('ps-export-description', text, 'exportDescription');
        await page.keyboard.press('Escape');
    }
    async function save(name, bytes, expected) {
        writeFileSync(path.join(out, name + '.pdf'), Buffer.from(bytes));
        manifest.push({ file: name + '.pdf', pages: expected });
        console.log('  captured ' + name);
    }
    async function chartPdf(name, expected) {
        const bytes = await page.evaluate(async () => Array.from(new Uint8Array(
            await (await PS_SHELL.exportBlob('pdf', 96, 'white')).arrayBuffer())));
        await save(name, bytes, [expected]);
    }
    await openDialog();
    const generated = await page.inputValue('#ps-export-description');
    assert(generated.length > 40);
    await page.keyboard.press('Escape');
    await chartPdf('chart-generated', { alt: generated, vector: true });
    await description(custom);
    await chartPdf('chart-unicode', { alt: custom, vector: true });
    // A second export must not duplicate tags or retain PDF object IDs.
    await chartPdf('chart-repeat', { alt: custom, vector: true });
    await openDialog();
    await writeField('ps-export-caption', caption, 'caption');
    await page.keyboard.press('Escape');
    await chartPdf('chart-caption', { alt: custom + '\nCaption: ' + caption, vector: true });

    async function keep() {
        await page.evaluate(() => PS_SHELL.setWorkspace('chart'));
        await page.waitForTimeout(300);
        const svg = page.locator('svg[data-role="gb2-chart-svg"]');
        await svg.click({ button: 'right', position: { x: 40, y: 20 } });
        await page.locator('#ps-contextmenu button').filter({ hasText: 'Keep to Notebook' }).click();
        await page.locator('#ps-contextmenu button').filter({ hasText: /^Section 1$/ }).click();
        await page.waitForTimeout(450);
    }
    await keep();
    await page.evaluate(() => window.setOption('graphType', 'box'));
    await page.waitForTimeout(600);
    await description(second);
    await keep();
    await description('Later description, which must never replace a kept page description.');
    await page.evaluate(() => PS_SHELL.setWorkspace('pinboard'));
    await page.locator('.ps-pinpage').first().click();
    await page.fill('#ps-pininsp-note', note);
    await page.locator('#ps-pininsp-note').blur();
    assert((await page.evaluate(() => PS_SHELL.openProjectText(PS_SHELL.projectText()))).ok);
    await page.evaluate(() => PS_SHELL.setWorkspace('pinboard'));

    // Capture the real download fallback after the dialog generates bytes.
    // No native OS Save-dialog acceptance is implied by this interception.
    await page.evaluate(() => {
        const create = URL.createObjectURL;
        URL.createObjectURL = function (b) {
            if (b.type === 'application/pdf') window.__pdfCapture = b;
            return create.call(this, b);
        };
        window.showSaveFilePicker = undefined;
        HTMLAnchorElement.prototype.click = function () {};
    });
    async function notebook(name, expected, record = true) {
        await page.click('#ps-export');
        await page.locator('#ps-contextmenu button').filter({ hasText: /notebook/i }).click();
        await page.click('.ps-export-format:has(input[value="pdf"])');
        await page.locator('#ps-export-record').setChecked(record);
        await page.evaluate(() => { window.__pdfCapture = null; });
        await page.click('#ps-export-go');
        await page.waitForFunction(() => !!window.__pdfCapture);
        const bytes = await page.evaluate(async () => Array.from(new Uint8Array(
            await window.__pdfCapture.arrayBuffer())));
        await save(name, bytes, expected);
        await page.locator('#ps-export-go').waitFor({ state: 'hidden' });
    }
    const before = await page.evaluate(() => JSON.stringify(PS_SHELL.project.pinboards));
    await notebook('notebook', [
        { includes: [custom, note, 'Page 1 of 2', 'kept '], excludes: ['Later description'], vector: true },
        { includes: [second, 'Page 2 of 2'], excludes: [note, 'Later description'], vector: true },
    ]);
    await notebook('notebook-no-record', [
        { alt: custom, vector: true }, { alt: second, vector: true },
    ], false);
    assert.equal(await page.evaluate(() => JSON.stringify(PS_SHELL.project.pinboards)), before,
        'PDF export must not modify stored Notebook pages');

    // Open old-format captures via the actual project loader: one old vector
    // without srcAlt, and one stored bitmap with a user-written explanation.
    const project = JSON.parse(await page.evaluate(() => PS_SHELL.projectText()));
    project.project.pinboards[0].pins.forEach(p => { delete p.srcAlt; });
    project.project.pinboards[0].pins[1].src = 'data:image/png;base64,' +
        readFileSync(path.join(here, 'fixtures', 'probe-image.png')).toString('base64');
    project.project.pinboards[0].pins[1].note = 'Legacy bitmap: a supplied test image with colored shapes. Original characters: \ud800 / \u0001.';
    const opened = await page.evaluate(text => PS_SHELL.openProjectText(text), JSON.stringify(project));
    assert(opened.ok, JSON.stringify(opened));
    await page.evaluate(() => PS_SHELL.setWorkspace('pinboard'));
    await notebook('notebook-legacy', [
        { includes: ['Visible text:', 'Control', note], vector: true },
        { includes: ['Legacy bitmap: a supplied test image', 'Original characters: \\uD800 / \\u0001.'], vector: false },
    ]);

    // Saved descriptions can be longer than the editor's typing limit;
    // the Figure alternative must not inherit the metadata's 2,000-char cap.
    const longAlt = ('Long saved description. ' + 'Synthetic groups retain their original observations. '.repeat(48)).trim();
    const longProject = JSON.parse(await page.evaluate(() => PS_SHELL.projectText()));
    longProject.project.charts[0].exportDescription = longAlt;
    longProject.project.charts[0].caption = '';
    assert((await page.evaluate(text => PS_SHELL.openProjectText(text), JSON.stringify(longProject))).ok);
    await page.evaluate(() => PS_SHELL.setWorkspace('chart'));
    await page.click('#ps-export');
    assert.equal(await page.inputValue('#ps-export-description'), longAlt);
    await page.keyboard.press('Escape');
    await chartPdf('chart-long-description', { alt: longAlt, vector: true });

    await page.evaluate(() => { PS_SHELL.addChart(); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'Group', yvar: 'Score' }); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { PS_SHELL.setWorkspace('layout'); PS_SHELL.showLayoutGallery(); });
    await page.click('[data-layout-template="two-columns"]');
    await page.click('#ps-layout-gallery-create');
    await page.waitForTimeout(1800);
    assert.equal(await page.evaluate(() => PS_SHELL.chart().items.filter(i => i.kind === 'chart').length), 2);
    await page.click('#ps-export');
    const layout = await page.inputValue('#ps-export-description');
    assert.match(layout, /Multi-panel figure/);
    assert.match(layout, /2 charts:/);
    await page.keyboard.press('Escape');
    await chartPdf('layout', { alt: layout, vector: true });
    assert.deepEqual(errors, []);
} finally {
    await browser.close();
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (process.env.PS_PDF_BASELINE === '1') {
    console.log('BASELINE CAPTURE ONLY - structure was not accepted');
} else {
    const result = spawnSync(process.env.PS_PYTHON || 'python3',
        [path.join(here, 'pdf-structure-check.py'), path.join(out, 'manifest.json'), '--guard-selftest'],
        { encoding: 'utf8' });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    assert.equal(result.status, 0, result.error?.message || 'Independent PDF structure check failed');
    console.log('PDF ACCESSIBILITY CHECK: PASS');
}
