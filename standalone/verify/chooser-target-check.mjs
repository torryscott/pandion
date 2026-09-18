// UX-06: completing a pristine chart must preserve its identity; other work
// and explicit New chart entry points must never be replaced implicitly.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
let chromium;
for(const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp','/tmp'].filter(Boolean)){
 try{({chromium}=createRequire(path.join(base,'probe.js'))('playwright'));break;}catch{}
}
assert(chromium);const browser=await chromium.launch();let checks=0;
async function run(name, action){
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(10000);
 try{
  await page.goto(pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href);
  await page.locator('#ps-welcome-sample').click();await page.waitForTimeout(1700);
  if(await page.locator('#ps-coach-ok').isVisible())await page.locator('#ps-coach-ok').click();
  await page.evaluate(()=>window.PS_SHELL.addChart());
  await action(page);assert.deepEqual(errors,[]);console.log('  ok '+name);checks++;
 }finally{await page.close();}
}
const snapshot=p=>p.evaluate(()=>({count:PS_SHELL.charts().length,chart:JSON.parse(JSON.stringify(PS_SHELL.chart()))}));
async function compare(p){await p.locator('[data-hmc-mode="questions"]').click();await p.locator('[data-hmc-go="compare"]').click();await p.locator('[data-hmc-go="compare-summary"]').click();}
async function choose(p){await p.locator('#ps-empty-hmc').click();await compare(p);}
async function kept(p,before,module){
 await p.waitForFunction(()=>!document.querySelector('#ps-help-choose').offsetHeight);
 const after=await snapshot(p);assert.equal(after.count,before.count);assert.equal(after.chart.id,before.chart.id);assert.equal(after.chart.name,before.chart.name);assert.equal(after.chart.module,module);
 await p.waitForFunction(()=>document.activeElement?.matches('.ps-slot-drop'));checks++;
 return after;
}
try{
 await run('question route uses the same blank chart',async p=>{
  const before=await snapshot(p);await choose(p);assert.equal(await p.locator('[data-hmc-create]').innerText(),'Use for this chart');
  await p.locator('[data-hmc-create]').focus();await p.keyboard.press('Enter');await kept(p,before,'plotbuilder');
 });
 await run('a different analysis reuses the same document',async p=>{
  const before=await snapshot(p);await p.locator('#ps-empty-hmc').click();await p.locator('[data-hmc-mode="questions"]').click();await p.locator('[data-hmc-go="scatter"]').click();
  assert.equal(await p.locator('[data-hmc-create]').innerText(),'Use for this chart');await p.locator('[data-hmc-create]').click();
  await kept(p,before,'xyplotbuilder');
 });
 await run('chart-type shortcut uses the same chart and requested type',async p=>{
  const before=await snapshot(p);await choose(p);await p.locator('[data-hmc-start="Bar"]').click();
  const after=await kept(p,before,'plotbuilder');assert.equal(after.chart.options.plotbuilder.graphType,'bar');
 });
 await run('variable route assigns roles on the existing chart',async p=>{
  const before=await snapshot(p);await p.locator('#ps-empty-hmc').click();await p.locator('[data-hmc-mode="variables"]').click();
  await p.locator('[data-hmc-variable="condition"]').click();await p.locator('[data-hmc-variable="score"]').click();
  const button=p.locator('[data-hmc-data-create="plotbuilder"]').first();assert.equal(await button.innerText(),'Use for this chart');await button.click();
  const after=await kept(p,before,'plotbuilder');assert.equal(after.chart.roles.plotbuilder.xvar,'condition');assert.equal(after.chart.roles.plotbuilder.yvar,'score');
 });
 await run('explicit New chart remains a creation route even beside a blank chart',async p=>{
  const before=await snapshot(p);await p.evaluate(()=>PS_SHELL.showAnalysisGallery());await p.locator('[data-analysis-help]').click();await compare(p);
  assert.match(await p.locator('[data-hmc-create]').innerText(),/^Create /);await p.locator('[data-hmc-create]').click();
  const after=await snapshot(p);assert.equal(after.count,before.count+1);assert.notEqual(after.chart.id,before.chart.id);
 });
 for(const mode of ['roles','style','other-module-roles','other-module-style'])await run('preserves blank chart with '+mode,async p=>{
  await p.evaluate(mode=>{
   if(mode==='roles')PS_SHELL.setRoles('plotbuilder',{xvar:'condition'});
   if(mode==='style')window.setOption('chartSpec',JSON.stringify({chartPalette:'okabe-ito'}));
   if(mode==='other-module-roles'){PS_SHELL.setModule('xyplotbuilder');PS_SHELL.setRoles('xyplotbuilder',{xvar:'score'});PS_SHELL.setModule('plotbuilder');}
   if(mode==='other-module-style'){PS_SHELL.setModule('xyplotbuilder');window.setOption('chartSpec',JSON.stringify({chartPalette:'okabe-ito'}));PS_SHELL.setModule('plotbuilder');}
  },mode);await p.waitForTimeout(1900);
  const before=await snapshot(p);await choose(p);assert.match(await p.locator('[data-hmc-create]').innerText(),/^Create /);await p.locator('[data-hmc-create]').click();
  const old=await p.evaluate(id=>JSON.parse(JSON.stringify(PS_SHELL.charts().find(c=>c.id===id))),before.chart.id);
  assert.deepEqual(old,before.chart);assert.equal((await snapshot(p)).count,before.count+1);
 });
 await run('cancel clears the reuse target before opening New chart',async p=>{
  const before=await snapshot(p);await choose(p);await p.locator('#ps-help-choose-close').click();assert.deepEqual(await snapshot(p),before);
  await p.evaluate(()=>PS_SHELL.showAnalysisGallery());await p.locator('[data-analysis-help]').click();await compare(p);
  assert.match(await p.locator('[data-hmc-create]').innerText(),/^Create /);await p.locator('[data-hmc-create]').click();assert.equal((await snapshot(p)).count,before.count+1);
 });
 await run('changed target requires a newly reviewed action',async p=>{
  const before=await snapshot(p);await choose(p);
  // Simulate a host-side state change while the modal is open. The actual
  // acceptance button must detect it instead of applying the old promise.
  await p.evaluate(()=>PS_SHELL.setRoles('plotbuilder',{xvar:'condition'}));
  await p.locator('[data-hmc-create]').click();assert.equal((await snapshot(p)).count,before.count);
  assert(await p.locator('#ps-help-choose').isVisible());assert.match(await p.locator('[data-hmc-create]').innerText(),/^Create /);
  assert.equal((await snapshot(p)).chart.roles.plotbuilder.xvar,'condition');
 });
 await run('new-chart statistical preferences are retained during reuse',async p=>{
  await p.evaluate(()=>PS_SHELL.showPreferences());await p.locator('#ps-pref-tab-stats').click();
  await p.locator('#ps-pref-def-eb').selectOption('sd');await p.locator('#ps-pref-def-rmm').selectOption('between');await p.locator('#ps-pref-def-alpha').selectOption('0.01');await p.locator('#ps-preferences-save').click();
  await p.evaluate(()=>PS_SHELL.addChart());const before=await snapshot(p);await choose(p);
  assert.equal(await p.locator('[data-hmc-create]').innerText(),'Use for this chart');await p.locator('[data-hmc-create]').click();
  const after=await kept(p,before,'plotbuilder');assert.deepEqual(after.chart.options,before.chart.options);
 });
 console.log('CHOOSER TARGET PASS ('+checks+' checks)');
}finally{await browser.close();}
