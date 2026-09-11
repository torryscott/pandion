// density-check.mjs - the Preferences interface-density option must be
// VISIBLE (backlog 72C8C94C: compact and comfortable looked identical -
// the old rules were min-heights that never bound plus Data-only grid
// paddings). Compact now shrinks the chrome frame itself. Targets stay
// at or above 24px in the command bar.
// Usage: node density-check.mjs  (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(400);
}

const bands = () => page.evaluate(() => {
  const h = sel => {
    const e = document.querySelector(sel);
    return e ? Math.round(e.getBoundingClientRect().height) : null;
  };
  const cmdTargets = [...document.querySelectorAll('.ps-commandbar button')]
    .filter(e => e.getBoundingClientRect().height > 0)
    .map(e => Math.round(e.getBoundingClientRect().height));
  return {
    appbar: h('.ps-appbar'), commandbar: h('.ps-commandbar'),
    statusbar: h('.ps-statusbar'),
    minCmdTarget: cmdTargets.length ? Math.min(...cmdTargets) : null,
    compactClass: document.body.classList.contains('ps-density-compact')
  };
});

console.log('case 1: comfortable is the wide default');
let m = await bands();
ok(!m.compactClass, 'compact class off by default');
ok(m.appbar >= 33 && m.commandbar >= 42 && m.statusbar >= 24,
  'comfortable bands (' + [m.appbar, m.commandbar, m.statusbar].join('/') + ')');

console.log('case 2: switching to compact through Preferences visibly shrinks the chrome');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  // real flow: Edit > Preferences > density select > Save
  const edit = [...document.querySelectorAll('.ps-appbar button, .ps-menubar button')]
    .find(x => /^Edit$/i.test((x.textContent || '').trim()));
  if (edit) { edit.click(); await s(300); }
  const prefs = [...document.querySelectorAll('button, [role="menuitem"]')]
    .find(x => /Preferences/i.test(x.textContent || '') && x.offsetParent);
  if (prefs) { prefs.click(); await s(400); }
  const sel = document.getElementById('ps-pref-density');
  if (sel) {
    sel.value = 'compact';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const save = document.getElementById('ps-preferences-save');
  if (save) { save.click(); await s(400); }
});
m = await bands();
ok(m.compactClass, 'compact class applied through the dialog');
ok(m.appbar !== null && m.appbar <= 29, 'app bar shrinks (' + m.appbar + 'px)');
ok(m.commandbar !== null && m.commandbar <= 34, 'command bar shrinks (' + m.commandbar + 'px)');
ok(m.statusbar !== null && m.statusbar <= 22, 'status bar shrinks (' + m.statusbar + 'px)');
ok(m.minCmdTarget !== null && m.minCmdTarget >= 24,
  'command-bar targets stay at 24px or more (' + m.minCmdTarget + 'px)');

console.log('case 2b: Spacious grows the same frame the other way');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const edit = [...document.querySelectorAll('.ps-appbar button, .ps-menubar button')]
    .find(x => /^Edit$/i.test((x.textContent || '').trim()));
  if (edit) { edit.click(); await s(300); }
  const prefs = [...document.querySelectorAll('button, [role="menuitem"]')]
    .find(x => /Preferences/i.test(x.textContent || '') && x.offsetParent);
  if (prefs) { prefs.click(); await s(400); }
  const sel = document.getElementById('ps-pref-density');
  if (sel) {
    sel.value = 'spacious';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const save = document.getElementById('ps-preferences-save');
  if (save) { save.click(); await s(400); }
});
m = await bands();
ok(m.appbar >= 38 && m.commandbar >= 50 && m.statusbar >= 27,
  'spacious bands (' + [m.appbar, m.commandbar, m.statusbar].join('/') + ')');
ok(m.minCmdTarget !== null && m.minCmdTarget >= 32,
  'spacious command targets grow (' + m.minCmdTarget + 'px)');
// back to compact for the reload-persistence case
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const edit = [...document.querySelectorAll('.ps-appbar button, .ps-menubar button')]
    .find(x => /^Edit$/i.test((x.textContent || '').trim()));
  if (edit) { edit.click(); await s(300); }
  const prefs = [...document.querySelectorAll('button, [role="menuitem"]')]
    .find(x => /Preferences/i.test(x.textContent || '') && x.offsetParent);
  if (prefs) { prefs.click(); await s(400); }
  const sel = document.getElementById('ps-pref-density');
  if (sel) {
    sel.value = 'compact';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const save = document.getElementById('ps-preferences-save');
  if (save) { save.click(); await s(400); }
});

console.log('case 3: the choice survives a reload');
await page.reload();
await page.waitForTimeout(900);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(400);
}
m = await bands();
ok(m.compactClass && m.commandbar <= 34, 'compact persists after reload (' + m.commandbar + 'px)');

console.log('case 4: back to comfortable restores the wide frame');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const edit = [...document.querySelectorAll('.ps-appbar button, .ps-menubar button')]
    .find(x => /^Edit$/i.test((x.textContent || '').trim()));
  if (edit) { edit.click(); await s(300); }
  const prefs = [...document.querySelectorAll('button, [role="menuitem"]')]
    .find(x => /Preferences/i.test(x.textContent || '') && x.offsetParent);
  if (prefs) { prefs.click(); await s(400); }
  const sel = document.getElementById('ps-pref-density');
  if (sel) {
    sel.value = 'comfortable';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const save = document.getElementById('ps-preferences-save');
  if (save) { save.click(); await s(400); }
});
m = await bands();
ok(!m.compactClass && m.commandbar >= 42, 'comfortable restored (' + m.commandbar + 'px)');

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.length + ')');
console.log(fail === 0 ? 'DENSITY CHECK PASS (' + pass + ' ok)' : 'DENSITY CHECK FAIL (' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
