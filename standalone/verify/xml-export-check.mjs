// XML-invalid labels must remain exact data/group identities while exporting
// as readable escapes. The native XML parser is the independent file oracle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
let chromium;
for (const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp'].filter(Boolean)) {
    try { ({chromium}=createRequire(path.join(base,'x.js'))('playwright')); break; } catch {}
}
assert(chromium,'Playwright required');
const browser=await chromium.launch();
const output=process.env.PS_XML_OUT;
if(output)fs.mkdirSync(output,{recursive:true});
let checks=0;
let controlProject;
function check(value,message){checks++;assert(value,message);}
try {
    const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];
    page.setDefaultTimeout(15000);
    page.on('pageerror',e=>errors.push(String(e)));
    // Exercise the same shell against the unminified shared renderer too.
    let sourceLoaded=false;
    if(process.env.PS_XML_BUNDLE==='source') await page.route('**/graphbuilder2.min.js',route=>{
        sourceLoaded=true;return route.fulfill({path:path.resolve('inst/widget/graphbuilder2.js'),contentType:'text/javascript'});
    });
    await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);
    await page.waitForFunction(()=>window.PS_SHELL);
    if(process.env.PS_XML_BUNDLE==='source')check(sourceLoaded,'unminified renderer actually loaded');
    if(await page.locator('#ps-welcome').isVisible())await page.click('#ps-welcome-sample');
    const unit=await page.evaluate(()=>{
        const G=GraphBuilder2, bad=[], mistakes=[];
        for(let c=0;c<=65535;c++) {
            // XML 1.0 Char production, deliberately separate from the
            // production regex and with exact hand-specified examples below.
            const legal=c===9||c===10||c===13||(c>=32&&c<=0xd7ff)||(c>=0xe000&&c<=0xfffd);
            const raw=String.fromCharCode(c),safe=G.xmlSafeText(raw);
            if(legal ? safe!==raw : !/^\\u[0-9A-F]{4}$/.test(safe)||parseInt(safe.slice(2),16)!==c)mistakes.push(c);
            if(!legal)bad.push(c);
        }
        let pairs=0;
        for(let hi=0xd800;hi<=0xdbff;hi++)for(const lo of [0xdc00,0xddff,0xdfff]) {
            const raw=String.fromCharCode(hi,lo);
            if(G.xmlSafeText(raw)!==raw)mistakes.push([hi,lo]);
            pairs++;
        }
        const examples=['A\u0001B','AB','A\\u0001B','\ud800X\udc00','\ud800\udc00',
            'é α 中 & < > " \' \\ two  spaces\t\n\r 😀','\ufffe\uffff'];
        const ns='http://www.w3.org/2000/svg',root=document.createElementNS(ns,'svg');
        const raw=examples.join('|');root.setAttribute('data-facet',raw);
        root.setAttribute('data-bar-group','A\u0001B');
        const title=document.createElementNS(ns,'title');title.textContent=raw;root.appendChild(title);
        const before=new XMLSerializer().serializeToString(root),copy=root.cloneNode(true);
        G.prepareSvgForExport(copy);
        const once=new XMLSerializer().serializeToString(copy);
        G.prepareSvgForExport(copy);
        const twice=new XMLSerializer().serializeToString(copy);
        const parsed=new DOMParser().parseFromString(once,'image/svg+xml');
        return {mistakes,pairs,bad:bad.length,examples:examples.map(G.xmlSafeText),
            unchanged:before===new XMLSerializer().serializeToString(root),idempotent:once===twice,
            valid:!parsed.querySelector('parsererror'),
            rejectedBefore:!!new DOMParser().parseFromString(before,'image/svg+xml').querySelector('parsererror'),
            raw:JSON.parse(parsed.documentElement.getAttribute('data-gb2-raw-attributes')),
            expectedRaw:raw};
    });
    assert.deepEqual(unit.mistakes,[]);checks+=65536+unit.pairs;
    assert.deepEqual(unit.examples,['A\\u0001B','AB','A\\u0001B','\\uD800X\\uDC00','\ud800\udc00',
        'é α 中 & < > " \' \\ two  spaces\t\n\r 😀','\\uFFFE\\uFFFF']);checks+=7;
    check(unit.unchanged&&unit.idempotent&&unit.valid,'clone only; idempotent; native XML parser accepts output');
    check(unit.rejectedBefore,'native XML parser rejects unsanitized control-character fixture');
    check(unit.raw['data-facet']===unit.expectedRaw&&unit.raw['data-bar-group']==='A\u0001B','export metadata recovers original code units exactly');
    const codes=[...Array.from({length:32},(_,i)=>i).filter(i=>![9,10,13].includes(i)),0xfffe,0xffff,0xd800,0xdc00];
    const cases=codes.map(c=>({id:'u'+c.toString(16).padStart(4,'0'),raw:String.fromCharCode(c),escape:'\\u'+c.toString(16).toUpperCase().padStart(4,'0')}));
    cases.push({id:'valid_unicode',raw:'é α 中 😀 & < > " \' \\  ',escape:'é α 中 😀 & < > " \' \\  '});
    for(const c of cases) {
        const got=await page.evaluate(async c=>{
            const S=PS_SHELL,groups=['G'+c.raw+'X','GX','G'+c.escape+'X'];
            // Valid text can equal its display spelling; keep a third
            // genuinely distinct group for that compatibility case.
            if(groups[0]===groups[2])groups[2]='Third';
            const facets=['A'+c.raw+'B','Other'];
            const rows=facets.flatMap((f,fi)=>groups.flatMap((g,gi)=>Array.from({length:8},(_,i)=>
                [String(i+1),String((fi?-1:1)*(gi+1)*(i+1)+gi),g,f])));
            S.loadTable('XML labels',['x','y','group','panel'],rows,{x:'numeric',y:'numeric',group:'nominal',panel:'nominal'});
            const chart=S.chart();chart.fitPane=false;
            chart.caption='Caption '+c.raw+' end';chart.exportDescription='Description '+c.raw+' end';
            const desc=document.getElementById('ps-export-description');if(desc)desc.value=chart.exportDescription;
            chart.options.xyplotbuilder={xyFitType:'linear',chartSpec:JSON.stringify({
                plotWidth:13,plotHeight:6,chartTitle:'Title '+c.raw+' end',
                chartNote:'Note '+c.raw+' end',xyShowFit:true,xyShowStats:true,xyShowCI:false,
                xyShowEllipse:false,xyStatsShowEqn:false,xyStatsShowR2:false,
                facetStripBackground:'fill',xyFitColorMatch:false,xyFitColor:'#d42c20'})};
            S.setRoles('xyplotbuilder',{xvar:'x',yvar:'y',groupVar:'group',facetVar:'panel'});
            S.setModule('xyplotbuilder');
            const tableBefore=JSON.stringify(S.project.table),optsBefore=JSON.stringify(chart.options);
            const payloadBefore=JSON.stringify(S.buildPayload());
            function inspect(root) {
                const rawAttr=(el,key)=>{
                    const encoded=el.getAttribute('data-gb2-raw-attributes');
                    const obj=encoded?JSON.parse(encoded):null;
                    return obj&&Object.hasOwn(obj,key)?obj[key]:el.getAttribute(key);
                };
                return {texts:[...root.querySelectorAll('text')].map(t=>t.textContent),
                    fits:[...root.querySelectorAll('[data-role="xy-fit"]')].map(p=>({
                        group:rawAttr(p,'data-bar-group'),facet:rawAttr(p,'data-facet'),d:p.getAttribute('d')})),
                    rawTexts:[...root.querySelectorAll('[data-gb2-raw-text]')].map(t=>JSON.parse(t.getAttribute('data-gb2-raw-text'))),
                    stats:[...root.querySelectorAll('[data-role="xy-stats"]')].map(t=>t.textContent)};
            }
            const live=inspect(document.getElementById('psroot'));
            const svg=await (await S.exportBlob('svg',192,'white')).text();
            const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
            const exported=inspect(doc);
            const serialized=S.projectFileText(),saved=JSON.parse(serialized);
            const result={valid:!doc.querySelector('parsererror'),live,exported,groups,facets,
                dataPreserved:tableBefore===JSON.stringify(S.project.table)&&optsBefore===JSON.stringify(chart.options)&&payloadBefore===JSON.stringify(S.buildPayload()),
                filePreserved:JSON.stringify(saved.project.table.raw)===JSON.stringify(S.project.table.raw),
                preservedDetails:[tableBefore===JSON.stringify(S.project.table),optsBefore===JSON.stringify(chart.options),payloadBefore===JSON.stringify(S.buildPayload())],
                title:doc.querySelector('title')?.textContent,description:doc.querySelector('desc')?.textContent};
            if(c.id==='u0001') {
                result.files={svg:btoa(unescape(encodeURIComponent(svg)))};
                for(const format of ['png','pdf']) {
                    const blob=await S.exportBlob(format,192,'white');
                    result.files[format]=await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(blob);});
                }
                result.rawProject=serialized;
            }
            return result;
        },c);
        check(got.valid,c.id+': exported SVG parses');
        check(got.dataPreserved&&got.filePreserved,c.id+': exports and saved project preserve data/options/numbers '+JSON.stringify(got.preservedDetails)+' file='+got.filePreserved);
        for(const [label,v] of [['live',got.live],['export',got.exported]]) {
            check(v.fits.length===6,c.id+': '+label+' six distinct facet/group fits');
            for(const [fi,f]of got.facets.entries())for(const [gi,g]of got.groups.entries()) {
                const fits=v.fits.filter(p=>p.group===g&&p.facet===f);
                check(fits.length===1,c.id+': '+label+' exact group identity, including literal escape spelling');
                const points=[...fits[0].d.matchAll(/[ML]([-+.\deE]+),([-+.\deE]+)/g)].map(m=>m.slice(1).map(Number));
                check(points.length>=2&&points.every(p=>p.every(Number.isFinite)),c.id+': finite fitted geometry');
                // Opposite exact slopes must still rise/fall in their own
                // panels. The existing R facet oracle checks full values.
                check((points.at(-1)[1]-points[0][1])*(fi?-1:1)<0,c.id+': expected fit direction');
            }
            check(v.stats.filter(t=>t.includes('n = 8')).length===6,c.id+': '+label+' eight observations per exact cell');
            check(v.texts.includes('Title '+c.escape+' end'),c.id+': '+label+' title escape matches layout');
            check(v.texts.includes('A'+c.escape+'B'),c.id+': '+label+' facet escape matches layout');
            check(v.texts.some(t=>t.includes(('Note '+c.escape+' end').replace(/\s+/g,' '))),c.id+': '+label+' note escaped before word wrapping');
            if(c.id!=='valid_unicode')check(v.rawTexts.includes('Title '+c.raw+' end'),c.id+': '+label+' editor retains original title');
        }
        assert.deepEqual(got.live.fits,got.exported.fits);checks++;
        check(got.exported.texts.some(t=>t.includes(('Caption '+c.escape+' end').replace(/\s+/g,' '))),c.id+': caption escaped before wrapping');
        check(got.description==='Description '+c.escape+' end',c.id+': custom SVG description is XML-safe');
        if(got.files) {
            controlProject=got.rawProject;
            for(const[ext,data]of Object.entries(got.files)) {
                const bytes=Buffer.from(data,'base64');check(bytes.length>500,'nonempty '+ext+' conversion');
                if(ext==='png')check(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'real PNG bytes');
                if(ext==='pdf')check(bytes.subarray(0,5).toString()==='%PDF-','real PDF bytes');
                if(output)fs.writeFileSync(path.join(output,'control-labels.'+ext),bytes);
            }
            if(output)fs.writeFileSync(path.join(output,'original-project.pand'),got.rawProject);
        }
        console.log('PASS '+c.id);
    }
    assert(controlProject,'retained raw control-character project');
    await page.evaluate(text=>{PS_SHELL.markSavedForTest();return PS_SHELL.openProjectText(text);},controlProject);
    await page.waitForFunction(()=>document.querySelector('[data-role="chart-title"]'));
    // Opening either text editor must expose the original code unit. An
    // unchanged edit must never write the visible escape into chartSpec.
    await page.locator('[data-role="chart-title"]').dispatchEvent('dblclick');
    check(await page.evaluate(()=>document.activeElement?.value==='Title \u0001 end'),'inline editor reads original title');
    check(await page.locator('[data-field="text-content"]').inputValue()==='Title \u0001 end','inspector editor reads original title');
    await page.keyboard.press('Escape');
    check(await page.evaluate(()=>JSON.parse(PS_SHELL.chart().options.xyplotbuilder.chartSpec).chartTitle==='Title \u0001 end'),'canceling edit preserves saved raw title');
    console.log('PASS original text in both editors');
    await page.evaluate(()=>{
        const S=PS_SHELL,opts=S.chart().options.xyplotbuilder,spec=JSON.parse(opts.chartSpec);
        spec.chartTitle='Title \u0001 end\nSecond \u000b line';opts.chartSpec=JSON.stringify(spec);S.render();
    });
    await page.locator('[data-role="chart-title"]').dispatchEvent('dblclick');
    check(await page.evaluate(()=>document.activeElement?.value==='Title \u0001 end\nSecond \u000b line'),'multiline inline editor reads original title');
    check(await page.locator('[data-field="text-content"]').inputValue()==='Title \u0001 end\nSecond \u000b line','multiline inspector reads original title');
    await page.keyboard.press('Escape');
    await page.evaluate(text=>PS_SHELL.openProjectText(text),controlProject);
    await page.evaluate(()=>{
        const t=document.querySelector('.graphbuilder2-host svg'),r=t.getBoundingClientRect();
        t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left,clientY:r.top}));
    });
    await page.locator('[data-context-action="pin-chart"]').click();
    await page.locator('#ps-contextmenu [data-context-action^="keep-to-"]').first().click();
    const pin=await page.evaluate(()=>{
        const p=PS_SHELL.project.pinboards.flatMap(b=>b.pins).at(-1);
        const svg=decodeURIComponent(p.src.slice(p.src.indexOf(',')+1));
        const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
        return {valid:!doc.querySelector('parsererror'),fits:doc.querySelectorAll('[data-role="xy-fit"]').length,
            title:doc.querySelector('[data-role="chart-title"]')?.textContent};
    });
    check(pin.valid&&pin.fits===6&&pin.title==='Title \\u0001 end','Notebook chart capture remains vector SVG with all exact-cell fits');
    console.log('PASS Notebook chart capture');
    const layout=await page.evaluate(async()=>{
        const S=PS_SHELL,chartId=S.chart().id,rawBefore=JSON.stringify(S.project.table.raw);
        S.addLayout();const l=S.chart();l.page={preset:'custom',w:1320,h:780,margin:20};
        l.items=[{id:'xml-chart',kind:'chart',chartId,x:20,y:20,w:1250,h:570},
            {id:'xml-text',kind:'text',text:'Layout \u0001 \uffff end',x:25,y:620,fontSize:16}];S.render();
        const liveText=document.querySelector('.ps-ltext')?.textContent,files={};
        for(const format of ['svg','png','pdf']) {
            const b=await S.exportBlob(format,192,'white');
            files[format]=await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(b);});
        }
        const svg=await(await S.exportBlob('svg',192,'white')).text();
        const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
        return {liveText,files,valid:!doc.querySelector('parsererror'),
            exported:doc.documentElement.textContent, fits:doc.querySelectorAll('[data-role="xy-fit"]').length,
            preserved:rawBefore===JSON.stringify(S.project.table.raw)&&l.items[1].text==='Layout \u0001 \uffff end',
            snapshot:!!S.snapshotOf(chartId)?.valid};
    });
    check(layout.valid&&layout.snapshot&&layout.fits===6,'layout nests a valid vector snapshot with all six fits');
    check(layout.preserved,'layout export preserves raw data and editable layout text');
    check(layout.liveText==='Layout \\u0001 \\uFFFF end'&&layout.exported.includes(layout.liveText),'layout live/export text use identical escaped content');
    for(const[ext,data]of Object.entries(layout.files)) {
        const bytes=Buffer.from(data,'base64');check(bytes.length>500,'nonempty layout '+ext+' conversion');
        if(output)fs.writeFileSync(path.join(output,'control-layout.'+ext),bytes);
    }
    check(errors.length===0,'no browser exceptions: '+errors.join('; '));
    console.log(`XML EXPORT: ${cases.length} rendered cases, ${checks} checks passed; SVG/PNG/PDF conversion passed`);
} finally {await browser.close();}
