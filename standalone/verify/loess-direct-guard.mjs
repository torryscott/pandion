import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const baseline=JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/pandion-loess-direct.json','utf8'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pandion-loess-guard-'));
const guards=[
    ['baseline',()=>{},0],
    ['missing case',v=>{delete v.cases['31_regular_0.5'];},1],
    ['wrong convention',v=>{v.method='interpolated';},1],
    ['suppressed availability',v=>{v.cases['31_regular_0.5'].available=false;},1],
    ['truncated curve',v=>{v.cases['31_regular_0.5'].expected.pop();},1],
    ['nonfinite value',v=>{v.cases['31_regular_0.5'].expected[0]=null;},1],
    ['wrong value',v=>{v.cases['31_regular_0.5'].expected[0]+=.001;},1],
    ['singular reference accepted',v=>{v.cases['31_regular_0.5'].referenceWarnings=['pseudoinverse used'];},1]
];
try {
    for(const [label,edit,status] of guards) {
        const v=structuredClone(baseline);edit(v);
        const file=path.join(dir,'refs.json');fs.writeFileSync(file,JSON.stringify(v));
        const r=spawnSync(process.execPath,['standalone/verify/loess-direct-check.mjs',file,'--unit'],{encoding:'utf8'});
        assert.equal(r.status,status,label+'\n'+r.stdout+r.stderr);
    }
} finally {fs.rmSync(dir,{recursive:true,force:true});}
console.log(`LOESS CHECKER GUARDS: ${guards.length} passed`);
