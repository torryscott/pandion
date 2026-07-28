#!/usr/bin/env node

// Synchronize and verify Pandion's public product version.
//
// The per-analysis version fields in jamovi/*.a.yaml are jamovi schema
// versions, not the module release version, and are intentionally untouched.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const command = args.shift();
if (!['check', 'set'].includes(command)) {
    console.error('Usage: node scripts/release-version.mjs <check|set> [x.y.z] [--date YYYY-MM-DD] [--dry-run] [--root PATH]');
    process.exit(2);
}

let requested = '';
let releaseDate = new Date().toISOString().slice(0, 10);
let dryRun = false;
let root = process.cwd();
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--date') releaseDate = args[++i] || '';
    else if (arg === '--root') root = path.resolve(args[++i] || '');
    else if (arg === '--dry-run') dryRun = true;
    else if (!requested) requested = arg.replace(/^v/, '');
    else {
        console.error(`Unexpected argument: ${arg}`);
        process.exit(2);
    }
}

const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!DATE.test(releaseDate) ||
    Number.isNaN(Date.parse(`${releaseDate}T00:00:00Z`))) {
    throw new Error(`Invalid release date: ${releaseDate}`);
}

const filePath = rel => path.join(root, rel);
const documents = new Map();
const read = rel => documents.has(rel)
    ? documents.get(rel)
    : fs.readFileSync(filePath(rel), 'utf8');
const currentMatch = read('DESCRIPTION').match(/^Version:\s*(\S+)\s*$/m);
if (!currentMatch) throw new Error('DESCRIPTION has no Version field');
const current = currentMatch[1];
const version = requested || current;
if (!VERSION.test(version)) {
    throw new Error(`Release version must be numeric x.y.z; received "${version}"`);
}
if (command === 'set' && !requested) {
    throw new Error('The set command requires an explicit version');
}

const monthYear = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
}).format(new Date(`${releaseDate}T00:00:00Z`));

const changed = new Set();
function write(rel, next) {
    const before = read(rel);
    if (before === next) return;
    changed.add(rel);
    documents.set(rel, next);
}

function replaceExactly(rel, regex, replacement, expected, label) {
    const before = read(rel);
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const matcher = new RegExp(regex.source, flags);
    const count = [...before.matchAll(matcher)].length;
    if (count !== expected) {
        throw new Error(`${rel}: expected ${expected} ${label || 'version field'} match(es), found ${count}`);
    }
    write(rel, before.replace(matcher, replacement));
}

function setVersion() {
    replaceExactly('DESCRIPTION', /^Version:\s*\S+\s*$/m,
        `Version: ${version}`, 1, 'DESCRIPTION Version');
    replaceExactly('jamovi/0000.yaml', /^version:\s*\S+\s*$/m,
        `version: ${version}`, 1, 'jamovi module version');
    replaceExactly('jamovi/0000.yaml', /^date:\s*.*$/m,
        `date: '${releaseDate}'`, 1, 'jamovi release date');
    replaceExactly('CITATION.cff', /^version:\s*".*"\s*$/m,
        `version: "${version}"`, 1, 'citation version');
    replaceExactly('standalone/index.html',
        /(<strong id="ps-about-version">)[^<]+(<\/strong>)/,
        `$1${version}$2`, 1, 'standalone About version');

    let shell = read('standalone/js/ps-shell.js');
    const appMatches = [...shell.matchAll(/var APP_VERSION = "[^"]+";/g)];
    if (appMatches.length !== 1)
        throw new Error(`standalone/js/ps-shell.js: expected one APP_VERSION, found ${appMatches.length}`);
    shell = shell.replace(/var APP_VERSION = "[^"]+";/,
        `var APP_VERSION = "${version}";`);
    const notes = /(var RELEASE_NOTES = \[\s*\{ version: ")[^"]+(", date: ")[^"]+(")/;
    if (!notes.test(shell))
        throw new Error('standalone/js/ps-shell.js: newest release-note entry not found');
    shell = shell.replace(notes, `$1${version}$2${monthYear}$3`);
    write('standalone/js/ps-shell.js', shell);

    // These source pages contain product versions only. Generated copies under
    // website/app, website/docs, and website/pandion-plots.html are refreshed
    // by website/build.sh and deliberately are not edited here.
    const allProductVersionPages = [
        'docs/user-guide.html',
        'website/index.html',
        'website/about.html',
        'website/download.html',
        'website/gallery.html',
        'website/support.html',
        'website/v2.html',
        'website/v3.html'
    ];
    for (const rel of allProductVersionPages) {
        const before = read(rel);
        const matches = [...before.matchAll(/\b\d+\.\d+\.\d+\b/g)];
        if (matches.length === 0)
            throw new Error(`${rel}: no product version references found`);
        write(rel, before.replace(/\b\d+\.\d+\.\d+\b/g, version));
    }
}

function captured(rel, regex, label) {
    const matches = [...read(rel).matchAll(regex)];
    if (matches.length === 0)
        throw new Error(`${rel}: ${label} not found`);
    return matches.map(match => match[1]);
}

function expectAll(rel, values, label) {
    const wrong = values.filter(value => value !== version);
    if (wrong.length)
        throw new Error(`${rel}: ${label} must be ${version}; found ${[...new Set(values)].join(', ')}`);
}

function checkVersion() {
    expectAll('DESCRIPTION',
        captured('DESCRIPTION', /^Version:\s*(\S+)\s*$/gm, 'Version'),
        'package version');
    expectAll('jamovi/0000.yaml',
        captured('jamovi/0000.yaml', /^version:\s*(\S+)\s*$/gm, 'version'),
        'module version');
    expectAll('CITATION.cff',
        captured('CITATION.cff', /^version:\s*"([^"]+)"\s*$/gm, 'version'),
        'citation version');
    expectAll('standalone/index.html',
        captured('standalone/index.html',
            /<strong id="ps-about-version">([^<]+)<\/strong>/g,
            'About version'),
        'About version');
    expectAll('standalone/js/ps-shell.js',
        captured('standalone/js/ps-shell.js',
            /var APP_VERSION = "([^"]+)";/g, 'APP_VERSION'),
        'APP_VERSION');
    expectAll('standalone/js/ps-shell.js',
        captured('standalone/js/ps-shell.js',
            /var RELEASE_NOTES = \[\s*\{ version: "([^"]+)"/g,
            'newest release-note version'),
        'newest release-note version');

    const allProductVersionPages = [
        'docs/user-guide.html',
        'website/index.html',
        'website/about.html',
        'website/download.html',
        'website/gallery.html',
        'website/support.html',
        'website/v2.html',
        'website/v3.html'
    ];
    for (const rel of allProductVersionPages) {
        expectAll(rel,
            captured(rel, /\b(\d+\.\d+\.\d+)\b/g, 'product version'),
            'product version');
    }

    const manifestDate = captured('jamovi/0000.yaml',
        /^date:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/gm,
        'release date')[0];
    if (!DATE.test(manifestDate) ||
        Number.isNaN(Date.parse(`${manifestDate}T00:00:00Z`))) {
        throw new Error(`jamovi/0000.yaml: invalid release date ${manifestDate}`);
    }
}

if (command === 'set') setVersion();
checkVersion();
if (command === 'set' && !dryRun) {
    for (const [rel, contents] of documents)
        fs.writeFileSync(filePath(rel), contents);
}

if (command === 'set') {
    const verb = dryRun ? 'would update' : 'updated';
    console.log(changed.size
        ? `Release version ${version}: ${verb} ${changed.size} file(s):\n  ${[...changed].join('\n  ')}`
        : `Release version ${version}: all source files already synchronized`);
}
console.log(command === 'set' && dryRun
    ? `RELEASE VERSION DRY RUN PASS (${version})`
    : `RELEASE VERSION CHECK PASS (${version})`);
