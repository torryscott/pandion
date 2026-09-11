import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
function dependency(name) {
    for (const base of [process.env.GB2_PARSE_BASE,process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp','/tmp'].filter(Boolean))
        try { return createRequire(path.join(base,'x.js'))(name); } catch {}
    throw Error(name+' is required');
}
const families=['two','three','rm','mixed','mixed2'];
const variants=['balanced','unbalanced','missing','permuted','reversed','small_units','large_units',
    'large_offset','small_error','zero_error','constant','empty_cell','singletons','two_occasions','four_occasions'];
const keys={two:['A','B','AB'],three:['A','B','C','AB','AC','BC','ABC'],rm:['occ'],
    mixed:['grp','occ','og'],mixed2:['grp','fac','gf','occ','og','of','ogf']};
const fields=['F','p','df1','df2','eps','eta','ss','sse'];
const refs=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/pandion-anova-reference.json','utf8'));
const precise=JSON.parse(fs.readFileSync(process.argv[3]||'/tmp/pandion-anova-precision.json','utf8'));
let checks=0;
function near(got,expected,label,rtol=3e-7) {
    checks++;
    assert(Number.isFinite(got)&&Number.isFinite(expected),label+': finite values required');
    assert(Math.abs(got-expected)<=rtol*Math.abs(expected)+Number.MIN_VALUE*16,
        label+': expected '+expected+', got '+got);
}
function hexDouble(s) {
    const m=s.match(/^(-?)0x([0-9a-f]+)(?:\.([0-9a-f]+))?p([+-]?\d+)$/i);assert(m,'R hex double required');
    const frac=m[3]||'';
    return (m[1]?-1:1)*Number('0x'+m[2]+frac)/16**frac.length*2**Number(m[4]);
}
function validate(r,p) {
    assert.equal(r.schemaVersion,1);assert.equal(p.schemaVersion,1);assert.equal(r.seed,p.seed);
    assert.equal(p.arithmetic,'Decimal(80)');assert.equal(typeof r.car,'string');
    assert.deepEqual(r.families,families);assert.deepEqual(r.variants,variants);
    const roster=families.flatMap(f=>variants.map(v=>f+'_'+v));
    assert.deepEqual(r.cases.map(c=>c.id),roster);assert.deepEqual(p.cases.map(c=>c.id),roster);
    for(let i=0;i<r.cases.length;i++) {
        const c=r.cases[i],pr=p.cases[i];
        assert.equal(c.id,c.family+'_'+c.variant);assert(Array.isArray(c.levels));
        const k=['two','three'].includes(c.family)?1:c.variant==='two_occasions'?2:c.variant==='four_occasions'?4:3;
        assert.equal(c.k,k);assert(Array.isArray(c.rows)&&c.rows.length>0);
        for(const row of c.rows) {
            assert.equal(row.values.length,k);assert.equal(row.valuesHex.length,k);
            row.values.forEach((v,j)=>assert.equal(v,row.valuesHex[j]===null?null:hexDouble(row.valuesHex[j]),c.id+' exact input double'));
        }
        const refusal=['zero_error','constant','singletons'].includes(c.variant)||
            (c.variant==='empty_cell'&&c.family!=='mixed');
        assert.equal(c.expected.status,refusal?'refuse':'ok',c.id+': required estimability contract');
        assert.equal(c.expected.status,pr.expected.status);
        assert.equal(c.expected.n,pr.expected.n);
        for(const expected of [c.expected,pr.expected]) if(expected.status==='ok') {
            assert.deepEqual(expected.terms.map(t=>t.key).sort(),keys[c.family].slice().sort());
            for(const t of expected.terms) {
                for(const key of fields) assert(Number.isFinite(t[key])&&t[key]>=0,c.id+': valid '+key);
                assert(t.df1>0&&t.df2>0&&t.sse>0&&t.eps>0&&t.eps<=1+1e-14&&t.p<=1&&t.eta<=1);
            }
        }
        if(c.expected.status==='ok') for(const t of c.expected.terms) {
            const pt=pr.expected.terms.find(x=>x.key===t.key);
            for(const key of fields) {
                // On 1e-8 residuals, double-precision package covariance
                // slightly perturbs corrected tails. The independent
                // 80-digit oracle still holds the application to 3e-7.
                near(t[key],pt[key],c.id+'/car-vs-decimal/'+t.key+'/'+key,
                    c.variant==='small_error'&&key==='p'?1e-5:3e-7);
            }
        }
    }
    // Model symmetries, independently checked against both references.
    for(const collection of [r,p]) for(const family of families) {
        const base=collection.cases.find(c=>c.id===family+'_balanced').expected;
        for(const variant of ['permuted','reversed','small_units','large_units']) {
            const cs=collection.cases.find(c=>c.id===family+'_'+variant).expected;
            for(const t of base.terms) {
                const other=cs.terms.find(v=>v.key===t.key);
                for(const key of ['F','p','df1','df2','eps','eta']) near(other[key],t[key],family+'/'+variant+'/invariance/'+key);
                const scale=variant==='small_units'?1e-18:variant==='large_units'?1e18:1;
                for(const key of ['ss','sse'])near(other[key]/scale,t[key],family+'/'+variant+'/invariance/'+key);
            }
        }
    }
}
validate(refs,precise);
if(process.argv.includes('--guard-selftest')) {
    const tests=[
        (r,p)=>r.cases.pop(),(r,p)=>p.cases.pop(),(r,p)=>p.seed++,
        (r,p)=>r.cases[0].rows[0].values[0]+=1e-5,
        (r,p)=>r.cases[0].k++, (r,p)=>r.cases[0].expected.terms[0].F*=1.1,
        (r,p)=>r.cases[0].expected.terms[0].p=0,
        (r,p)=>p.cases[0].expected.terms[0].F=NaN,
        (r,p)=>p.cases[0].expected.terms[0].df2++,
        (r,p)=>p.cases[0].expected.terms[0].key='AB',
        (r,p)=>p.cases[0].expected.status='refuse',
        (r,p)=>{r.cases[0].expected.status='refuse';p.cases[0].expected.status='refuse';}
    ];
    for(const mutate of tests){const r=structuredClone(refs),p=structuredClone(precise);mutate(r,p);assert.throws(()=>validate(r,p));}
    assert.throws(()=>near(0,1e-250,'nonzero tail cannot pass as zero'));
    assert.throws(()=>near(NaN,1,'missing value cannot pass'));
    console.log('ANOVA GUARDS PASS:',tests.length+2,'negative controls');process.exit(0);
}
// Test-copy exports only. AST discovery works on compiled names. Original
// numerical function bytes are unchanged; no production test hook is added.
const portable=!!process.env.PS_PAGE,hostDir=process.env.PS_ANOVA_HOST_DIR;
const bundle=portable||process.env.PS_ANOVA_BUNDLE==='min'?'min':'source';
const file=process.env.PS_ANOVA_SOURCE_FILE||'inst/widget/graphbuilder2'+(bundle==='min'?'.min':'')+'.js';
const code=fs.readFileSync(file,'utf8').trimEnd(),ast=dependency('acorn').parse(code,{ecmaVersion:'latest'});
const functions={},cores=[];
function walk(node,parent,stack=[]) {
    if(!node||typeof node!=='object')return;
    const next=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)?[...stack,node]:stack;
    if(node.type==='Property'&&(node.key.name||node.key.value)==='testKind'&&
       ['rmAnova','mixedAnova','mixedAnova2'].includes(node.value.value)) {
        const name=node.value.value;assert(!functions[name]||functions[name]===next.at(-1));functions[name]=next.at(-1);
    }
    if(node.type==='Literal'&&node.value===' (one-way: only one ')functions.omni=next.at(-1);
    if(node.type==='ObjectExpression'&&['twoWayANOVA','threeWayANOVA','fSurvival'].every(
        key=>node.properties.some(p=>p.key&&(p.key.name||p.key.value)===key))) {
        assert.equal(parent.type,'VariableDeclarator');cores.push(parent.id.name);
    }
    for(const [key,value] of Object.entries(node)) {
        if(key==='start'||key==='end')continue;
        if(Array.isArray(value))value.forEach(v=>walk(v,node,next));
        else if(value&&typeof value==='object')walk(value,node,next);
    }
}
walk(ast,null);assert.equal(cores.length,1);assert.equal(Object.keys(functions).length,4);
assert.equal(functions.omni.type,'FunctionDeclaration');
const edits=[];
for(const [kind,key] of [['rm','rmAnova'],['mixed','mixedAnova'],['mixed2','mixedAnova2']]) {
    const fn=functions[key];
    if(fn.type==='FunctionDeclaration') {
        edits.push({at:fn.end,text:';'+fn.id.name+'=window.__anovaObserve("'+kind+'",'+fn.id.name+');'});
    } else {
        assert.equal(fn.type,'FunctionExpression');
        edits.push({at:fn.start,text:'window.__anovaObserve("'+kind+'",'},{at:fn.end,text:')'});
    }
}
edits.push({at:functions.omni.end,text:';window.__anovaVerification={core:'+cores[0]+',omni:'+functions.omni.id.name+
    ',revision:(window.__anovaVerification?.revision||0)+1};'});
const prefix='window.__anovaObserve=function(kind,fn){return function(){var value=fn.apply(this,arguments);'+
    'window.__anovaResults[kind]=value;return value;};};window.__anovaResults={};';
edits.sort((a,b)=>a.at-b.at);
let instrumented=prefix,original='',cursor=0;
for(const edit of edits){const bytes=code.slice(cursor,edit.at);instrumented+=bytes+edit.text;original+=bytes;cursor=edit.at;}
instrumented+=code.slice(cursor);original+=code.slice(cursor);
assert.equal(original,code,'every original byte, including numerical function bodies, is retained');
const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
console.log('ANOVA BUNDLE:',bundle,sha256,hostDir?'R analysis host':portable?'portable':'standalone development');
const {chromium}=dependency('playwright'),browser=await chromium.launch();
const failures=[],observed=[];const referenceChecks=checks;checks=0;
try {
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.route('**/graphbuilder2.min.js',r=>r.fulfill({contentType:'text/javascript',body:instrumented}));
    if(hostDir||portable)await page.route('**/*.html',async route=>{
        let html=fs.readFileSync(new URL(route.request().url()),'utf8');
        const target=hostDir?'/* ANOVA_VERIFICATION_RENDERER */':code;
        assert.equal(html.split(target).length,2,'exactly one unmodified selected bundle/host slot');
        html=html.replace(target,()=>instrumented);
        await route.fulfill({contentType:'text/html',body:html});
    });
    if(!hostDir) {
        await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);
        await page.waitForFunction(()=>window.PS_SHELL&&window.__anovaVerification);
        if(await page.locator('#ps-welcome').isVisible())await page.click('#ps-welcome-sample');
    }
    for(const c of refs.cases) {
        try {
            if(hostDir) {
                await page.goto(pathToFileURL(path.resolve(hostDir,c.id+'.html')).href);
                await page.waitForFunction(()=>window.__anovaVerification);
            }
            const got=await page.evaluate(({c,host})=>{
                if(!host) {
                    const S=PS_SHELL,prior=window.__anovaVerification.revision;
                    const factorNames=c.levels.map((_,i)=>String.fromCharCode(65+i));
                    const measures=Array.from({length:c.k},(_,i)=>'t'+(i+1));
                    const columns=[...factorNames,...measures];
                    const rows=c.rows.map(r=>[...factorNames.map(f=>r[f]==null?'':f+'_'+r[f]),...r.values.map(v=>v==null?'':String(v))]);
                    const types=Object.fromEntries(columns.map(n=>[n,factorNames.includes(n)?'nominal':'continuous']));
                    S.loadTable(c.id,columns,rows,types);
                    const module=['two','three'].includes(c.family)?'plotbuilder':'rmplotbuilder';
                    S.chart().options[module]={};
                    S.setRoles(module,module==='rmplotbuilder'?{measures,betweenVar:factorNames[0]||null,facetVar:factorNames[1]||null}:
                        {xvar:'A',yvar:'t1',groupVar:'B',facetVar:factorNames[2]||null});
                    S.setModule(module);if(window.__anovaVerification.revision<=prior)throw Error('fresh renderer hook required');
                }
                const h=window.__anovaVerification;
                const original=()=>JSON.stringify(host?gb2_undo.getData():PS_SHELL.project.table);
                const before=original();let result,lines;
                // Exercise the actual visible-chart population assembly,
                // not manually constructed observation arrays.
                window.__gb2_statsOmniEff='etaP';
                if(['two','three'].includes(c.family)) {
                    const method=c.family==='two'?'twoWayANOVA':'threeWayANOVA',fn=h.core[method];
                    h.core[method]=function(...args){result=fn.apply(this,args);return result;};
                    try{lines=h.omni();}finally{h.core[method]=fn;}
                } else {window.__anovaResults={};lines=h.omni();result=window.__anovaResults[c.family];}
                const raw=gb2_undo.getData().bars.flatMap(b=>b.values).filter(Number.isFinite).sort((a,b)=>a-b);
                const names=c.levels.map((_,i)=>String.fromCharCode(65+i));
                const inputs=c.rows.filter(r=>names.every(n=>r[n]!==null)).flatMap(r=>r.values).filter(Number.isFinite).sort((a,b)=>a-b);
                return {result,lines,tableUnchanged:before===original(),observationsExact:JSON.stringify(raw)===JSON.stringify(inputs)};
            },{c,host:!!hostDir});
            observed.push({id:c.id,...got});checks++;assert(got.tableUnchanged,c.id+': calculation preserves data');
            checks++;assert(got.observationsExact,c.id+': chart retains exact original observations');
            const r=got.result,expected=precise.cases.find(p=>p.id===c.id).expected;
            if(expected.status==='refuse') {
                checks++;assert(!r||r.emptyCells||r.ok===false,c.id+': undefined design must be refused');
                assert(got.lines.length&&!got.lines.some(l=>/F\(/.test(l)),c.id+': no inferential numbers for refused design');checks++;
            } else {
                assert(r&&!r.emptyCells&&r.ok!==false,c.id+': result required: '+JSON.stringify(r));
                assert.equal(got.lines.length,expected.terms.length,c.id+': visible term count');checks++;
                const factorial=['two','three'].includes(c.family);
                near(factorial?r.N:r.res.n,expected.n,c.id+'/n');
                for(const t of expected.terms) {
                    const a=factorial?r[t.key]:c.family==='rm'?{...r.res,eta:r.effect}:r.res[c.family==='mixed'&&t.key==='og'?'inter':t.key];
                    assert(a,c.id+': term '+t.key+' required');
                    for(const key of factorial?['F','p','ss']:['F','p','df1','df2','eta'])near(a[key],t[key],c.id+'/'+t.key+'/'+key);
                    if(factorial) {
                        near(a.df,t.df1,c.id+'/'+t.key+'/df1');near(r.dfe,t.df2,c.id+'/'+t.key+'/df2');
                        near(r.sse,t.sse,c.id+'/'+t.key+'/sse');near(a.ss/(a.ss+r.sse),t.eta,c.id+'/'+t.key+'/eta');
                    } else if(t.key.includes('o'))near(r.res.eps,t.eps,c.id+'/'+t.key+'/eps');
                }
            }
            // Open the real Sigma panel and verify the actual text reaches
            // the DOM; exact formatting checks below are separate from the
            // high-precision numerical comparisons above.
            await page.locator('button[aria-label="Statistics"]').click();
            await page.getByRole('button',{name:'Omnibus',exact:true}).click();
            const shown=await page.locator('[data-st-pane]:visible').innerText();
            const squash=s=>s.replace(/\s/g,'');
            if(expected.status==='refuse') {
                for(const line of got.lines){assert(squash(shown).includes(squash(line)),c.id+': DOM refusal');checks++;}
            } else {
                const table=await page.locator('[data-st-pane]:visible table').evaluate(el=>
                    [...el.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>c.innerText)));
                assert.equal(table.length,expected.terms.length+1,c.id+': DOM table row count');checks++;
                assert.equal(table[0].at(-1),'η²p',c.id+': partial eta-squared heading');checks++;
                for(let i=0;i<keys[c.family].length;i++) {
                    const t=expected.terms.find(t=>t.key===keys[c.family][i]),row=table[i+1];
                    assert.equal(row[0],got.lines[i].split(': F(')[0],c.id+': effect label/order');checks++;
                    const displayed=(value,reference,label,unit)=>{
                        assert(Number.isFinite(Number(value))&&Math.abs(Number(value)-reference)<=unit+3e-7*Math.abs(reference),c.id+': displayed '+label);checks++;
                    };
                    displayed(row[1],t.F,'F',.005001);
                    const dfs=row[2].split(',');assert.equal(dfs.length,2);
                    displayed(dfs[0],t.df1,'df1',.005001);displayed(dfs[1],t.df2,'df2',.005001);
                    if(t.p<.001)assert.equal(row[3],'< .001',c.id+': small p disclosure');
                    else displayed(row[3],t.p,'p',.0005001);
                    checks++;displayed(row[4],t.eta,'partial eta-squared',.005001);
                }
            }
            console.log('  ok',c.id);
        } catch(e){failures.push(e.message);console.log('  FAIL',e.message);}
    }
    assert.deepEqual(errors,[],'no application page errors');
} finally {await browser.close();}
if(process.env.PS_ANOVA_OUT)fs.writeFileSync(process.env.PS_ANOVA_OUT,JSON.stringify({bundle,sha256,host:hostDir?'R analysis':portable?'portable':'development',referenceChecks,checks,failures,observed},null,2));
console.log('ANOVA PACKAGE CHECK:',refs.cases.length,'cases,',referenceChecks,'reference checks,',checks,'application checks,',failures.length,'failures');
process.exitCode=failures.length?1:0;
