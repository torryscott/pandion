// Independent R comparisons and refusal guards for the renderer's extension
// helper. It may only extend an unweighted polynomial matching the entire
// stored fit, and may never manufacture a missing confidence band.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const refs=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/pandion-fit-export.json','utf8'));
const source=fs.readFileSync('inst/widget/graphbuilder2.js','utf8');
function extract(name){
    const at=source.indexOf('function '+name+'(');assert(at>=0,name);
    let depth=0;
    for(let i=source.indexOf('{',at);i<source.length;i++){
        if(source[i]==='{')depth++;
        if(source[i]==='}'&&--depth===0)return source.slice(at,i+1);
    }
    throw Error('unbalanced '+name);
}
const at=source.indexOf('    var _gb2Stats = {'),end=source.indexOf('\n    };',at);assert(at>=0&&end>at);
const extend=new Function(source.slice(at,end+7)+'\n'+['_xyTCrit','_xyFitOLS','_xyExtendOLSFit'].map(extract).join('\n')+'\nreturn _xyExtendOLSFit;')();
let checks=0;
const cases=Object.values(refs.cases);assert.equal(cases.length,45);
function fitFor(c,r){
    const host=c.hostFits.find(f=>(f.group||'')===r.group && (f.facet||'')===(r.facet||''));assert(host);
    const p=host.points;
    return {group:r.group,fit_type:c.type,points:p.xs.map((x,i)=>{
        const pt={x,y:p.ys[i]};if(p.lwrs){pt.lwr=p.lwrs[i];pt.upr=p.uprs[i];}return pt;
    })};
}
function observations(c,r){const indices=c.x.map((_,i)=>i).filter(i=>c.groups[i]===r.group && c.facets[i]===(r.facet||''));return {xs:indices.map(i=>c.x[i]),ys:indices.map(i=>c.y[i])};}
for(const c of cases)for(const r of c.references){
    const fit=fitFor(c,r),before=JSON.stringify(fit);
    const got=c.spec.xyFitFullRange?extend(fit,observations(c,r),c.spec.xMin,c.spec.xMax,c.level,c.type):fit.points;
    assert.equal(JSON.stringify(fit),before,'stored model is not mutated');checks++;
    assert.equal(got.length,r.values.xs.length);checks++;
    const scale=Math.max(...c.y.map(Math.abs));
    for(let i=0;i<got.length;i++){
        assert(Math.abs(got[i].x-r.values.xs[i])<=2e-14*Math.max(...c.x.map(Math.abs)));checks++;
        for(const [a,b]of r.df>0?[['y','ys'],['lwr','lwrs'],['upr','uprs']]:[['y','ys']]){
            assert(Number.isFinite(got[i][a])&&Math.abs(got[i][a]-r.values[b][i])<=2e-9*scale,c.type+'_'+c.variant+'.'+a+'['+i+']');checks++;
        }
        if(r.df===0){assert(!Object.hasOwn(got[i],'lwr')&&!Object.hasOwn(got[i],'upr'));checks++;}
    }
}
const c=refs.cases.poly3_grouped,r=c.references[0],baseline=fitFor(c,r),obs=observations(c,r);
const call=(fit,input=obs,level=c.level)=>extend(fit,input,c.spec.xMin,c.spec.xMax,level,c.type);
const guards=[
    ['missing observations',fit=>call(fit,null)],
    ['different mean model',fit=>{fit.points[25].y+=1;return call(fit);}],
    ['different interval model',fit=>{fit.points[25].lwr-=1;return call(fit);}],
    ['unsupported smoother',fit=>{fit.fit_type='loess';return call(fit);}],
    ['singular observations',fit=>call(fit,{xs:Array(8).fill(1),ys:[1,2,3,4,5,6,7,8]})],
    ['non-finite predictions',fit=>extend(fit,obs,-1e200,1e200,c.level,c.type)]
];
for(const[label,fn]of guards){const fit=structuredClone(baseline);assert.equal(fn(fit),fit.points,label+' must stop at the supplied data range');checks++;}
const noCI=structuredClone(baseline);noCI.points.forEach(p=>{delete p.lwr;delete p.upr;});
const curve=call(noCI);assert.equal(curve.length,300);assert(curve.every(p=>!Object.hasOwn(p,'lwr')&&!Object.hasOwn(p,'upr')));checks+=2;
// Missing legacy level defaults to 95%, rather than creating a nearly zero CI.
const legacy=refs.cases.poly2_clip,lr=legacy.references[0],lf=fitFor(legacy,lr);
assert.equal(extend(lf,observations(legacy,lr),legacy.spec.xMin,legacy.spec.xMax,undefined,legacy.type).length,300);checks++;
console.log(`FIT EXPORT UNIT: ${cases.length} cases, ${checks} checks, 8 refusal/compatibility guards passed`);

// Exact geometry fixtures independently specify crossings, disconnected lobes,
// complete rejection, and a band enclosing the entire viewport.
const clip=new Function(extract('_xyClipFitGeometry')+';return _xyClipFitGeometry;')();
const points=a=>a.map(([x,y])=>({x,y}));
const line=a=>clip(points(a),0,10,0,10,false);
assert.deepEqual(line([[-5,5],[15,5]]),[{x:0,y:5,move:true},{x:10,y:5}]);
assert.deepEqual(line([[1,1],[3,15],[7,15],[9,1]]).map(p=>!!p.move),[true,false,true,false]);
assert.deepEqual(line([[-5,-5],[-1,-1]]),[]);
assert.deepEqual(line([[5,-1e308],[5,1e308]]),[{x:5,y:0,move:true},{x:5,y:10}]);
assert.deepEqual(clip(points([[-5,-5],[15,-5],[15,15],[-5,15]]),0,10,0,10,true).map(p=>[p.x,p.y]).sort(),[[0,0],[0,10],[10,0],[10,10]].sort());
assert.deepEqual(clip(points([[-5,-5],[-1,-5],[-1,-1]]),0,10,0,10,true),[]);
assert.deepEqual(line([[0,0],[NaN,1]]),[]);
console.log('FIT CLIPPING UNIT: 7 exact boundary/topology guards passed');

// Regression: a step smaller than the ULP at an offset must terminate,
// including when a caller supplies an invalid interval. Use a VM deadline
// so restoring the old infinite loop fails the test instead of hanging CI.
const vm=await import('node:vm');
const ticks=(lo,hi,step)=>vm.runInNewContext(extract('buildTicks')+'; JSON.stringify(buildTicks(lo,hi,step));',{lo,hi,step},{timeout:500});
assert.equal(ticks(0,95,10),'[0,10,20,30,40,50,60,70,80,90]');
assert.equal(ticks(7,7+2e-15,1e-16),'[7]');
assert.equal(ticks(-7-2e-15,-7,1e-16),'[-7.000000000000002]');
for(const [lo,hi,step]of [[0,1,0],[0,1,-1],[0,Infinity,1],[0,1,NaN],[2,1,1]])assert.equal(ticks(lo,hi,step),'[]');
console.log('AXIS TICK UNIT: 8 normal/extreme/invalid interval guards passed');
