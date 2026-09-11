import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire}from'node:module';
import {pathToFileURL}from'node:url';
const input=process.argv.slice(2).find(a=>!a.startsWith('--'))||'/tmp/pandion-facet-fit.json';
const refs=JSON.parse(fs.readFileSync(input,'utf8'));
const types=['linear','poly2','poly3','loess'],variants=['opposite','grouped','unequal','missing','sparse','saturated','rank_deficient','single_panel','literal','hidden_panel','ci80','ci99','missing_group','missing_facet'];
assert.equal(refs.schemaVersion,1);assert.deepEqual(Object.keys(refs.cases).sort(),types.flatMap(t=>variants.map(v=>t+'_'+v)).sort());
const key=e=>JSON.stringify([e.facet??null,e.group??null]);
let checks=0;const failures=[];
function check(ok,label){checks++;assert(ok,label);}
function run(label,fn){try{fn();}catch(e){failures.push(label+': '+e.message);}}
function rows(c,e){return c.x.map((_,i)=>i).filter(i=>Number.isFinite(c.x[i])&&Number.isFinite(c.y[i])&&c.facets[i]===e.facet&&(!c.hasGroup||c.groups[i]===e.group));}
for(const[id,c]of Object.entries(refs.cases)){
 assert.equal(id,c.type+'_'+c.variant);assert.equal(new Set(c.references.map(key)).size,c.references.length);
 for(const e of c.references){assert.equal(e.n,rows(c,e).length,id+' independent cell size');
  for(const which of ['fit','hostFit'])if(e.available){for(const a of Object.values(e[which]))assert(Array.isArray(a)&&a.length===100&&a.every(Number.isFinite),id+' complete finite reference');}
 }
}
function compare(c,got,host,label){
 const wanted=c.references.filter(e=>host?e.hostAvailable:e.available),fits=got.xyFits;
 check(Array.isArray(fits)&&fits.length===wanted.length,label+' exact fitted-cell roster');
 check(new Set(fits.map(key)).size===fits.length,label+' no duplicate fitted cells');
 for(const e of wanted){
  const f=fits.find(f=>key(f)===key(e));check(!!f,label+' missing facet/group '+key(e));
  check(f.fit_type===c.type,label+' selected model type');
  const p=Array.isArray(f.points)?{xs:f.points.map(p=>p.x),ys:f.points.map(p=>p.y),...(f.points[0]?.lwr!==undefined?{lwrs:f.points.map(p=>p.lwr),uprs:f.points.map(p=>p.upr)}:{})}:f.points;
  const ref=host?e.hostFit:e.fit,scale=Math.max(...rows(c,e).map(i=>Math.abs(c.y[i])),Number.MIN_VALUE);
  for(const field of ['xs','ys','lwrs','uprs']){
   if(!ref[field]){check(!p[field],label+' no invented '+field);continue;}
   check(Array.isArray(p[field])&&p[field].length===100,label+' complete '+field);
   for(let i=0;i<100;i++)check(Number.isFinite(p[field][i])&&Math.abs(p[field][i]-ref[field][i])<=2e-9*(field==='xs'?10:scale),label+' '+key(e)+' '+field+'['+i+']');
  }
 }
 if(got.xyStats){
  const wantedStats=c.references.filter(e=>e.stats);
  check(new Set(got.xyStats.map(key)).size===got.xyStats.length,label+' no duplicate statistics cells');
  for(const s of got.xyStats)check(c.references.some(e=>e.n>=3&&key(e)===key(s)),label+' no unrelated statistics populations');
  // Undefined correlations can be represented explicitly by the host; every
  // independently available cell and all its declared values are mandatory.
  for(const e of wantedStats){const s=got.xyStats.find(s=>key(s)===key(e));check(!!s,label+' statistics population '+key(e));
   check(Number.isFinite(s.p)&&Math.abs(s.p-e.stats.p)<=2e-8*Math.abs(e.stats.p)+8*Number.MIN_VALUE,label+' independent correlation tail probability');
   for(const field of ['n','r','slope','intercept','r2'])check(Number.isFinite(s[field])&&Math.abs(s[field]-e.stats[field])<=1e-8*Math.max(1,Math.abs(e.stats[field])),label+' statistic '+field+' '+key(e));
  }
 }
 if(got.xyEllipses){
  const wantedEll=c.references.filter(e=>e.ellipse),actual=got.xyEllipses;
  check(actual.length===wantedEll.length,label+' ellipse cell count');
  for(const e of wantedEll){const ell=actual.find(a=>key(a)===key(e));check(!!ell,label+' ellipse population '+key(e));check(ell.points.length===100,label+' ellipse vertices');
   const {center,cov,chi}=e.ellipse,a=cov[0][0],b=cov[0][1],d=cov[1][1],det=a*d-b*b;
   for(const p of ell.points){const x=p.x-center[0],y=p.y-center[1],q=(d*x*x-2*b*x*y+a*y*y)/det;
    check(Number.isFinite(q)&&Math.abs(q-chi)<1e-6*chi,label+' ellipse differs from independent covariance');}
  }
 }
 if(got.xyPoints){const pp=got.xyPoints;
  for(const e of c.references)if(e.residuals){const indices=pp.xs.map((_,i)=>i).filter(i=>(pp.facets?.[i]??null)===e.facet&&(!c.hasGroup||(pp.groups?.[i]??null)===e.group));
   check(indices.length===e.n,label+' residual population');
   for(let i=0;i<indices.length;i++)check(Number.isFinite(pp.residual_stds[indices[i]])&&Math.abs(pp.residual_stds[indices[i]]-e.residuals[i])<1e-7,label+' within-panel standardized residual');
  }
 }
}
function geometry(c,got,host,label){
 const wanted=c.references.filter(e=>(host?e.hostAvailable:e.available)&&!c.spec.hiddenFacets?.includes(e.facet));
 for(const role of ['xy-fit','xy-ci']){
  const expected=wanted.filter(e=>role==='xy-fit'||(host?e.hostFit:e.fit).lwrs),paths=got.paths.filter(p=>p.role===role);
  check(paths.length===expected.length,label+' '+role+' cell count');
  for(const e of expected){const p=paths.find(p=>key(p)===key(e));check(!!p,label+' '+role+' panel identity');
   const r=p.rect;check(r&&r.width>0&&r.height>0,label+' valid panel clip');
   const px=x=>r.x+(x-c.spec.xMin)/(c.spec.xMax-c.spec.xMin)*r.width,py=y=>r.y+r.height-(y-c.spec.yMin)/(c.spec.yMax-c.spec.yMin)*r.height;
   const f=host?e.hostFit:e.fit,pairs=role==='xy-fit'?f.xs.map((x,i)=>[x,f.ys[i]]):f.xs.map((x,i)=>[x,f.uprs[i]]).concat(f.xs.map((x,i)=>[x,f.lwrs[i]]).reverse());
   const numbers=(p.d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig)||[]).map(Number);
   check(numbers.length===pairs.length*2,label+' every visible '+role+' vertex');
   for(let i=0;i<pairs.length;i++)check(Math.abs(numbers[2*i]-px(pairs[i][0]))<.001&&Math.abs(numbers[2*i+1]-py(pairs[i][1]))<.001,label+' '+role+' R vertex '+i+' '+key(e));
  }
 }
 check(new Set(got.stats.map(key)).size===got.stats.length,label+' unique rendered statistics populations');
 for(const s of got.stats)check(c.references.some(e=>e.n>=3&&key(e)===key(s)&&!c.spec.hiddenFacets?.includes(e.facet)),label+' statistics belong to visible cells');
 for(const e of c.references.filter(e=>e.stats&&!c.spec.hiddenFacets?.includes(e.facet))){
  const row=got.stats.find(s=>key(s)===key(e));check(!!row,label+' rendered statistics cell');
  const v=e.stats,fmt=n=>n.toFixed(2).replace(/^(-?)0\./,'$1.');
  const equation='y = '+v.slope.toFixed(2).replace(/^-/,'−')+'x'+(v.intercept>=0?' + ':' − ')+Math.abs(v.intercept).toFixed(2);
  const prob=v.p<.001?'p < .001':'p = '+v.p.toFixed(3).replace(/^0\./,'.');
  for(const text of ['n = '+v.n,'r = '+fmt(v.r),'R² = '+fmt(v.r2),equation,prob])check(row.text.includes(text),label+' printed statistic matches R: '+text);
 }
 const ell=c.references.filter(e=>e.ellipse&&!c.spec.hiddenFacets?.includes(e.facet));
 check(got.paths.filter(p=>p.role==='xy-ellipse').length===ell.length,label+' rendered ellipse populations');
 for(const e of ell){
  const p=got.paths.find(p=>p.role==='xy-ellipse'&&key(p)===key(e));check(!!p,label+' ellipse assigned to correct panel');
  const r=p.rect,nums=(p.d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/ig)||[]).map(Number);
  check(r&&nums.length===200,label+' complete ellipse geometry');
  const {center,cov,chi}=e.ellipse,a=cov[0][0],b=cov[0][1],d=cov[1][1],det=a*d-b*b;
  for(let i=0;i<100;i++){
   const x=c.spec.xMin+(nums[2*i]-r.x)/r.width*(c.spec.xMax-c.spec.xMin)-center[0];
   const y=c.spec.yMin+(r.y+r.height-nums[2*i+1])/r.height*(c.spec.yMax-c.spec.yMin)-center[1];
   const q=(d*x*x-2*b*x*y+a*y*y)/det;
   check(Number.isFinite(q)&&Math.abs(q-chi)<1e-5*chi,label+' rendered ellipse covariance boundary');
  }
 }
 if(host&&c.variant==='rank_deficient'){
  const row=got.stats.find(s=>s.facet==='South');check(!!row,label+' undefined panel statistic retained');
  check(row.text.includes('r = —')&&row.text.includes('p = —')&&!row.text.includes('p <'),label+' undefined correlation and p remain unavailable');
 }
 const visibleRows=c.x.filter((x,i)=>Number.isFinite(x)&&Number.isFinite(c.y[i])&&c.facets[i]!==null&&!c.spec.hiddenFacets?.includes(c.facets[i])).length;
 check(got.points===visibleRows,label+' visible observations (missing facet excluded)');
 if(c.type!=='linear'&&c.references.some(e=>e.stats))check(got.text.includes('Linear R²')&&got.text.includes('Linear fit:'),label+' linear statistics distinguished from selected smoother');
}
if(process.argv.includes('--guard-selftest')){
 const c=refs.cases.poly2_grouped,baseline=c.host;
 const guards=[['valid',()=>{},false],['missing fit',v=>v.xyFits.pop(),true],['pooled fit',v=>{delete v.xyFits[0].facet;},true],['wrong prediction',v=>{v.xyFits[0].points.ys[0]+=1;},true],['missing band',v=>{delete v.xyFits[0].points.lwrs;},true],['wrong statistics population',v=>{v.xyStats[0].slope+=1;},true],['missing ellipse',v=>v.xyEllipses.pop(),true],['wrong residual',v=>{v.xyPoints.residual_stds[0]+=1;},true]];
 for(const[label,mutate,want]of guards){const v=structuredClone(baseline);mutate(v);let failed=false;try{compare(c,v,true,label);}catch{failed=true;}assert.equal(failed,want,label);}
 console.log('FACET FIT GUARDS: '+guards.length+' passed');
}else{
 for(const[id,c]of Object.entries(refs.cases))run(id+'/R',()=>compare(c,c.host,true,id+'/R'));
 let chromium;for(const base of[process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp'].filter(Boolean)){try{({chromium}=createRequire(path.join(base,'x.js'))('playwright'));break;}catch{}}
 assert(chromium,'Playwright required');const browser=await chromium.launch();
 try{const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);await page.waitForFunction(()=>window.PS_SHELL);
  if(await page.locator('#ps-welcome').isVisible())await page.click('#ps-welcome-sample');
  for(const[id,c]of Object.entries(refs.cases)){
   if(process.env.PS_VERIFY_TRACE)console.log("browser case "+id);
   const got=await page.evaluate(async c=>{
    const S=PS_SHELL,str=v=>v===null?'':String(v);
    S.loadTable('facet validation',['x','y','group','facet'],c.x.map((x,i)=>[str(x),str(c.y[i]),str(c.groups[i]),str(c.facets[i])]),{x:'numeric',y:'numeric',group:'nominal',facet:'nominal'});
    S.chart().options.xyplotbuilder={xyFitType:c.type,xyCILevel:c.level,xyEllipseLevel:c.level,xyLoessSpan:.75,chartSpec:JSON.stringify(c.spec)};
    S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y',groupVar:c.hasGroup?'group':null,facetVar:'facet'});S.setModule('xyplotbuilder');
    const payload=S.buildPayload(),original=structuredClone(payload);
    function read(root){return{stats:[...root.querySelectorAll('[data-role="xy-stats"]')].map(e=>({facet:e.getAttribute('data-facet'),group:e.getAttribute('data-bar-group')||null,text:e.textContent})),points:root.querySelectorAll('[data-role="xy-point"]').length,text:[...root.querySelectorAll('svg text')].map(e=>e.textContent).join(' '),paths:[...root.querySelectorAll('[data-role="xy-fit"],[data-role="xy-ci"],[data-role="xy-ellipse"]')].map(p=>{
     const id=p.getAttribute('clip-path')?.match(/#([^)]*)/)?.[1],r=id?root.querySelector('[id="'+id+'"] rect'):null;
     return{role:p.getAttribute('data-role'),group:p.getAttribute('data-bar-group')||null,facet:p.getAttribute('data-facet')||null,d:p.getAttribute('d'),rect:r?Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])):null};})};}
    const live=read(document.getElementById('psroot'));
    const svg=await S.exportBlob('svg',192,'white');const exported=read(new DOMParser().parseFromString(await svg.text(),'image/svg+xml'));
    const hostPayload=structuredClone(original);Object.assign(hostPayload,structuredClone(c.host));GraphBuilder2.render('psroot',hostPayload);
    const hostLive=read(document.getElementById('psroot')),hostExport=read(new DOMParser().parseFromString(document.getElementById('psroot').__gb2_serializeSvg(),'image/svg+xml'));
    // Untagged legacy pooled records must trigger cell-wise recomputation,
    // including when one of the new cells has too few observations to fit.
    const stale=structuredClone(original);stale.xyFits=[{group:null,fit_type:c.type,points:[{x:-2,y:999},{x:5,y:999}]}];
    GraphBuilder2.render('psroot',stale);const preview=structuredClone(stale.xyFits),previewLive=read(document.getElementById('psroot'));
    return{original,live,exported,hostLive,hostExport,preview,previewLive};
   },c);
   run(id+'/standalone',()=>compare(c,got.original,false,id+'/standalone'));
   run(id+'/preview',()=>compare(c,{xyFits:got.preview},false,id+'/preview'));
   for(const name of['live','exported','hostLive','hostExport','previewLive'])run(id+'/'+name,()=>geometry(c,got[name],name.startsWith('host'),id+'/'+name));
  }
  check(errors.length===0,'no page errors: '+errors.join('\n'));
 }finally{await browser.close();}
}
for(const f of failures)console.error('FAIL '+f);
console.log(`FACET FIT: ${Object.keys(refs.cases).length} cases, ${checks} checks, ${failures.length} failures`);process.exitCode=failures.length?1:0;
