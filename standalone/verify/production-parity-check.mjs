// REL-001's closing tool: after deploying website/ to production, verify
// that the DEPLOYED bytes are the bytes the suite tested - the portable
// download identical to standalone/dist, the hosted app shell referencing
// every current content-hashed script, and each of those scripts serving
// byte-identical to source. The audit of record must run against the
// deployment, and this proves the deployment is the audited artifact.
//
// Not in run.sh: it needs a live deployment, so it runs by hand (or in a
// deploy pipeline) right after publishing:
//
//     node standalone/verify/production-parity-check.mjs
//     PS_SITE=https://staging.example.com node .../production-parity-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const SITE = (process.env.PS_SITE || 'https://pandionplots.com')
    .replace(/\/$/, '');
const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel));

async function fetchBytes(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

console.log('production parity against ' + SITE);

console.log('case 1: the portable download is the tested build');
const dist = read('standalone/dist/pandion-plots.html');
const deployedPortable = await fetchBytes(SITE + '/pandion-plots.html');
ok(Buffer.compare(dist, deployedPortable) === 0,
   `deployed portable download is byte-identical to standalone/dist ` +
   `(${dist.length.toLocaleString()} bytes)`);

console.log('case 2: the hosted app serves the tested scripts');
const appHtml = (await fetchBytes(SITE + '/app/')).toString('utf8');
const localApp = read('website/app/index.html').toString('utf8');
ok(appHtml === localApp,
   'deployed app shell is byte-identical to website/app/index.html');
const hashed = [...appHtml.matchAll(/src="(lib\/[a-z0-9-]+\.[0-9a-f]{10}\.js)"/g)]
    .map(m => m[1]);
ok(hashed.length >= 10,
   `the shell references ${hashed.length} content-hashed scripts`);
for (const rel of hashed) {
    const remote = await fetchBytes(SITE + '/app/' + rel);
    const local = read('website/app/' + rel);
    ok(Buffer.compare(remote, local) === 0,
       `${rel} serves byte-identical to the tested copy`);
    const digest = crypto.createHash('md5').update(remote).digest('hex')
        .slice(0, 10);
    ok(rel.includes('.' + digest + '.'),
       `and its filename hash matches its own content (${digest})`);
}

console.log('case 3: the accessibility statement is live and current');
const a11y = (await fetchBytes(SITE + '/accessibility.html')).toString('utf8');
const localA11y = read('website/accessibility.html').toString('utf8');
ok(a11y === localA11y,
   'deployed accessibility statement matches the reviewed copy');

console.log('PRODUCTION PARITY CHECK PASS');
console.log('The deployed bytes are the tested bytes. REL-001\'s audit of ' +
    'record may run against ' + SITE + ' and certify the right artifact.');
