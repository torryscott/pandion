// Fresh-analysis delivery regression for Pandion Plots' jamovi Html wrapper.
//
// Unlike the earlier scratch harness, this starts with one initial delivery.
// It then exercises the real user sequence, including empty -> first snapshot,
// jamovi's native Image + BR + annotation insertion, a no-op R rerun, and a
// genuine data change. It measures the complete results-root height on every
// animation frame, not merely SVG identity.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp']
        .filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try next */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_SNAPCHURN_OUT || '/tmp/gb2-snapchurn';
const read = name => fs.readFileSync(path.join(OUT, name + '.html'), 'utf8');
const content = {
    ungrouped: read('ungrouped-empty'),
    grouped: read('grouped-empty'),
    first: read('grouped-snap1'),
    same: read('grouped-snap1-again'),
    second: read('grouped-snap2'),
    changed: read('grouped-real-change'),
};

let failures = 0;
function expect(label, condition, detail = '') {
    if (condition) console.log('  ok: ' + label + (detail ? ' ' + detail : ''));
    else {
        failures++;
        console.log('  FAIL: ' + label + (detail ? ' ' + detail : ''));
    }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

await page.setContent(`<!doctype html><meta charset="utf-8">
<style>
html, body { margin: 0; padding: 0; }
body { font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
jmv-results-group, jmv-results-html, jmv-results-image, jmv-annotation {
    display: block; position: relative;
}
#results { width: 620px; }
.jmv-results-group-container { margin-left: 0; }
jmv-results-html { width: 500px; }
jmv-results-html > .content { padding-bottom: 12px; }
.jmv-annotation { margin: 3px 0; border-bottom: 1px dashed transparent; }
.jmv-annotation .ql-editor { height: 16px; }
.jmv-results-item.hidden { opacity: 0; height: 0%; }
.jmv-results-image-image { width: 700px; height: 450px; }
</style>
<script>
class ResultsHtml extends HTMLElement {
    constructor() {
        super();
        this.model = { attributes: { element: { content: '' } } };
        this.ready = Promise.resolve();
    }
    connectedCallback() {
        if (!this.querySelector('.content')) {
            const div = document.createElement('div');
            div.className = 'content';
            this.appendChild(div);
        }
    }
    render() {
        const doc = this.model.attributes.element;
        if (!doc.content) return;
        this.ready = Promise.resolve().then(() => {
            const target = this.querySelector('.content');
            target.innerHTML = doc.content;
            for (const script of [...target.querySelectorAll('script')]) {
                const fresh = document.createElement('script');
                fresh.textContent = script.textContent;
                document.head.appendChild(fresh);
                fresh.remove();
                script.remove();
            }
        });
    }
}
customElements.define('jmv-results-html', ResultsHtml);
</script>
<jmv-results-group id="results">
  <div class="jmv-results-group-container" id="group-container">
    <jmv-results-html class="jmv-results-item" id="widget-item"></jmv-results-html>
    <br data-owner="widget"><jmv-annotation data-owner="widget"><div class="ql-editor"></div></jmv-annotation>
    <jmv-results-html class="jmv-results-item" id="export-item"></jmv-results-html>
    <br data-owner="export"><jmv-annotation data-owner="export"><div class="ql-editor"></div></jmv-annotation>
  </div>
</jmv-results-group>`);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function deliver(html) {
    await page.evaluate(value => {
        const item = document.getElementById('widget-item');
        item.model.attributes.element.content = value;
        item.render();
    }, html);
    await page.evaluate(async () => {
        const item = document.getElementById('widget-item');
        await item.ready;
    });
    await sleep(120);
}

async function state() {
    return page.evaluate(() => {
        const root = document.getElementById('results');
        const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
        if (svg && !svg.__snapChurnIdentity) svg.__snapChurnIdentity = Math.random();
        const image = document.querySelector('jmv-results-image[data-name="c25hcHNob3RJbWFnZQ=="]');
        const br = image && image.nextElementSibling;
        const annotation = br && br.nextElementSibling;
        return {
            height: root.getBoundingClientRect().height,
            bodyHeight: document.body.getBoundingClientRect().height,
            svgIdentity: svg ? svg.__snapChurnIdentity : null,
            widgetId: document.querySelector('.graphbuilder2-host')?.id || null,
            modelHasSnapshot: itemModel().includes('data-role="gb2-static-fallback"'),
            domHasSnapshot: !!document.querySelector('[data-role="gb2-static-fallback"]'),
            imageDisplay: image ? getComputedStyle(image).display : null,
            brDisplay: br ? getComputedStyle(br).display : null,
            annotationDisplay: annotation ? getComputedStyle(annotation).display : null,
        };
        function itemModel() {
            return document.getElementById('widget-item').model.attributes.element.content || '';
        }
    });
}

async function measureDelivery(html, mutateBefore) {
    const before = await state();
    await page.evaluate(() => { window.__heightFrames = []; });
    if (mutateBefore) await page.evaluate(mutateBefore);
    await page.evaluate(value => {
        const root = document.getElementById('results');
        const started = performance.now();
        function frame() {
            window.__heightFrames.push({
                t: performance.now() - started,
                h: root.getBoundingClientRect().height,
                body: document.body.getBoundingClientRect().height,
            });
            if (performance.now() - started < 900) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        const item = document.getElementById('widget-item');
        item.model.attributes.element.content = value;
        item.render();
    }, html);
    await sleep(1000);
    const frames = await page.evaluate(() => window.__heightFrames || []);
    const heights = [before.height, ...frames.map(frame => frame.h)];
    return {
        before,
        frames,
        range: heights.length ? Math.max(...heights) - Math.min(...heights) : Infinity,
        final: await state(),
    };
}

function insertNativeSnapshot() {
    const group = document.getElementById('group-container');
    const exportItem = document.getElementById('export-item');
    const image = document.createElement('jmv-results-image');
    image.className = 'jmv-results-item hidden';
    image.setAttribute('data-name', 'c25hcHNob3RJbWFnZQ==');
    const heading = document.createElement('h2');
    heading.className = 'jmv-results-image-title';
    heading.textContent = 'Chart (static copy)';
    const picture = document.createElement('div');
    picture.className = 'jmv-results-image-image';
    image.append(heading, picture);
    const br = document.createElement('br');
    br.setAttribute('data-owner', 'snapshot');
    const annotation = document.createElement('jmv-annotation');
    annotation.setAttribute('data-owner', 'snapshot');
    annotation.innerHTML = '<div class="ql-editor"></div>';
    group.insertBefore(image, exportItem);
    group.insertBefore(br, exportItem);
    group.insertBefore(annotation, exportItem);
    setTimeout(() => image.classList.remove('hidden'), 200);
}

await deliver(content.ungrouped);
await sleep(500);
const initial = await state();
expect('initial Scatter rendered', initial.svgIdentity !== null);

const grouped = await measureDelivery(content.grouped);
expect('real Group By delivery replaces the SVG',
       grouped.final.svgIdentity !== initial.svgIdentity);
expect('real Group By keeps total results height stable', grouped.range < 1,
       `(range ${grouped.range.toFixed(3)} px)`);

const first = await measureDelivery(content.first, insertNativeSnapshot);
expect('first snapshot does not rebuild the live SVG',
       first.final.svgIdentity === grouped.final.svgIdentity);
expect('first snapshot advances the saved model content',
       first.final.modelHasSnapshot);
expect('healthy live DOM does not need a duplicate fallback',
       !first.final.domHasSnapshot);
expect('native snapshot Image is hidden', first.final.imageDisplay === 'none');
expect('native snapshot BR companion is hidden', first.final.brDisplay === 'none');
expect('native snapshot annotation companion is hidden',
       first.final.annotationDisplay === 'none');
expect('first snapshot keeps total results height stable', first.range < 1,
       `(range ${first.range.toFixed(3)} px)`);
expect('first snapshot returns to the exact grouped height',
       Math.abs(first.final.height - grouped.final.height) < 1,
       `(${grouped.final.height.toFixed(3)} -> ${first.final.height.toFixed(3)} px)`);

const same = await measureDelivery(content.same);
expect('no-op R rerun preserves SVG identity',
       same.final.svgIdentity === first.final.svgIdentity);
expect('no-op R rerun keeps height stable', same.range < 1,
       `(range ${same.range.toFixed(3)} px)`);

const second = await measureDelivery(content.second);
expect('later snapshot preserves SVG identity',
       second.final.svgIdentity === same.final.svgIdentity);
expect('later snapshot keeps height stable', second.range < 1,
       `(range ${second.range.toFixed(3)} px)`);

const changed = await measureDelivery(content.changed);
expect('genuine data change still rebuilds the chart',
       changed.final.svgIdentity !== second.final.svgIdentity);
expect('genuine same-size chart change keeps height stable', changed.range < 1,
       `(range ${changed.range.toFixed(3)} px)`);

expect('no page errors', errors.length === 0,
       errors.length ? errors.slice(0, 2).join(' | ') : '');

await browser.close();
if (failures) {
    console.error(`snapchurn: ${failures} failure(s)`);
    process.exit(1);
}
console.log('snapchurn: PASS');
