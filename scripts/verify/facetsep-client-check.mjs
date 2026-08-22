// The client half of the facet-separator fix. R ships the facet levels
// whole; the engine must split "<level><sep><category>" against them
// rather than guessing at the first (or last) separator. With a level
// named "North ¦ East" the pre-fix engine drew a panel headed "North"
// whose categories read "East ¦ A" and "East ¦ B".
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const BUNDLE = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_FACETSEP_OUT || '/tmp/gb2-facetsep';
const SEP = ' ¦ ';
const HOSTILE = 'North' + SEP + 'East';

const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const page = await (await b.newContext()).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.addInitScript(() => { window.setOption = function () {}; });
await page.goto(`file://${OUT}/facetlv_${BUNDLE}.html`);
await page.waitForSelector('[data-facet-strip]', { timeout: 15000 });
await page.waitForTimeout(400);
ok(errs.length === 0, 'clean load: no page errors (' + (errs[0] || '') + ')');

// 1. The strips are keyed by the WHOLE level and read it back.
const strips = await page.$$eval('[data-facet-strip]', (els) => els.map((e) => ({
    key: e.getAttribute('data-facet-strip'),
    text: (e.textContent || '').trim()
})));
ok(strips.length === 2, `two panels drawn (got ${strips.length})`);
ok(strips.some((s) => s.key === HOSTILE), 'a strip is keyed by the whole level');
ok(strips.some((s) => s.text === HOSTILE),
   `a strip reads the whole level (got ${JSON.stringify(strips.map((s) => s.text))})`);
ok(!strips.some((s) => s.text === 'North'), 'no strip reads the truncated level');

// 2. The category tick labels are the bare categories, not the level tail.
const cats = await page.$$eval('[data-role="x-cat-label"]',
    (els) => els.map((e) => (e.textContent || '').trim()));
ok(cats.length > 0, 'category labels drawn');
ok(cats.every((c) => c === 'A' || c === 'B'),
   `every category label is bare (got ${JSON.stringify(cats)})`);
ok(!cats.some((c) => c.indexOf('East') >= 0), 'no category label carries the level tail');

// 3. Each bar belongs to the right panel: the hostile level holds the
//    16 A / 8 B split, South holds 8 A / 4 B (the fixture's counts).
const bars = await page.$$eval('[data-bar-cat]', (els) => els.map(
    (e) => e.getAttribute('data-bar-cat')).filter(Boolean));
const inHostile = bars.filter((c) => c.indexOf(HOSTILE + SEP) === 0);
ok(inHostile.length >= 2, `bars sit under the whole level (${inHostile.length})`);
ok(!bars.some((c) => c.indexOf('North' + SEP + 'A') === 0),
   'no bar is keyed to the truncated level');

await b.close();
console.log(fail ? `facetsep-client-check: FAIL (${fail}/${pass + fail})`
                 : `facetsep-client-check: PASS (${pass} checks, ${BUNDLE})`);
process.exit(fail ? 1 : 0);
