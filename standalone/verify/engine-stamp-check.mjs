// Punch list t3-60: the templates carried no version of any kind, and the
// declared channels were never checked.
//
// templates.js had no hash and no date, so a change to the R marshalling - a
// new payload key with a non-falsy default, or a changed default - left the
// standalone rendering last month's look with nothing anywhere to say so. And
// manifest.json DECLARED distNormality as a live distplotbuilder channel while
// the shell hard-coded it empty, so the one mechanism that could have caught
// that gap mechanically was itself inert.
//
// Two halves, asserted differently on purpose:
//   marshalMd5  recomputed here from the real R files. If it moves without a
//               template rebuild, the templates are STALE and this fails.
//   engineMd5   recorded and shown, never asserted: the JS bundle ships from
//               the jamovi side regularly without invalidating one template,
//               so failing on it would be a false alarm generator.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

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

const here = path.resolve(new URL('.', import.meta.url).pathname);
const root = path.resolve(here, '..', '..');

console.log('case 1: the templates say what produced them');
const templatesJs = fs.readFileSync(
    path.join(root, 'standalone/templates/templates.js'), 'utf8');
const m = templatesJs.match(/window\.PS_TEMPLATES\.__stamp = (\{.*\});/);
ok(!!m, 'templates.js carries a stamp');
const stamp = JSON.parse(m[1]);
for (const field of ['marshalMd5', 'marshalFiles', 'engineMd5', 'generated'])
    ok(Object.prototype.hasOwnProperty.call(stamp, field),
       `it records ${field} (${field === 'marshalFiles'
           ? stamp[field].length + ' files' : stamp[field]})`);

console.log('case 2: and the stamp is CHECKED, not merely present');
// The same concatenation build-templates.R hashes, in the same order.
const h = crypto.createHash('md5');
for (const rel of stamp.marshalFiles) {
    const p = path.join(root, rel);
    ok(fs.existsSync(p), `a stamped marshalling file still exists (${rel})`);
    h.update(fs.readFileSync(p));
}
const recomputed = h.digest('hex');
ok(recomputed === stamp.marshalMd5,
   `the R marshalling has not moved since the templates were built ` +
   `(${recomputed.slice(0, 12)} vs stamped ${stamp.marshalMd5.slice(0, 12)}). ` +
   `If this fails: Rscript standalone/build-templates.R`);
// The engine hash is recorded but deliberately NOT asserted; this only
// verifies it names a bundle that is really there, so a bug report can use it.
ok(fs.existsSync(path.join(root, 'inst/widget/graphbuilder2.min.js')),
   `the stamped engine bundle exists (${stamp.engineMd5.slice(0, 12)}, ` +
   `recorded but not asserted - it ships from the jamovi side without ` +
   `invalidating templates)`);

console.log('case 3: every declared channel is actually written');
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.join(root, 'standalone', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

// Every module, on data that fills its roles, so a channel cannot be missing
// merely because nothing asked for it.
const audits = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    const out = [];
    const roles = {
        plotbuilder: { xvar: 'condition', yvar: 'score', groupVar: 'sex' },
        distplotbuilder: { var: 'score', groupVar: 'sex' },
        freqplotbuilder: { var: 'condition', groupVar: 'sex' },
        xyplotbuilder: { xvar: 'hours', yvar: 'score', groupVar: 'sex' },
        corrplotbuilder: { vars: ['score', 'hours'] },
        likertplotbuilder: { items: ['score', 'hours'] },
        rmplotbuilder: { measures: ['score', 'hours'], betweenVar: 'sex' }
    };
    for (const mod of Object.keys(roles)) {
        S.setModule(mod);
        await sleep(250);
        S.setRoles(mod, roles[mod]);
        await sleep(500);
        let a = null;
        try { a = S.channelAudit(); } catch (e) { a = { error: String(e) }; }
        out.push({ mod, a });
    }
    return out;
});
for (const { mod, a } of audits) {
    ok(a && !a.error && a.checked > 0,
       `${mod} declares ${a && a.checked} channels`);
    ok(a.missing.length === 0,
       `and the builder writes every one of them ` +
       `(${a.missing.length ? 'MISSING ' + a.missing.join(', ') : 'none missing'})`);
}

console.log('case 4: both are reportable, which is the point of a stamp');
const diag = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('diagnostics');
    await sleep(500);
    return document.getElementById('ps-diagnostics-grid').innerText;
});
ok(/Chart templates/.test(diag) && new RegExp(stamp.generated).test(diag),
   'Diagnostics reports when the templates were generated');
ok(new RegExp(stamp.marshalMd5.slice(0, 12)).test(diag),
   'and which marshalling built them');
ok(new RegExp(stamp.engineMd5.slice(0, 12)).test(diag),
   'and which engine bundle they were built beside');
ok(/Payload channels/.test(diag) && /declared channels written/.test(diag),
   `and the channel audit, so a gap shows up in a pasted bug report ` +
   `(${(diag.match(/Payload channels\s*\n?\s*(.*)/) || [])[1] || '?'})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('ENGINE STAMP CHECK PASS');
await browser.close();
