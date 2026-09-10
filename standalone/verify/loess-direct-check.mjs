import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const refs = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/pandion-loess-direct.json', 'utf8'));
const roster = [];
for (const n of [20,31,60,100]) for (const shape of ['regular','irregular','tied']) {
    for (const span of [.5,.75,1,1.5]) roster.push(`${n}_${shape}_${span}`);
    if (n === 100) roster.push(`${n}_${shape}_0.1`);
}
for (const span of [.5,.75,1,1.5]) for (const kind of ['small_units','large_units','offset','small_response']) roster.push(`${kind}_${span}`);
roster.push('constant_response','four_points','quadratic', ...['few','span','constant_x','two_levels','partial'].map(s=>'unavailable_'+s));
assert.equal(refs.schemaVersion, 1);
assert.equal(refs.method, 'stats::loess degree=2 family=gaussian surface=direct');
assert.deepEqual(Object.keys(refs.cases).sort(), roster.sort(), 'complete LOESS reference roster');
const S = new Function('var window={};\n'+fs.readFileSync('standalone/js/ps-stat.js','utf8')+'\nreturn window.PSStat;')();
const source = fs.readFileSync('inst/widget/graphbuilder2.js','utf8');
function extract(name) {
    const start = source.indexOf('function '+name+'('); assert(start >= 0);
    let depth = 0;
    for (let i = source.indexOf('{',start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(start,i+1);
    }
    throw Error('unbalanced '+name);
}
const shared = new Function(extract('_xyMatInv')+'\nfunction _xyTCrit(){return 2;}\n'+extract('_xyFitLoess')+'\nreturn _xyFitLoess;')();
const groupPoints = new Function('data',extract('_xyFitCellKey')+'\n'+extract('_xyPointsGroupedForFit')+'\nreturn _xyPointsGroupedForFit();');
let checks = 0, failures = [];
function check(v, label) { checks++; assert(v,label); }
function run(label, fn) { try { fn(); } catch(e) { failures.push(label+': '+e.message); } }
run('literal group labels',()=>{
    const labels=['__proto__','constructor','toString'],pp={xs:[],ys:[],groups:[],parallel:true};
    for(const label of labels) for(let i=0;i<20;i++) {pp.xs.push(i);pp.ys.push(i*i);pp.groups.push(label);}
    const got=groupPoints({xyPoints:pp});
    check(JSON.stringify(got.order.map(k=>got.byG[k].group))===JSON.stringify(labels),'all literal group labels retained');
    for(const label of labels) check(got.order.map(k=>got.byG[k]).find(e=>e.group===label).xs.length===20,'group size '+label);
});
run('facet/group identity',()=>{
    // Exercise delimiter collisions in the pure grouping helper. These
    // control-character keys are not used as XML/SVG display labels.
    const pairs=[['a','b\u0001c'],['a\u0001b','c'],['constructor','__proto__'],[null,'c'],['a',null]];
    const got=groupPoints({groupLabelDefault:'group',facetLabel:'facet',xyPoints:pairs.map(([g,f],i)=>({x:i,y:i+10,group:g,facet:f}))});
    check(got.order.length===3,'missing labels excluded; distinct cells retained');
    for(let i=0;i<3;i++)check(got.order.some(k=>{const e=got.byG[k];return e.group===pairs[i][0]&&e.facet===pairs[i][1]&&e.xs.length===1&&e.xs[0]===i;}),'literal composite cell '+i);
});
function compare(c, got, label) {
    if (!c.available) return check(got === null,label+': unavailable local quadratic must not emit a partial/fallback curve');
    check(got && got.xs.length === 100 && got.ys.length === 100,label+': complete curve');
    check(!Object.hasOwn(got,'lwrs') && !Object.hasOwn(got,'uprs'),label+': curve only; no approximate band');
    const tol = 2e-9 * Math.max(...c.y.map(Math.abs),Number.MIN_VALUE);
    const xtol = 2e-14 * Math.max(...c.x.map(Math.abs),Number.MIN_VALUE);
    for (let i = 0; i < 100; i++) {
        check(Number.isFinite(got.xs[i]) && Math.abs(got.xs[i]-c.grid[i]) <= xtol,label+': x['+i+']');
        check(Number.isFinite(got.ys[i]) && Math.abs(got.ys[i]-c.expected[i]) <= tol,
            `${label}: y[${i}] expected ${c.expected[i]}, got ${got.ys[i]} (tolerance ${tol})`);
    }
}
for (const [id,c] of Object.entries(refs.cases)) {
    assert.equal(c.available,!id.startsWith('unavailable_'),id+': fixed availability contract');
    assert(c.x.length === c.y.length && c.x.every(Number.isFinite) && c.y.every(Number.isFinite));
    assert(c.grid.length === 100 && c.grid.every(Number.isFinite));
    if (c.available) {
        assert(c.expected.length === 100 && c.expected.every(Number.isFinite),id+': finite reference');
        assert.deepEqual(c.referenceWarnings,[],id+': warning-free reference');
    } else assert.equal(c.expected,null);
    run(id+'/standalone',()=>compare(c,S.loessFit(c.x,c.y,c.span,.95,c.grid),id));
    run(id+'/preview',()=>{
        const pts = shared(c.x,c.y,c.span,.95,c.grid);
        if (pts) check(pts.every(p=>!Object.hasOwn(p,'lwr')&&!Object.hasOwn(p,'upr')),id+': no preview band');
        compare(c,pts ? {xs:pts.map(p=>p.x),ys:pts.map(p=>p.y)} : null,id);
    });
}
if (!process.argv.includes('--unit')) {
    let chromium;
    for (const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp'].filter(Boolean)) {
        try { ({chromium}=createRequire(path.join(base,'x.js'))('playwright')); break; } catch {}
    }
    assert(chromium,'Playwright required');
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage(), errors = [];
        page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE || 'standalone/index.html')).href);
        await page.waitForFunction(()=>window.PS_SHELL);
        if (await page.locator('#ps-welcome').isVisible()) await page.click('#ps-welcome-sample');
        for (const [id,c] of Object.entries(refs.cases)) {
            const got = await page.evaluate(c=>{
                const S=PS_SHELL;
                S.loadTable('loess-direct',['x','y'],c.x.map((x,i)=>[String(x),String(c.y[i])]),{x:'numeric',y:'numeric'});
                // Keep every independent observed-range vertex visible. The
                // export suite separately verifies clipped path geometry.
                const spec={xyShowFit:true,xyShowCI:true};
                if(c.available) {
                    const ys=c.y.concat(c.expected),lo=Math.min(...ys),hi=Math.max(...ys);
                    const pad=Math.max(hi-lo,Math.abs(hi)*1e-4,Number.MIN_VALUE)*.1;
                    spec.yMinOverride=spec.yMaxOverride=true;spec.yMin=lo-pad;spec.yMax=hi+pad;
                }
                S.chart().options.xyplotbuilder={xyFitType:'loess',xyLoessSpan:c.span,
                    chartSpec:JSON.stringify(spec)};
                S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y'}); S.setModule('xyplotbuilder');
                const payload=S.buildPayload(); payload.xyFitFullRange=false;
                const fits=structuredClone(payload.xyFits);
                GraphBuilder2.render('psroot',payload);
                const result = { fits, note:payload.missingNote,
                    bandCount:document.querySelectorAll('#psroot [data-role="xy-ci"]').length,
                    curves:[...document.querySelectorAll('#psroot [data-role="xy-fit"]')].map(p=>p.getAttribute('d')),
                    observations:[...document.querySelectorAll('#psroot [data-role="xy-point"]')].map(p=>{
                        const b=p.getBBox(); return [b.x+b.width/2,b.y+b.height/2];
                    }) };
                // An out-of-order host echo carries an old linear curve.
                // Exercise the actual compiled preview and render-entry guard:
                // it must replace that curve, or clear it if LOESS is unavailable.
                payload.xyFits=[{group:null,fit_type:'linear',points:[
                    {x:c.x[0],y:c.y[0]}, {x:c.x[c.x.length-1],y:c.y[c.y.length-1]}]}];
                GraphBuilder2.render('psroot',payload);
                result.previewFits=structuredClone(payload.xyFits);
                result.previewCurves=[...document.querySelectorAll('#psroot [data-role="xy-fit"]')].map(p=>p.getAttribute('d'));
                result.previewBands=document.querySelectorAll('#psroot [data-role="xy-ci"]').length;
                if(c.literalLabels) {
                    const labels=['__proto__','constructor','toString'];
                    S.loadTable('literal groups',['x','y','group'],labels.flatMap(g=>c.x.map((x,i)=>[String(x),String(c.y[i]),g])),{x:'numeric',y:'numeric',group:'nominal'});
                    S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y',groupVar:'group'});
                    const grouped=S.buildPayload();grouped.xyFitFullRange=false;
                    grouped.xyFits.forEach(f=>{f.fit_type='linear';});
                    GraphBuilder2.render('psroot',grouped);
                    result.labelFits=structuredClone(grouped.xyFits);
                }
                return result;
            },{...c,literalLabels:id==='31_regular_0.5'});
            run(id+'/browser',()=>{
                check(got.fits.length===(c.available?1:0),id+': payload curve count');
                compare(c,got.fits[0]?.points || null,id+'/payload');
                check(got.bandCount===0,id+': rendered without band');
                check(got.curves.length===(c.available?1:0),id+': rendered curve count');
                check(got.previewCurves.length===(c.available?1:0),id+': stale curve replaced/cleared');
                check(got.previewBands===0,id+': compiled preview emits no invented band');
                const preview=got.previewFits[0]?.points;
                compare(c,preview?{xs:preview.map(p=>p.x),ys:preview.map(p=>p.y)}:null,id+'/compiled preview');
                if (!c.available) {
                    check(/LOESS unavailable/.test(got.note),id+': visible explanation for unavailable fit'); return;
                }
                check(got.observations.length===c.x.length,id+': calibration observations');
                const calibrate=(v,d)=>{
                    const lo=v.indexOf(Math.min(...v)),hi=v.indexOf(Math.max(...v));
                    const scale=v[lo]===v[hi]?0:(got.observations[hi][d]-got.observations[lo][d])/(v[hi]-v[lo]);
                    return x=>got.observations[lo][d]+scale*(x-v[lo]);
                };
                const px=calibrate(c.x,0),py=calibrate(c.y,1);
                const nums=(got.curves[0].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig)||[]).map(Number);
                check(nums.length===200,id+': full SVG curve');
                for(let i=0;i<100;i++) check(Math.abs(nums[2*i]-px(c.grid[i]))<.001 && Math.abs(nums[2*i+1]-py(c.expected[i]))<.001,id+': SVG vertex '+i);
                check(got.previewCurves[0]===got.curves[0],id+': preview and authoritative curve geometry agree');
                if(id==='31_regular_0.5') {
                    check(JSON.stringify(got.labelFits.map(f=>f.group))===JSON.stringify(['__proto__','constructor','toString']),'compiled preview retains literal group labels');
                    for(const f of got.labelFits) compare(c,{xs:f.points.map(p=>p.x),ys:f.points.map(p=>p.y)},'compiled group '+f.group);
                }
            });
        }
        check(errors.length===0,'no uncaught browser errors: '+errors.join('\n'));
    } finally { await browser.close(); }
}
for(const fail of failures) console.error('FAIL '+fail);
console.log(`LOESS DIRECT: ${roster.length} cases, ${checks} checks, ${failures.length} failures`);
process.exitCode=failures.length?1:0;
