import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
let chromium;
for(const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp'].filter(Boolean)) {
    try{({chromium}=createRequire(path.join(base,'x.js'))('playwright'));break;}catch{}
}
assert(chromium,'Playwright required');
const dir=process.argv[2]||'/tmp/pandion-xml-host',browser=await chromium.launch();
try {
    for(const name of ['scatter','categorical']) {
        const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];
        page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(pathToFileURL(path.resolve(dir,name+'.html')).href);
        await page.waitForFunction(()=>[...document.querySelectorAll('.graphbuilder2-host')].some(h=>typeof h.__gb2_serializeSvg==='function'));
        const got=await page.evaluate(async()=>{
            const host=[...document.querySelectorAll('.graphbuilder2-host')].find(h=>h.__gb2_serializeSvg);
            const before=[...host.querySelectorAll('[data-role="xy-fit"]')].map(p=>[p.getAttribute('data-bar-group'),p.getAttribute('data-facet'),p.getAttribute('d')]);
            const svg=host.__gb2_serializeSvg(),doc=new DOMParser().parseFromString(svg,'image/svg+xml');
            const fits=[...doc.querySelectorAll('[data-role="xy-fit"]')].map(p=>{
                const raw=JSON.parse(p.getAttribute('data-gb2-raw-attributes')||'{}');
                return [raw['data-bar-group']??p.getAttribute('data-bar-group'),raw['data-facet']??p.getAttribute('data-facet'),p.getAttribute('d')];
            });
            const imageOK=await new Promise(resolve=>{
                const img=new Image();img.onload=()=>resolve(img.width>0&&img.height>0);img.onerror=()=>resolve(false);
                img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
            });
            return {before,fits,imageOK,valid:!doc.querySelector('parsererror'),texts:[...doc.querySelectorAll('text')].map(t=>t.textContent),
                title:doc.querySelector('[data-role="chart-title"]')?.textContent,
                note:[...doc.querySelectorAll('text')].some(t=>t.textContent.includes('Note \\u000B end'))};
        });
        assert(got.valid&&got.imageOK,name+': valid XML loads through browser SVG image decoder');
        assert.equal(got.title,'Title \\u0001 end');assert(got.note,'note controls escaped before word wrapping');
        assert.deepEqual(got.before,got.fits,'export preserves exact original model identities and geometry');
        if(name==='scatter') {
            assert.equal(got.fits.length,6);
            for(const g of ['G\u0001X','GX','G\\u0001X'])for(const f of ['A\u0001B','Other'])
                assert.equal(got.fits.filter(p=>p[0]===g&&p[1]===f).length,1);
            assert.equal(got.texts.filter(t=>t.includes('n = 8')).length,6);
        } else {
            assert(got.texts.includes('G\\u0001X')&&got.texts.includes('GX'),'category labels draw readable escapes');
        }
        assert.deepEqual(errors,[]);console.log('PASS Jamovi XML '+name);await page.close();
    }
    console.log('XML HOST: both R-analysis export fixtures passed');
} finally {await browser.close();}
