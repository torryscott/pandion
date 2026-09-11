import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const input=process.argv.slice(2).find(a=>!a.startsWith('--')) || '/tmp/pandion-fit-export.json';
const refs=JSON.parse(fs.readFileSync(input,'utf8'));
const variants=['wide','clip','crop','off','zero_df','small_units','large_units','offset','small_response','band_only','line_only','grouped','hidden_group','literal_groups','facets'];
const roster=['linear','poly2','poly3'].flatMap(type=>variants.map(v=>type+'_'+v));
assert.equal(refs.schemaVersion,1);
assert.deepEqual(Object.keys(refs.cases).sort(),roster.sort(),'complete export reference roster');
let checks=0,failures=[];
function check(v,label){checks++;assert(v,label);}
function run(label,fn){try{fn();}catch(e){failures.push(label+': '+e.message);}}
for(const [id,c] of Object.entries(refs.cases)) {
    assert.equal(id,c.type+'_'+c.variant);
    assert.equal(c.degree,['linear','poly2','poly3'].indexOf(c.type)+1);
    assert(c.x.length===c.y.length && c.x.every(Number.isFinite) && c.y.every(Number.isFinite));
    assert.equal(c.panelCount,c.variant==='facets'?2:1);
    assert.equal(c.references.length,c.variant==='facets'?4:c.variant==='literal_groups'?3:['grouped','hidden_group'].includes(c.variant)?2:1);
    for(const r of c.references) {
        assert.equal(r.df,c.variant==='zero_df'?0:21-c.degree-1);
        assert.equal(r.hidden,c.variant==='hidden_group'&&r.group==='A');
        const n=['crop','off'].includes(c.variant)?100:300;
        for(const [key,len] of [['values',n],['midpoints',n-1]]) for(const field of r.df>0?['xs','ys','lwrs','uprs']:['xs','ys']) {
            assert(Array.isArray(r[key][field]) && r[key][field].length===len && r[key][field].every(Number.isFinite),id+': reference '+key+'.'+field);
        }
    }
    assert(c.hostFits.length===c.references.length,id+': R host fits required');
}
// Independent parametric segment clipping in pixel coordinates. The renderer
// uses endpoint region codes; this oracle solves the admissible t interval.
function segments(pairs,rect) {
    const out=[];
    for(let i=1;i<pairs.length;i++) {
        const a=pairs[i-1],b=pairs[i];let lo=0,hi=1;
        for(const [axis,min,max]of [[0,rect.x,rect.x+rect.width],[1,rect.y,rect.y+rect.height]]) {
            const d=b[axis]-a[axis];
            if(d===0){if(a[axis]<min||a[axis]>max){lo=1;hi=0;}continue;}
            const ts=[(min-a[axis])/d,(max-a[axis])/d].sort((a,b)=>a-b);
            lo=Math.max(lo,ts[0]);hi=Math.min(hi,ts[1]);
        }
        if(lo<=hi)out.push([a.map((v,k)=>v+lo*(b[k]-v)),a.map((v,k)=>v+hi*(b[k]-v))]);
    }
    return out;
}
const close=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.001;
function contains(poly,x,y) {
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
        const a=poly[i],b=poly[j];
        if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
}
function geometry(c,got,label) {
    const visible=c.references.filter(r=>!r.hidden);
    for(const role of ['xy-fit','xy-ci']) {
        const wanted=role==='xy-fit'?(c.spec.xyShowFit?visible:[]):(c.spec.xyShowCI?visible.filter(r=>r.df>0):[]);
        const paths=got.paths.filter(p=>p.role===role);
        check(paths.length===wanted.length,label+': '+role+' count');
        for(const r of wanted) {
            const pp=paths.filter(p=>p.group===r.group && (p.facet||'')===(r.facet||''));
            check(pp.length===1,label+': each facet/group fit appears exactly once');
            const clips=new Set();
            for(const p of pp) {
                check(p.rect && p.rect.width>0 && p.rect.height>0,label+': valid clipping rectangle');
                clips.add(p.clip);
                const rect=p.rect;
                const px=x=>rect.x+(x-c.spec.xMin)/(c.spec.xMax-c.spec.xMin)*rect.width;
                const py=y=>rect.y+rect.height-(y-c.spec.yMin)/(c.spec.yMax-c.spec.yMin)*rect.height;
                const v=r.values;
                const pairs=role==='xy-fit'?v.xs.map((x,i)=>[x,v.ys[i]]):v.xs.map((x,i)=>[x,v.uprs[i]]).concat(v.xs.map((x,i)=>[x,v.lwrs[i]]).reverse());
                const vertices=[...p.d.matchAll(/([ML])\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)[, ]+([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/ig)].map(m=>({command:m[1],xy:[Number(m[2]),Number(m[3])]}));
                const pixelPairs=pairs.map(([x,y])=>[px(x),py(y)]);
                for(const {xy:[x,y]} of vertices)check(Number.isFinite(x)&&Number.isFinite(y)&&x>=rect.x-.001&&x<=rect.x+rect.width+.001&&y>=rect.y-.001&&y<=rect.y+rect.height+.001,label+': export geometry stays in clip bounds');
                if(role==='xy-fit') {
                    const expected=segments(pixelPairs,rect),actual=[];
                    for(let i=1;i<vertices.length;i++)if(vertices[i].command==='L')actual.push([vertices[i-1].xy,vertices[i].xy]);
                    check(actual.length===expected.length,label+': clipped curve segment count');
                    for(let i=0;i<expected.length;i++)check(close(actual[i][0],expected[i][0])&&close(actual[i][1],expected[i][1]),label+': curve segment '+i+' differs from R or bridges invisible curve');
                } else {
                    check(!vertices.length || (vertices[0].command==='M'&&vertices.slice(1).every(v=>v.command==='L')),label+': valid band path commands');
                    const polygon=vertices.map(v=>v.xy),edges=segments(pixelPairs.concat([pixelPairs[0]]),rect);
                    const allowed=edges.flat().concat([[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]]);
                    for(const p of polygon)check(allowed.some(a=>close(p,a)),label+': band vertex lies on independent R boundary');
                    for(const p of edges.flat())check(polygon.some(a=>close(p,a)),label+': clipped band retains R boundary vertex');
                    // Compare the filled interior with the original R polygon;
                    // this catches missing lobes and spurious filled bridges.
                    for(let ix=0;ix<29;ix++)for(let iy=0;iy<23;iy++) {
                        const x=rect.x+(ix+.413)/29*rect.width,y=rect.y+(iy+.617)/23*rect.height;
                        check(contains(polygon,x,y)===contains(pixelPairs,x,y),label+': band interior differs from R');
                    }
                }
                // Check the drawn chords too, not just their endpoints. Only
                // visible midpoints matter; the SVG clip removes the rest.
                for(const field of role==='xy-fit'?['ys']:['lwrs','uprs']) for(let i=0;i<v.xs.length-1;i++) {
                    const y=r.midpoints[field][i],x=r.midpoints.xs[i];
                    if(x<c.spec.xMin||x>c.spec.xMax||y<c.spec.yMin||y>c.spec.yMax)continue;
                    check(Math.abs(py((v[field][i]+v[field][i+1])/2)-py(y))<.25,label+': visible '+field+' chord error exceeds 0.25 SVG units');
                }
            }
            check(clips.size===1,label+': one panel clip per fitted cell');
        }
    }
    check(Array.isArray(got.canvas)&&got.canvas.length===2&&got.canvas.every(v=>Number.isFinite(v)&&v>0&&v<2000),label+': export canvas is present and bounded');
    const visiblePoints=c.x.filter((x,i)=>x>=c.spec.xMin && x<=c.spec.xMax && c.y[i]>=c.spec.yMin && c.y[i]<=c.spec.yMax).length;
    check(got.pointCount===visiblePoints,label+': in-range observations are retained, including literal group labels');
}
if(process.argv.includes('--guard-selftest')) {
    // A synthetic pixel map tests the checker itself without a browser.
    const c=refs.cases.poly2_wide,r=c.references[0],rect={x:30,y:20,width:600,height:400};
    const px=x=>rect.x+(x-c.spec.xMin)/(c.spec.xMax-c.spec.xMin)*rect.width;
    const py=y=>rect.y+rect.height-(y-c.spec.yMin)/(c.spec.yMax-c.spec.yMin)*rect.height;
    const make=(role,pairs)=>({role,group:'',clip:'clip1',rect,d:pairs.map(([x,y],i)=>(i?'L':'M')+px(x)+','+py(y)).join(' ')});
    const v=r.values;
    const baseline={canvas:[720,480],pointCount:c.x.length,paths:[make('xy-fit',v.xs.map((x,i)=>[x,v.ys[i]])),
        make('xy-ci',v.xs.map((x,i)=>[x,v.uprs[i]]).concat(v.xs.map((x,i)=>[x,v.lwrs[i]]).reverse()))]};
    const controls=[['valid',()=>{},false],['missing curve',v=>v.paths.shift(),true],['wrong vertex',v=>{v.paths[0].d=v.paths[0].d.replace(/^M[^ ]+/,'M0,0');},true],['missing band',v=>v.paths.pop(),true],['lost clip',v=>{v.paths[0].rect=null;},true],['hidden observations',v=>{v.pointCount=0;},true],['unbounded export',v=>{v.canvas=[10000,480];},true],['malformed band commands',v=>{v.paths[1].d=v.paths[1].d.split(' ').reverse().join(' ');},true]];
    for(const [label,edit,fail] of controls){const v=structuredClone(baseline);edit(v);let failed=false;try{geometry(c,v,label);}catch{failed=true;}assert.equal(failed,fail,label);}
    console.log('FIT EXPORT GEOMETRY GUARDS: '+controls.length+' passed');
} else {
    let chromium;
    for(const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp'].filter(Boolean)) {try{({chromium}=createRequire(path.join(base,'x.js'))('playwright'));break;}catch{}}
    assert(chromium,'Playwright required');
    const browser=await chromium.launch();
    try {
        const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
        page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);
        await page.waitForFunction(()=>window.PS_SHELL);
        if(await page.locator('#ps-welcome').isVisible())await page.click('#ps-welcome-sample');
        for(const [id,c] of Object.entries(refs.cases)) {
            const got=await page.evaluate(async c=>{
                const S=PS_SHELL;
                S.loadTable('fit-export',['x','y','group','facet'],c.x.map((x,i)=>[String(x),String(c.y[i]),c.groups[i],c.facets[i]]),{x:'numeric',y:'numeric',group:'nominal',facet:'nominal'});
                S.chart().options.xyplotbuilder={xyFitType:c.type,xyCILevel:c.level,chartSpec:JSON.stringify(c.spec)};
                S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y',groupVar:c.references.length>1?'group':null,facetVar:c.panelCount>1?'facet':null});
                S.setModule('xyplotbuilder');
                function read(root){const svg=root.querySelector('svg');return {canvas:svg?['width','height'].map(k=>parseFloat(svg.getAttribute(k))):null,pointCount:root.querySelectorAll('[data-role="xy-point"]').length,
                    paths:[...root.querySelectorAll('[data-role="xy-fit"],[data-role="xy-ci"]')].map(p=>{
                        const clip=p.getAttribute('clip-path'),id=clip?.match(/#([^)]*)/)[1],r=id?root.querySelector('[id="'+id+'"] rect'):null;
                        return {role:p.getAttribute('data-role'),group:p.getAttribute('data-bar-group'),facet:p.getAttribute('data-facet'),d:p.getAttribute('d'),clip,
                            rect:r?Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(r.getAttribute(k))])):null};
                    })};}
                const live=read(document.getElementById('psroot'));
                const blob=await S.exportBlob('svg',300,'shown');
                const exported=read(new DOMParser().parseFromString(await blob.text(),'image/svg+xml'));
                // Exercise conversion on all three tightly cropped polynomial
                // orders. A clipped SVG must not become an enormous raster.
                if(c.variant==='clip')for(const format of ['png','pdf']) {
                    const converted=await S.exportBlob(format,192,'white');
                    if(converted.size<100)throw Error(format+' export is empty');
                }
                const payload=S.buildPayload();payload.xyFits=c.hostFits;
                GraphBuilder2.render('psroot',payload);
                const hostLive=read(document.getElementById('psroot'));
                const hostText=document.getElementById('psroot').__gb2_serializeSvg();
                const hostExport=read(new DOMParser().parseFromString(hostText,'image/svg+xml'));
                return {live,exported,hostLive,hostExport};
            },c);
            for(const [name,geo] of Object.entries(got))run(id+'/'+name,()=>geometry(c,geo,id+'/'+name));
        }
        // Exercise the compiled tick loop with a range only a few ULPs
        // wide. A Node-side deadline still fires if browser JS loops forever.
        let timer;
        try {
            const narrow=await Promise.race([page.evaluate(()=>{
                const S=PS_SHELL;
                S.loadTable('narrow-axis',['x','y'],Array.from({length:8},(_,i)=>[String(i+1),'7']),{x:'numeric',y:'numeric'});
                S.chart().options.xyplotbuilder={xyFitType:'linear',chartSpec:JSON.stringify({xyShowFit:true,yMinOverride:true,yMaxOverride:true,yMin:7,yMax:7+2e-15})};
                S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y'});S.setModule('xyplotbuilder');
                const svg=document.querySelector('#psroot svg');
                return !!svg && ![...svg.querySelectorAll('[d]')].some(p=>/NaN|Infinity/.test(p.getAttribute('d')));
            }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('compiled narrow-axis rendering did not terminate')),10000);})]);
            check(narrow,'compiled extreme-axis render terminates with finite geometry');
        } finally {clearTimeout(timer);}
        check(errors.length===0,'no browser errors: '+errors.join('\n'));
    } finally {await browser.close();}
}
for(const f of failures)console.error('FAIL '+f);
console.log(`FIT EXPORT: ${roster.length} cases, ${checks} checks, ${failures.length} failures`);
process.exitCode=failures.length?1:0;
