// Negative controls for the release policy and automatic page discovery.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyResults, standardFor, createAxeReport } from './axe-report.mjs';
import { websiteInventory } from '../../website/accessibility-inventory.mjs';

const node = { target: ['#test-control'], html: '<button id="test-control"></button>',
    failureSummary: 'Test fixture', any: [], all: [], none: [] };
const finding = (id, impact, tags = ['wcag2a', 'wcag412']) =>
    ({ id, impact, tags, nodes: [node] });
const violations = ['minor', 'moderate', 'serious', 'critical', null]
    .map(impact => finding('button-name', impact));
violations.push(finding('target-size', 'minor', ['wcag22aa', 'wcag258']));
violations.push(finding('redundant-entry', 'minor', ['wcag22a', 'wcag337']));
const incomplete = [finding('color-contrast', 'serious', ['wcag2aa', 'wcag143'])];
const classified = classifyResults({ violations, incomplete });
assert.equal(classified.blocking.length, 7, 'every impact, including unknown and 2.2 extras, must block');
assert.equal(classified.review.length, 1);
assert.equal(classified.review[0].kind, 'manual-review');
assert.equal(standardFor(violations[0]), 'WCAG 2.1 A/AA baseline');
assert.equal(standardFor(violations[5]), 'WCAG 2.2 A/AA additional');
const wrappers = ['document-title', 'html-has-lang'].map(id => finding(id, 'serious'));
assert.equal(classifyResults({ violations: wrappers, incomplete: [] }).blocking.length, 2,
    'ordinary documents cannot use the fragment-wrapper exception');
const host = classifyResults({ violations: [...wrappers, violations[0]], incomplete }, { jamoviFragment: true });
assert.equal(host.blocking.length, 1, 'host scope must not exempt actual widget violations');
assert.deepEqual(host.review.map(r => r.kind), ['host-responsibility', 'host-responsibility', 'manual-review']);

const root = mkdtempSync(path.join(tmpdir(), 'pandion-a11y-policy-'));
const previousOut = process.env.PS_A11Y_OUT;
try {
    for (const file of ['index.html', 'docs/index.html', 'app/index.html', 'pandion-plots.html',
        'new-class/assignment.html', 'new-workshop.html']) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        writeFileSync(path.join(root, file), '<!doctype html>');
    }
    const inventory = websiteInventory(root);
    assert.equal(inventory.length, 6);
    assert.equal(inventory.find(e => e.file === 'new-class/assignment.html').surface, 'website');
    assert.equal(inventory.find(e => e.file === 'new-workshop.html').surface, 'website');
    assert.equal(inventory.filter(e => e.surface === 'application').length, 2);
    rmSync(path.join(root, 'app/index.html'));
    assert.throws(() => websiteInventory(root), /Missing public artifact/);

    process.env.PS_A11Y_OUT = path.join(root, 'reports');
    const empty = createAxeReport({ suite: 'empty', artifact: 'fixture' });
    assert.equal(empty.finish().failed, true, 'zero scans cannot pass');
    const page = { viewportSize: () => ({ width: 320, height: 640 }),
        evaluate: async () => ({ violations, incomplete }) };
    const failed = createAxeReport({ suite: 'negative', artifact: 'fixture' });
    await failed.scan(page, 'injected findings');
    assert.equal(failed.finish().failed, true);
    let saved = JSON.parse(readFileSync(failed.reportPath));
    assert.equal(saved.scans[0].violations.length, 7);
    assert.deepEqual(saved.scans[0].incomplete[0].nodes[0], node);
    assert.equal(saved.status, 'failed');
    page.evaluate = async () => ({ violations: [], incomplete });
    const pending = createAxeReport({ suite: 'pending', artifact: 'fixture' });
    await pending.scan(page, 'unresolved color');
    saved = JSON.parse(readFileSync(pending.reportPath));
    assert.equal(saved.status, 'in-progress', 'partial evidence must not look complete');
    assert.equal(pending.finish().failed, false, 'incomplete is not automatically a violation');
    saved = JSON.parse(readFileSync(pending.reportPath));
    assert.equal(saved.status, 'automated-pass-review-required');
    assert.equal(saved.reviewQueue[0].status, 'open');
    const crashed = createAxeReport({ suite: 'crashed', artifact: 'fixture' });
    await crashed.scan(page, 'before a page error');
    assert.equal(crashed.finish(['browser error']).failed, true);

    // Stub external commands: test orchestration failure handling without
    // browser launches or R rendering. A failed PDF stage must prevent every
    // later stage and the runner's success marker.
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    const calls = path.join(root, 'calls');
    writeFileSync(path.join(bin, 'node'), '#!/bin/sh\n' +
        'printf "%s\\n" "$1" >> "$PS_TEST_CALLS"\n' +
        'case "$1" in *pdf-accessibility-check.mjs) exit 17 ;; esac\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'Rscript'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const runner = path.resolve('scripts/verify/accessibility-run.sh');
    const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
        PS_TEST_CALLS: calls, PS_A11Y_OUT: path.join(root, 'runner'), PS_PDF_BASELINE: '0' };
    const stopped = spawnSync('bash', [runner], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(stopped.status, 17, 'a PDF checker failure must propagate through tee: ' +
        (stopped.error?.message || stopped.stderr || stopped.stdout));
    assert(!stopped.stdout.includes('ACCESSIBILITY RELEASE GATE: AUTOMATED CHECKS PASS'));
    assert(!readFileSync(calls, 'utf8').includes('website/verify-axe.mjs'),
        'verification must stop at the failing stage');
    const capture = spawnSync('bash', [runner], {
        env: { ...env, PS_PDF_BASELINE: '1' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(capture.status, 2, 'capture-only PDF mode must not satisfy the release gate');
    assert.match(capture.stderr, /capture-only/);
} finally {
    if (previousOut === undefined) delete process.env.PS_A11Y_OUT;
    else process.env.PS_A11Y_OUT = previousOut;
    rmSync(root, { recursive: true, force: true });
}
console.log('ACCESSIBILITY POLICY CHECK: PASS (negative controls rejected)');
