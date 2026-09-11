// Bar-style choices: exposed selection and keyboard continuity through redraws.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let chromium;
for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
  try { ({chromium}=createRequire(path.join(base,'probe.js'))('playwright')); break; } catch {}
}
assert(chromium, 'Playwright required');
const hostDir=process.env.GB2_BAR_HOST_DIR, evidence=process.env.PS_BAR_OUT;
const browser=await chromium.launch(), failures=[], observations=[];
let checks=0;
const groups={orient:{vertical:'Vertical',horizontal:'Horizontal'},summary:{mean:'Mean',median:'Median'},
  freqstat:{count:'Count',percent:'Percent',proportion:'Proportion'},freqpos:{dodge:'Side by side',stack:'Stacked',fill:'Stacked 100%'}};
async function state(page, group, selected) {
  const selector='[data-bs-'+group+']';
  const actual=await page.locator(selector).evaluateAll((nodes,group)=>nodes.map(n=>({value:n.getAttribute('data-bs-'+group),pressed:n.getAttribute('aria-pressed')})),group);
  assert.deepEqual(actual,Object.keys(groups[group]).map(value=>({value,pressed:String(value===selected)})),group+' selected state');
  const {root}=await page.cdp.send('DOM.getDocument');
  for(const [value,label] of Object.entries(groups[group])) {
    const {nodeId}=await page.cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-bs-'+group+'="'+value+'"]'});
    const {nodes}=await page.cdp.send('Accessibility.getPartialAXTree',{nodeId,fetchRelatives:false});
    const node=nodes[0];
    assert.equal(node.role.value,'button');assert.equal(node.name.value,label);
    assert.equal(String(node.properties.find(p=>p.name==='pressed')?.value.value),String(value===selected));
  }
  observations.push({fixture:page.fixture,group,selected,actual});checks++;
}
async function change(page, group, value, key='Enter') {
  const selector='[data-bs-'+group+'="'+value+'"]';
  await page.locator(selector).focus();
  await page.locator(selector).evaluate(el=>{window.__barOldChoice=el;});
  const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY,panel:document.querySelector('.gb2-panel')?.scrollTop}));
  await page.keyboard.press(key);
  await page.waitForFunction(()=>!window.__barOldChoice.isConnected);
  await page.waitForFunction(sel=>document.activeElement?.matches(sel),selector,{timeout:2500});checks++;
  await state(page,group,value);
  await page.waitForTimeout(1800);
  await page.waitForFunction(sel=>document.activeElement?.matches(sel),selector,{timeout:2500});checks++;
  assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,panel:document.querySelector('.gb2-panel')?.scrollTop})),scroll);checks++;
  await state(page,group,value);
}
try {
 for(const fixture of ['cg','rm','freq']) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.fixture=fixture;page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.cdp=await page.context().newCDPSession(page);
  try {
   let payload;
   if(hostDir) {
    await page.addInitScript(()=>customElements.define('jmv-results-html',class extends HTMLElement {
      render(payload){const old=this.querySelector('.graphbuilder2-host'),fresh=document.createElement('div');fresh.id=old.id+'-echo';fresh.className=old.className;this.replaceChildren(fresh);window.__gb2_lastRenderedHash=null;window.GraphBuilder2.render(fresh.id,payload);this.ready=Promise.resolve();}
    }));
    const file=path.join(hostDir,({cg:'cg_bar_labels',rm:'rm_bar',freq:'freq_bar_stack'})[fixture]+'.html');
    payload=JSON.parse(readFileSync(file,'utf8').match(/var __gb2_payload = (\{.*?\});\n/s)[1]);
    await page.goto(pathToFileURL(file).href);await page.waitForSelector('.graphbuilder2-host svg');
    await page.evaluate(()=>{const host=document.querySelector('.graphbuilder2-host'),result=document.createElement('jmv-results-html');host.before(result);result.appendChild(host);});
   } else {
    let sourceLoaded=false;
    if(process.env.PS_BAR_BUNDLE==='source')await page.route('**/graphbuilder2.min.js',r=>{sourceLoaded=true;return r.fulfill({path:path.resolve('inst/widget/graphbuilder2.js'),contentType:'text/javascript'});});
    await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);
    if(process.env.PS_BAR_BUNDLE==='source')assert(sourceLoaded);
    await page.locator('#ps-welcome-close').click();
    await page.evaluate(fixture=>{
      const s=window.PS_SHELL;s.loadTable('choice checks',['Group','Subgroup','Before','After'],Array.from({length:16},(_,i)=>[i%2?'B':'A',i%3?'X':'Y',String(i+10),String(i+12+i%3)]),{Group:'nominal',Subgroup:'nominal',Before:'continuous',After:'continuous'});
      const mod=({cg:'plotbuilder',rm:'rmplotbuilder',freq:'freqplotbuilder'})[fixture];s.setModule(mod);
      s.setRoles(mod,fixture==='cg'?{xvar:'Group',yvar:'After'}:fixture==='rm'?{measures:['Before','After']}:{var:'Group',groupVar:'Subgroup'});
      s.setWorkspace('chart');window.setOption('graphType','bar');
    },fixture);
    await page.waitForTimeout(1900);if(await page.locator('#ps-coach-ok').isVisible())await page.locator('#ps-coach-ok').click();
   }
   // Value labels sit at the centre of the R frequency bars. Select the
   // visible bar near its corner, leaving those separately clickable labels alone.
   const bar=page.locator('[data-bar-cat]:not([data-role])').first();
   const bounds=await bar.boundingBox();assert(bounds);
   await bar.click({position:{x:bounds.width*0.15,y:bounds.height*0.15}});
   await page.locator('[data-bs-btn="bar-orient"]').click();await page.waitForTimeout(400);
   await state(page,'orient','vertical');await change(page,'orient','horizontal');
   await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-bs-orient="vertical"]').evaluate(el=>el===document.activeElement),true);checks++;
   await change(page,'orient','vertical','Space');
   await page.keyboard.press('Enter');await state(page,'orient','vertical');
   if(hostDir){assert(await page.evaluate(()=>!!window.__gb2_htmlViewPatched));await page.evaluate(p=>document.querySelector('jmv-results-html').render(p),payload);await state(page,'orient','vertical');await page.waitForFunction(()=>document.activeElement?.matches('[data-bs-orient="vertical"]'));checks++;}
   if(fixture!=='freq') {
    await page.locator('[data-bs-btn="bar-summary"]').click();await page.waitForTimeout(300);
    await state(page,'summary','mean');await change(page,'summary','median');await change(page,'summary','mean','Space');
   } else {
    await page.locator('[data-bs-btn="bar-freqdisplay"]').click();await page.waitForTimeout(300);
    await state(page,'freqpos',hostDir?'stack':'dodge');await state(page,'freqstat','count');
    await change(page,'freqstat','percent');await change(page,'freqstat','proportion','Space');await change(page,'freqstat','count');
    await change(page,'freqpos',hostDir?'dodge':'stack');await state(page,'freqstat','count');
    await change(page,'freqpos','fill','Space');assert.equal(await page.locator('[data-bs-freqstat]').count(),0);checks++;
    await change(page,'freqpos','dodge');await state(page,'freqstat','count');
    await page.locator('[data-bs-freqstat="percent"]').click();await page.waitForTimeout(1900);await state(page,'freqstat','percent');
   }
   assert.deepEqual(errors,[]);console.log('  ok '+fixture+': selected states, keyboard, redraws and '+(hostDir?'R-result replacement':'host echoes'));
  }catch(e){failures.push(fixture+': '+e.message);}finally{await page.close();}
 }
 assert.deepEqual(failures,[],failures.join('\n'));console.log('BAR CHOICES PASS ('+checks+' checks)');
}finally{if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(path.join(evidence,'bar-choices.json'),JSON.stringify(observations,null,2));}await browser.close();}
