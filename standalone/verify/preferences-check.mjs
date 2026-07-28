// Punch list t3-53: Preferences was five settings with no defaults, no
// storage view, and no way to get rid of what the app had stored.
//
// The four gaps closed here, and why each belongs in THIS dialog:
//   * Restore defaults. Five selects and no way back to how they shipped.
//   * A default missing-value list. It was settable only AFTER an import, per
//     project, so the same correction had to be made again for every file.
//   * What is stored locally. Diagnostics already computed the estimate, and
//     this is where a person looks for it.
//   * A way to clear it. The app's usual pattern is do-it-and-offer-it-back,
//     which cannot apply here because there would be nothing to offer back, so
//     this is a deliberate two-step that leaves the OPEN project untouched.
//
// Not closed, and deliberately: the default palette and chart style live in
// the ENGINE's own gallery, and duplicating that control here would create a
// second source for a setting the engine owns.
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 960 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

console.log('case 1: a default missing-value list, applied to the NEXT import');
const applied = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('preferences');
    await s(500);
    document.getElementById('ps-pref-missing').value = '-99, N/A';
    document.getElementById('ps-preferences-save').click();
    await s(600);
    // A file imported AFTER the preference, which is the case the item names:
    // the same correction had to be made again for every file.
    window.PS_SHELL.loadTable('fresh', ['age', 'note'],
        [['34', 'a'], ['-99', 'b'], ['41', 'N/A']]);
    await s(900);
    const t = window.PS_SHELL.project.table;
    return { pref: window.PS_SHELL.appPrefs().missingTokens,
             tokens: t.missingTokens,
             age: t.columns.age.slice(), note: t.columns.note.slice() };
});
ok(applied.pref === '-99, N/A',
   `the preference is stored (${JSON.stringify(applied.pref)})`);
ok(JSON.stringify(applied.tokens) === JSON.stringify(['-99', 'N/A']),
   `and a newly imported table starts from it rather than from a hardcoded ` +
   `NA (${JSON.stringify(applied.tokens)})`);
ok(applied.age.indexOf(-99) === -1 && applied.age.filter(v => v === null).length === 1,
   `so -99 is missing on arrival (${JSON.stringify(applied.age)})`);
ok(applied.note.filter(v => v === null).length === 1,
   `and so is N/A (${JSON.stringify(applied.note)})`);

console.log('case 2: Restore defaults puts every control back');
const reset = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('preferences');
    await s(500);
    document.getElementById('ps-pref-density').value = 'compact';
    document.getElementById('ps-pref-motion').value = 'reduce';
    document.getElementById('ps-pref-startup').value = 'resume';
    document.getElementById('ps-pref-export-format').value = 'png';
    const before = {
        d: document.getElementById('ps-pref-density').value,
        m: document.getElementById('ps-pref-missing').value };
    document.getElementById('ps-pref-reset').click();
    await s(400);
    const after = {
        d: document.getElementById('ps-pref-density').value,
        mo: document.getElementById('ps-pref-motion').value,
        st: document.getElementById('ps-pref-startup').value,
        fmt: document.getElementById('ps-pref-export-format').value,
        dpi: document.getElementById('ps-pref-export-dpi').value,
        m: document.getElementById('ps-pref-missing').value };
    // Restore fills the CONTROLS; Apply is still what commits, which the
    // toast says. Assert that too, so the button cannot quietly half-work.
    const stillStored = window.PS_SHELL.appPrefs().missingTokens;
    document.getElementById('ps-preferences-cancel').click();
    await s(300);
    return { before, after, stillStored,
             afterCancel: window.PS_SHELL.appPrefs().missingTokens };
});
ok(reset.before.d === 'compact' && reset.before.m === '-99, N/A',
   'setup: the controls really were changed away from the defaults');
ok(reset.after.d === 'comfortable' && reset.after.mo === 'system' &&
   reset.after.st === 'center' && reset.after.fmt === 'svg' &&
   reset.after.dpi === '300' && reset.after.m === 'NA',
   `every one of them is back to how it shipped ` +
   `(${JSON.stringify(reset.after)})`);
ok(reset.stillStored === '-99, N/A' && reset.afterCancel === '-99, N/A',
   `and Restore fills the controls without committing, so Cancel still ` +
   `abandons it (${reset.afterCancel})`);

console.log('case 3: it says what is stored on this machine');
const storage = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('preferences');
    await s(700);
    return document.getElementById('ps-pref-storage').textContent;
});
ok(/using about/.test(storage) && /\d/.test(storage),
   `the dialog reports real usage rather than a placeholder ("${storage.slice(0, 90)}")`);
ok(/autosaved project/.test(storage),
   'and says what the space is actually holding, not just a number');

console.log('case 4: clearing is a two-step, and spares the open project');
const cleared = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById('ps-pref-clear');
    const label0 = btn.textContent;
    const keys0 = Object.keys(window.localStorage).filter(k =>
        k.indexOf('psstandalone.') === 0 || k.indexOf('graphbuilder2.') === 0).length;
    btn.click();
    await s(300);
    const armed = { label: btn.textContent,
                    danger: btn.classList.contains('ps-danger'),
                    keys: Object.keys(window.localStorage).filter(k =>
                        k.indexOf('psstandalone.') === 0 ||
                        k.indexOf('graphbuilder2.') === 0).length };
    btn.click();
    await s(600);
    return { label0, keys0, armed,
             keysAfter: Object.keys(window.localStorage).filter(k =>
                 k.indexOf('psstandalone.') === 0 ||
                 k.indexOf('graphbuilder2.') === 0).length,
             toast: document.getElementById('ps-toast').innerText,
             tableStillThere: !!(window.PS_SHELL.project.table &&
                 window.PS_SHELL.project.table.order.length) };
});
ok(cleared.keys0 > 0, `setup: there really was stored data (${cleared.keys0} keys)`);
ok(cleared.armed.keys === cleared.keys0 && cleared.armed.danger,
   `the FIRST click deletes nothing and arms instead ("${cleared.armed.label}")`);
ok(cleared.keysAfter === 0,
   `the second clears it (${cleared.keys0} -> ${cleared.keysAfter})`);
ok(cleared.tableStillThere,
   `while the project on screen is untouched, which is what keeps this from ` +
   `being a data-loss button`);
ok(/untouched/.test(cleared.toast) && /save it to a file/.test(cleared.toast),
   `and the message says so, plus what to do about it ` +
   `("${cleared.toast.replace(/\n/g, ' ').slice(0, 100)}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PREFERENCES CHECK PASS');
await browser.close();
