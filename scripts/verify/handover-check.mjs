// The Svg-element handover happens on OUR schedule, not jamovi's.
//
// The grip and the Export button stand down for jamovi's own controls only
// when BOTH the chart is inside jmv-results-svg AND the matching switch is
// on (gb2_handover_resize / gb2_handover_export in R/widget.R). Without the
// switches this would fire the moment any jamovi build ships that element,
// possibly before the replacements are finished.
//
// Three states are asserted: production today, the Svg element with the
// handover still pending, and the handover switched on.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const B = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_HANDOVER_OUT || '/tmp/gb2-handover';
const b = await chromium.launch();
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { console.log('  FAIL ' + m); fails++; } };

const file = `${OUT}/h_${B}.html`;
const html = readFileSync(file, 'utf8');
const pm = html.match(/var __gb2_payload = (\{.*?\});\n/s);
if (!pm) { console.log('  FAIL could not read the payload'); process.exit(1); }

async function state(wrapTag, handover) {
  const page = await (await b.newContext()).newPage();
  await page.addInitScript(() => { window.setOption = function () {}; });
  await page.goto('file://' + file);
  await page.waitForTimeout(1400);
  await page.evaluate(([tag, hv, baseJson]) => {
    const p = JSON.parse(baseJson);
    Object.assign(p, hv);
    let host = document.querySelector('.graphbuilder2-host');
    if (tag) {                       // re-home the chart inside a host element
      const w = document.createElement(tag);
      host.parentNode.insertBefore(w, host); w.appendChild(host);
    }
    window.__gb2_lastRenderedHash = null;
    window.GraphBuilder2.render(host.id, p);
  }, [wrapTag, handover, pm[1]]);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const ex = [...document.querySelectorAll('button')].find(x => x.title === 'Export plot');
    return {
      exportShown: !!ex && ex.style.display !== 'none',
      // the grip is a bare div identified by its resize cursor
      gripPresent: [...document.querySelectorAll('div')]
        .some(e => (e.style && e.style.cursor) === 'nwse-resize'),
    };
  });
  await page.close();
  return r;
}

// 1. production jamovi today
const prod = await state('jmv-results-html', {});
ok(prod.exportShown, 'production (Html): Export button present');
ok(prod.gripPresent, 'production (Html): resize grip present');

// 2. jamovi ships the Svg element, handover still pending -> nothing changes
const pending = await state('jmv-results-svg', {});
ok(pending.exportShown, 'Svg element, handover pending: Export button STAYS');
ok(pending.gripPresent, 'Svg element, handover pending: grip STAYS');

// 3. we flip the switches -> the module stands down
const handed = await state('jmv-results-svg',
  { svgHandoverResize: true, svgHandoverExport: true });
ok(!handed.exportShown, 'handover on: Export button stands down');
ok(!handed.gripPresent, 'handover on: grip stands down');

// 4. and the switches do nothing outside the Svg element
const wrongHost = await state('jmv-results-html',
  { svgHandoverResize: true, svgHandoverExport: true });
ok(wrongHost.exportShown && wrongHost.gripPresent,
   'switches alone do nothing in the Html path (element still required)');

console.log(`\n[${B}] HANDOVER: ${fails === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
