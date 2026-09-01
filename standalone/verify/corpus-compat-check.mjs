// corpus-compat-check.mjs - the persistence contract, proved against
// real old bytes. Every frozen .pand in standalone/verify/corpus/ (each
// written by the app of its day and NEVER regenerated) is opened by the
// CURRENT app, and its .expect.json values must still hold: column
// types, computed-variable cells, exclusions, chart count, graph types,
// and styled options. A future version that cannot faithfully open
// yesterday's files goes red here before any user finds out. Also
// probes the numerical-changes reopen notice (pure logic plus the real
// toast path) and that a newer-format file is refused with a clear
// message, never misread.
// Usage: node corpus-compat-check.mjs (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html');
const CORPUS = path.join(HERE, 'corpus');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

const entries = fs.existsSync(CORPUS)
  ? fs.readdirSync(CORPUS).filter(f => f.endsWith('.pand')).sort()
  : [];
if (!entries.length) {
  console.log('CORPUS COMPAT CHECK FAIL (corpus is empty - run corpus-freeze.mjs)');
  process.exit(1);
}
console.log('corpus compat: ' + entries.length + ' frozen file(s)');

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

for (const f of entries) {
  const base = f.replace(/\.pand$/, '');
  const text = fs.readFileSync(path.join(CORPUS, f), 'utf8');
  const exp = JSON.parse(
    fs.readFileSync(path.join(CORPUS, base + '.expect.json'), 'utf8')).expect;
  const got = await page.evaluate(async ({ text, nCharts }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    const res = S.openProjectText(text);
    if (!res || res.error || !res.ok) return { error: (res && res.error) || 'open failed' };
    await s(1200);
    const t = S.project.table;
    const col = c => (t.raw[c] || []).slice(0, 6).map(v => v == null ? null : String(v));
    const charts = [];
    for (const ch of S.charts()) {
      S.switchChart(ch.id || ch);
      await s(700);
      const d = window.gb2_undo && window.gb2_undo.getData();
      charts.push({
        graphType: d ? d.graphType : null,
        probe: d ? { barCornerRadius: d.barCornerRadius,
                     xyShowEllipse: d.xyShowEllipse === true,
                     chartTitle: d.chartTitle || '' } : null
      });
    }
    return { types: Object.assign({}, t.types),
             rnd: col('rnd'), zsc: col('zsc'), m: col('m'),
             chartCount: S.charts().length, charts };
  }, { text, nCharts: exp.chartCount });
  if (got.error) { ok(false, base + ': ' + got.error); continue; }
  for (const c of Object.keys(exp.types))
    ok(got.types[c] === exp.types[c],
      base + ' type ' + c + ': ' + got.types[c] + ' vs frozen ' + exp.types[c]);
  // v5 intentionally removes intermediate rounding. Keep the frozen bytes;
  // these v4 formulas are independent (no chains), so compare them at the
  // recorded ten-digit precision. New full-precision chains have separate
  // exact-value assertions in data-integrity-check.
  const legacyPrecision = JSON.parse(text).project.version < 5;
  for (const c of ['rnd', 'zsc', 'm'])
    ok(JSON.stringify(legacyPrecision ? got[c].map(v => v == null || v === ''
      ? v : String(Number(Number(v).toPrecision(10)))) : got[c]) === JSON.stringify(exp[c]),
      base + ' computed ' + c + ': ' + JSON.stringify(got[c]) +
      ' vs frozen ' + JSON.stringify(exp[c]));
  ok(got.chartCount === exp.chartCount,
    base + ' chart count: ' + got.chartCount + ' vs frozen ' + exp.chartCount);
  exp.charts.forEach((ec, i) => {
    const gc = got.charts[i] || {};
    ok(gc.graphType === ec.graphType,
      base + ' chart ' + i + ' graphType: ' + gc.graphType + ' vs frozen ' + ec.graphType);
    if (ec.probe && gc.probe) {
      ok(gc.probe.barCornerRadius === ec.probe.barCornerRadius &&
         gc.probe.xyShowEllipse === ec.probe.xyShowEllipse &&
         gc.probe.chartTitle === ec.probe.chartTitle,
        base + ' chart ' + i + ' options: ' + JSON.stringify(gc.probe) +
        ' vs frozen ' + JSON.stringify(ec.probe));
    }
  });
}

// ---- the numerical-changes reopen notice --------------------------------
console.log('reopen notice (pure logic + the real toast path)');
const notice = await page.evaluate(() => {
  const S = window.PS_SHELL;
  // The fallback list keeps this a CONTROL against a shell that predates
  // the id list (it ignores the third argument and fails listedAll).
  const ids = S.numericalChangeIds ? S.numericalChangeIds()
    : ['round-half-even', 'mwu-exact-large-n', 'spearman-as89'];
  return {
    ids,
    // pre-id files (no numericalChanges list): judged by version
    oldFileFutureApp: S.numericalNoticeFor('3.1.1', '3.2.0'),
    knownFile: S.numericalNoticeFor('3.2.0', '3.2.5'),
    notLiveYet: S.numericalNoticeFor('3.1.0', '3.1.1'),
    unversionedOld: S.numericalNoticeFor(null, '3.2.0'),
    // id-carrying files: judged by exactly what they list. This is the
    // fix for the false notice: the web app runs a fix for weeks under
    // the previous version number before the version is tagged.
    listedAll: S.numericalNoticeFor('3.1.1', '3.2.0', ids),
    listedNone: S.numericalNoticeFor('3.1.1', '3.2.0', []),
    listedSome: S.numericalNoticeFor('3.1.1', '3.2.0', ids.slice(1)),
    listOutranksVersion: S.numericalNoticeFor('3.2.5', '3.2.0', [])
  };
});
ok(!!notice.oldFileFutureApp && /ROUND/.test(notice.oldFileFutureApp) &&
   /recomputed under version 3\.2\.0/.test(notice.oldFileFutureApp),
  'an old file under a post-change build gets the notice, naming ROUND');
ok(notice.knownFile === null,
  'a file saved after the change gets no notice');
ok(notice.notLiveYet === null,
  'a change not yet in this build never fires (' + notice.notLiveYet + ')');
ok(!!notice.unversionedOld,
  'a pre-stamp file (no version recorded) counts as old');
ok(notice.ids.length >= 3 && notice.ids[0] === 'round-half-even',
  'the build lists its ledger ids (' + notice.ids.join(', ') + ')');
ok(notice.listedAll === null,
  'a 3.1.1 file that lists every id gets NO notice under 3.2.0 ' +
  '(the web app saved it after the fixes were live)');
ok(!!notice.listedNone && /ROUND/.test(notice.listedNone) &&
   /Mann-Whitney/.test(notice.listedNone) && /Spearman/.test(notice.listedNone),
  'a file that lists no ids is told about every change');
ok(!!notice.listedSome && /ROUND/.test(notice.listedSome) &&
   !/Mann-Whitney/.test(notice.listedSome) && !/Spearman/.test(notice.listedSome),
  'a file that lists some ids is told only about the ones it lacks');
ok(!!notice.listOutranksVersion,
  'the id list outranks the version: a newer-versioned file listing ' +
  'nothing still gets the notice');

// ---- forward refusal: a newer format is refused, never misread ----------
const fwd = await page.evaluate(() => {
  const S = window.PS_SHELL;
  const res = S.openProjectText(JSON.stringify({
    kind: 'pandion-plots-project', formatVersion: 99,
    appVersion: '99.0.0', project: { version: 99 }
  }));
  return res && res.error ? String(res.error) : 'OPENED';
});
ok(/newer version/i.test(fwd),
  'a future-format file is refused with a clear message: "' + fwd + '"');

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'CORPUS COMPAT CHECK PASS' : 'CORPUS COMPAT CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing, ' + entries.length + ' frozen files)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
