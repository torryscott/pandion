// Fast, non-publishing contract checks for the release tooling.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
function ok(cond, message) {
    if (!cond) throw new Error(message);
    console.log(`  ok  ${message}`);
}
function run(command, args, options = {}) {
    return spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        ...options
    });
}

const description = read('DESCRIPTION');
const version = description.match(/^Version:\s*(\S+)\s*$/m)[1];
const [major, minor, patch] = version.split('.').map(Number);
const future = `${major}.${minor}.${patch + 1}`;

let result = run('node', ['scripts/release-version.mjs', 'check', version]);
ok(result.status === 0 && /RELEASE VERSION CHECK PASS/.test(result.stdout),
    'all maintained source version references agree');
result = run('bash', ['scripts/minify-widget.sh', '--check']);
ok(result.status === 0 && /MINIFIED WIDGET CHECK PASS/.test(result.stdout),
    'the committed minified engine is fresh and parses without downloads');

result = run('node', [
    'scripts/release-version.mjs', 'set', future,
    '--date', '2099-12-31', '--dry-run'
]);
ok(result.status === 0 && /DRY RUN PASS/.test(result.stdout),
    'a future version can be projected without editing the repository');

const versionTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'pandion-version-'));
try {
    const versionFiles = [
        'DESCRIPTION', 'jamovi/0000.yaml', 'CITATION.cff',
        'standalone/index.html', 'standalone/js/ps-shell.js',
        // The desktop app reports its version to the OS and the updater,
        // so release-version syncs it too (Jul 29 2026).
        'standalone/electron/package.json',
        'docs/user-guide.html', 'website/index.html', 'website/about.html',
        'website/download.html', 'website/gallery.html', 'website/support.html',
        'website/v2.html', 'website/v3.html'
    ];
    for (const rel of versionFiles) {
        const target = path.join(versionTemp, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, rel), target);
    }
    result = run('node', [
        'scripts/release-version.mjs', 'set', future,
        '--date', '2099-12-31', '--root', versionTemp
    ]);
    ok(result.status === 0, 'version synchronization succeeds in an isolated source copy');
    result = run('node', [
        'scripts/release-version.mjs', 'check', future, '--root', versionTemp
    ]);
    ok(result.status === 0, 'the synchronized source copy passes the version contract');
} finally {
    fs.rmSync(versionTemp, { recursive: true, force: true });
}

const publish = read('scripts/release.sh');
ok(!/\bgit add\b|\bgit commit\b|\beval\b/.test(publish),
    'publishing never stages, commits, or evals caller text');
ok(/--publish/.test(publish) && /git push --atomic/.test(publish),
    'publishing requires an explicit flag and uses one atomic push');
ok(/release-state\.mjs check/.test(publish),
    'publishing requires a commit-bound preparation receipt');

const prepare = read('scripts/prepare-release.sh');
ok(!/\bgit tag\b|\bgit push\b|\bgit commit\b/.test(prepare),
    'preparation cannot tag, push, or commit');
ok(/--build-only/.test(prepare) && /PS_REQUIRE_R_PARITY=1/.test(prepare),
    'preparation avoids Jamovi side-loading and requires R parity');
ok(read('.gitignore').includes('/.release/'),
    'prepared bundles are excluded from source control');

const standaloneRun = read('standalone/verify/run.sh');
// Four since Jul 29 2026: the three optional R-parity checks, plus the
// linkedom guard on hardening-dom-check - a missing helper library skips
// that probe with a warning on a dev run but must FAIL a release run,
// where a silent skip is the dangerous outcome.
ok((standaloneRun.match(/PS_REQUIRE_R_PARITY/g) || []).length === 4,
    'all optional standalone checks become mandatory for a release');
ok(!read('standalone/verify/polish-check.mjs')
        .includes("about.version === '3.0.0'") &&
   !read('standalone/verify/hardening-dom-check.mjs')
        .includes("includes('3.0.0')"),
    'standalone tests derive the product version instead of pinning 3.0.0');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pandion-release-state-'));
try {
    fs.writeFileSync(path.join(temp, 'probe.txt'), 'release receipt probe\n');
    result = run('node', [
        'scripts/release-state.mjs', 'create',
        '--version', version, '--output', temp,
        '--gate', 'probe-gate'
    ]);
    ok(result.status === 0, 'release receipt creation succeeds');
    result = run('node', [
        'scripts/release-state.mjs', 'check',
        '--version', version, '--output', temp,
        '--require-gate', 'probe-gate'
    ]);
    ok(result.status === 0, 'release receipt validates its commit, gate, and checksum');
    fs.appendFileSync(path.join(temp, 'probe.txt'), 'tampered\n');
    result = run('node', [
        'scripts/release-state.mjs', 'check',
        '--version', version, '--output', temp,
        '--require-gate', 'probe-gate'
    ]);
    ok(result.status !== 0 && /changed after preparation/.test(result.stderr),
        'receipt validation rejects a modified artifact');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}

console.log('RELEASE PIPELINE CHECK PASS');
