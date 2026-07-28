#!/usr/bin/env node

// Create or verify the local release-preparation receipt consumed by
// scripts/release.sh. The receipt binds reviewed artifacts to one exact commit.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args.shift();
if (!['create', 'check'].includes(command)) {
    console.error('Usage: node scripts/release-state.mjs <create|check> --version x.y.z --output DIR [--gate NAME] [--require-gate NAME]');
    process.exit(2);
}

let version = '';
let output = '';
const gates = [];
const requiredGates = [];
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version') version = (args[++i] || '').replace(/^v/, '');
    else if (arg === '--output') output = args[++i] || '';
    else if (arg === '--gate') gates.push(args[++i] || '');
    else if (arg === '--require-gate') requiredGates.push(args[++i] || '');
    else {
        console.error(`Unexpected argument: ${arg}`);
        process.exit(2);
    }
}
if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`Invalid release version: ${version}`);
if (!output) throw new Error('--output is required');

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8'
}).trim();
const out = path.resolve(root, output);
const receiptPath = path.join(out, 'release.json');
const sumsPath = path.join(out, 'SHA256SUMS');
const git = (...gitArgs) => execFileSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8'
}).trim();
const sha256 = file => crypto.createHash('sha256')
    .update(fs.readFileSync(file)).digest('hex');

function artifactFiles() {
    return fs.readdirSync(out, { withFileTypes: true })
        .filter(entry => entry.isFile() &&
            !['release.json', 'SHA256SUMS'].includes(entry.name))
        .map(entry => entry.name)
        .sort();
}

function verifyArtifacts(receipt) {
    if (receipt.schemaVersion !== 1)
        throw new Error(`Unsupported release receipt schema: ${receipt.schemaVersion}`);
    if (receipt.product !== 'Pandion Plots')
        throw new Error(`Unexpected product in release receipt: ${receipt.product}`);
    if (receipt.version !== version)
        throw new Error(`Receipt version ${receipt.version} does not match ${version}`);
    const head = git('rev-parse', 'HEAD');
    if (receipt.commit !== head)
        throw new Error(`Receipt commit ${receipt.commit} does not match HEAD ${head}`);
    const missingGates = requiredGates.filter(gate =>
        !receipt.gates.includes(gate));
    if (missingGates.length)
        throw new Error(`Release receipt is missing required gate(s): ${missingGates.join(', ')}`);
    const current = artifactFiles();
    const recorded = receipt.artifacts.map(item => item.file).sort();
    if (JSON.stringify(current) !== JSON.stringify(recorded))
        throw new Error('Prepared artifact set differs from release.json');
    for (const item of receipt.artifacts) {
        const file = path.join(out, item.file);
        const stat = fs.statSync(file);
        if (stat.size !== item.bytes)
            throw new Error(`${item.file}: size changed after preparation`);
        const digest = sha256(file);
        if (digest !== item.sha256)
            throw new Error(`${item.file}: checksum changed after preparation`);
    }
    const expectedSums = receipt.artifacts
        .map(item => `${item.sha256}  ${item.file}`)
        .join('\n') + '\n';
    if (fs.readFileSync(sumsPath, 'utf8') !== expectedSums)
        throw new Error('SHA256SUMS does not match release.json');
}

if (command === 'create') {
    fs.mkdirSync(out, { recursive: true });
    const files = artifactFiles();
    if (files.length === 0)
        throw new Error(`No prepared artifacts found in ${out}`);
    const artifacts = files.map(file => {
        const full = path.join(out, file);
        return {
            file,
            bytes: fs.statSync(full).size,
            sha256: sha256(full)
        };
    });
    const receipt = {
        schemaVersion: 1,
        product: 'Pandion Plots',
        version,
        tag: `v${version}`,
        commit: git('rev-parse', 'HEAD'),
        branch: git('branch', '--show-current'),
        preparedAt: new Date().toISOString(),
        gates: gates.filter(Boolean),
        artifacts
    };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    fs.writeFileSync(sumsPath,
        artifacts.map(item => `${item.sha256}  ${item.file}`).join('\n') + '\n');
    verifyArtifacts(receipt);
    console.log(`RELEASE RECEIPT CREATED (${version}, ${artifacts.length} artifact(s))`);
    console.log(receiptPath);
} else {
    if (!fs.existsSync(receiptPath))
        throw new Error(`Release receipt not found: ${receiptPath}`);
    if (!fs.existsSync(sumsPath))
        throw new Error(`Checksum manifest not found: ${sumsPath}`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    verifyArtifacts(receipt);
    console.log(`RELEASE RECEIPT CHECK PASS (${version}, ${receipt.artifacts.length} artifact(s))`);
}
