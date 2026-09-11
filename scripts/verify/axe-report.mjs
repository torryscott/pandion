// Shared policy and durable evidence for browser accessibility gates.
// An automatic pass is explicitly separate from outstanding human review.
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa',
    'wcag22a', 'wcag22aa'];
const BASELINE_TAGS = new Set(AXE_TAGS.slice(0, 4));
const WRAPPER_RULES = new Set(['document-title', 'html-has-lang']);
function fileHash(input) {
    if (!input) return null;
    const filename = input.startsWith('file:') ? fileURLToPath(input) : input;
    return existsSync(filename) && statSync(filename).isFile()
        ? createHash('sha256').update(readFileSync(filename)).digest('hex') : null;
}
export function standardFor(finding) {
    return finding.tags?.some(tag => BASELINE_TAGS.has(tag))
        ? 'WCAG 2.1 A/AA baseline' : 'WCAG 2.2 A/AA additional';
}
export function classifyResults(result, { jamoviFragment = false } = {}) {
    const blocking = [], review = [];
    for (const finding of result.violations) {
        if (jamoviFragment && WRAPPER_RULES.has(finding.id)) {
            review.push({ kind: 'host-responsibility', finding,
                reason: 'This R fixture is a widget fragment without the document wrapper. ' +
                    'Verify the title/language in installed jamovi; this is not a conformance pass.' });
        } else blocking.push(finding);
    }
    for (const finding of result.incomplete) review.push({
        kind: 'manual-review', finding,
        reason: 'The scanner could not decide. Inspect the recorded state and nodes; ' +
            'record the outcome and evidence before treating this criterion as accepted.',
    });
    return { blocking, review };
}

export function createAxeReport({ suite, artifact, inventory = [] }) {
    const out = path.resolve(process.env.PS_A11Y_OUT || 'planning/accessibility-results');
    const reportPath = path.join(out, suite + '.json');
    const report = { schemaVersion: 1, suite, artifact, artifactSha256: fileHash(artifact), inventory,
        startedAt: new Date().toISOString(), status: 'in-progress',
        standards: { baseline: AXE_TAGS.slice(0, 4), additional: AXE_TAGS.slice(4) },
        scans: [], reviewQueue: [], errors: [] };
    mkdirSync(out, { recursive: true });
    function write() {
        const temporary = reportPath + '.tmp';
        writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n');
        renameSync(temporary, reportPath);
    }
    write();
    return {
        reportPath,
        async scan(page, label, { context = null, jamoviFragment = false } = {}) {
            const raw = await page.evaluate(async ({ tags, context }) => {
                const result = await window.axe.run(context || document, {
                    runOnly: { type: 'tag', values: tags },
                    resultTypes: ['violations', 'incomplete', 'passes', 'inapplicable'],
                });
                // Preserve every violating/incomplete node and check detail.
                // Passing/inapplicable rule IDs retain the tested rule inventory
                // without duplicating the whole page for every passing rule.
                return { url: result.url, timestamp: result.timestamp,
                    testEngine: result.testEngine, testEnvironment: result.testEnvironment,
                    toolOptions: result.toolOptions, violations: result.violations,
                    incomplete: result.incomplete,
                    passes: result.passes.map(r => ({ id: r.id, tags: r.tags, nodes: r.nodes.length })),
                    inapplicable: result.inapplicable.map(r => ({ id: r.id, tags: r.tags })) };
            }, { tags: AXE_TAGS, context });
            const classified = classifyResults(raw, { jamoviFragment });
            report.scans.push({ label, viewport: page.viewportSize(), context,
                jamoviFragment, ...raw, documentSha256: fileHash(raw.url),
                blocking: classified.blocking.map(f => ({ id: f.id,
                    standard: standardFor(f), nodes: f.nodes.length })) });
            for (const item of classified.review) report.reviewQueue.push({
                state: label, url: raw.url, kind: item.kind, status: 'open',
                rule: item.finding.id, standard: standardFor(item.finding),
                reason: item.reason, targets: item.finding.nodes.map(n => n.target),
            });
            write(); // A later navigation/contract failure must not erase evidence.
            console.log(`  ${classified.blocking.length ? 'FAIL' : 'ok'}  ${label}: ` +
                `${classified.blocking.length} blocking rule(s), ${classified.review.length} review item(s)`);
            for (const finding of classified.blocking) console.log(
                `       [${standardFor(finding)}; ${finding.impact || 'unknown'}] ` +
                `${finding.id} x${finding.nodes.length}: ` +
                finding.nodes.map(n => n.target.join(' ')).join(', '));
            for (const item of classified.review) console.log(
                `       REVIEW [${item.kind}] ${item.finding.id} x${item.finding.nodes.length}`);
            return classified;
        },
        finish(errors = []) {
            report.errors = errors;
            const blocking = report.scans.reduce((sum, scan) => sum + scan.blocking.length, 0);
            if (!report.scans.length) report.errors.push('No states were scanned.');
            report.summary = { states: report.scans.length, blockingRules: blocking,
                openReviewItems: report.reviewQueue.length, errors: report.errors.length };
            report.status = blocking || report.errors.length ? 'failed' :
                report.reviewQueue.length ? 'automated-pass-review-required' : 'automated-pass';
            report.finishedAt = new Date().toISOString();
            write();
            console.log(`  Evidence: ${reportPath}`);
            if (report.reviewQueue.length) console.log(
                `  ${report.reviewQueue.length} review item(s) remain OPEN; this is not conformance acceptance.`);
            return { ...report.summary, failed: report.status === 'failed' };
        },
    };
}
