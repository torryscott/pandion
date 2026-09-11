// numerical-ledger-check.mjs - the ledger contract, held mechanically.
//
// NUMERICAL-CHANGES.md is the human record of every change to a
// displayed number; NUMERICAL_CHANGES in standalone/js/ps-shell.js is
// the copy the app carries (each saved project lists the ids it was
// computed under, and the reopen notice names the ones a file has not
// seen). The two must agree entry for entry, and the ledger's release
// sections must agree with the shipped version, or the notice and the
// record drift apart silently. This check is pure text (no browser,
// no R), so it runs everywhere: run.sh, prepare-release.sh, and CI on
// every push that touches the ledger or the shell.
//
// The rules:
//   1. every ledger entry carries a stable id (<!-- ledger: slug -->)
//      and the date it went live on the web app;
//   2. the code table lists exactly the same ids, and each entry's
//      `since` is the version of the ledger section it sits in;
//   3. sections are unique, valid x.y.z, newest first;
//   4. a section newer than APP_VERSION is marked "(unreleased ...)"
//      and there is at most one such section (the pending bump); a
//      section at or below APP_VERSION must NOT be marked unreleased -
//      so a numerical change can never ship under a version number
//      without the ledger saying which release it belongs to, and a
//      release cannot be cut while the ledger still calls it pending
//      (release-version.mjs set flips the marker for you).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};
const SEMVER = /^\d+\.\d+\.\d+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cmpVer = (a, b) => {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) < (B[i] || 0) ? -1 : 1;
  return 0;
};

// ---- the shipped version ------------------------------------------------
const shell = read('standalone/js/ps-shell.js');
const appVersion = (shell.match(/var APP_VERSION = "([^"]+)";/) || [])[1] || '';
const descVersion = (read('DESCRIPTION').match(/^Version:\s*(\S+)/m) || [])[1] || '';
ok(SEMVER.test(appVersion) && appVersion === descVersion,
  'APP_VERSION (' + appVersion + ') is x.y.z and equals DESCRIPTION Version (' + descVersion + ')');

// ---- the code table ------------------------------------------------------
const tableSrc = (shell.match(/var NUMERICAL_CHANGES = \[([\s\S]*?)\n  \];/) || [])[1];
ok(typeof tableSrc === 'string', 'NUMERICAL_CHANGES table found in ps-shell.js');
const code = [...(tableSrc || '').matchAll(/\{\s*id:\s*"([^"]+)",\s*since:\s*"([^"]+)"/g)]
  .map(m => ({ id: m[1], since: m[2] }));
const codeIds = new Set(code.map(c => c.id));
ok(codeIds.size === code.length && code.every(c => SLUG.test(c.id)),
  'code table ids are unique slugs (' + code.map(c => c.id).join(', ') + ')');
ok(code.every(c => SEMVER.test(c.since)), 'code table since values are x.y.z');

// ---- the ledger ----------------------------------------------------------
const md = read('NUMERICAL-CHANGES.md');
const sections = [];
let cur = null;
for (const line of md.split('\n')) {
  const h = line.match(/^## v(\S+)(?:\s*\((.*)\))?\s*$/);
  if (h) { cur = { version: h[1], note: h[2] || '', text: '', entries: [] }; sections.push(cur); continue; }
  if (/^## /.test(line)) { cur = null; continue; }
  if (cur) cur.text += line + '\n';
}
ok(sections.length > 0, 'ledger has at least one release section');
ok(sections.every(s => SEMVER.test(s.version)), 'every ledger section is "## vX.Y.Z"');
for (let i = 1; i < sections.length; i++)
  ok(cmpVer(sections[i - 1].version, sections[i].version) > 0,
    'ledger sections are newest first and unique (' + sections[i - 1].version + ' > ' + sections[i].version + ')');

const mdEntries = [];
for (const s of sections) {
  const paras = s.text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.startsWith('**'));
  ok(paras.length > 0, 'section v' + s.version + ' has at least one entry');
  for (const p0 of paras) {
    const p = p0.replace(/\s+/g, ' ');   // prose wraps mid-sentence
    const title = (p.match(/^\*\*(.+?)\*\*/) || [])[1] || p.slice(0, 40);
    const id = (p.match(/<!--\s*ledger:\s*([^\s]+)\s*-->/) || [])[1] || '';
    const live = (p.match(/Live on the web app (\d{4}-\d{2}-\d{2})\./) || [])[1] || '';
    // Inside a section still marked unreleased an entry may honestly say it is
    // not live yet; once the section ships, every entry must carry its date.
    const pendingSection = /^unreleased\b/i.test(s.note || '');
    const notYetLive = pendingSection && /Not yet live on the web app\./.test(p);
    ok(SLUG.test(id), 'entry "' + title + '" carries a ledger id (' + (id || 'none') + ')');
    ok(notYetLive || (live && !Number.isNaN(Date.parse(live + 'T00:00:00Z'))),
      'entry "' + title + '" names the date it went live on the web app, or says it is not live yet in an unreleased section');
    mdEntries.push({ id, since: s.version, title });
    s.entries.push(id);
  }
}
const mdIds = new Set(mdEntries.map(e => e.id));
ok(mdIds.size === mdEntries.length, 'ledger ids are unique');

// ---- ledger <-> code agreement --------------------------------------------
for (const e of mdEntries) {
  const c = code.find(x => x.id === e.id);
  ok(!!c, 'ledger entry "' + e.title + '" (' + e.id + ') exists in the code table');
  if (c) ok(c.since === e.since,
    e.id + ': code since ' + c.since + ' matches its ledger section v' + e.since);
}
for (const c of code)
  ok(mdIds.has(c.id), 'code entry ' + c.id + ' is recorded in NUMERICAL-CHANGES.md');

// ---- release state -------------------------------------------------------
const unreleased = sections.filter(s => /^unreleased\b/i.test(s.note));
ok(unreleased.length <= 1,
  'at most one pending (unreleased) section (' + unreleased.map(s => s.version).join(', ') + ')');
for (const s of sections) {
  const pending = /^unreleased\b/i.test(s.note);
  const newer = cmpVer(s.version, appVersion) > 0;
  ok(pending === newer,
    'section v' + s.version + (newer ? ' is newer than ' : ' is at or below ') + appVersion +
    ' and is ' + (pending ? '' : 'not ') + 'marked unreleased' +
    (pending === newer ? '' : ' - ' + (newer
      ? 'a numerical change is live under a version the ledger does not own; bump the version or mark the section (unreleased; ...)'
      : 'the version shipped but the ledger still calls it pending; release-version.mjs set flips the marker')));
}

console.log((fail === 0 ? 'NUMERICAL LEDGER CHECK PASS' : 'NUMERICAL LEDGER CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing; ' + mdEntries.length + ' entries in ' +
  sections.length + ' section(s), app ' + appVersion + ')');
process.exit(fail === 0 ? 0 : 1);
