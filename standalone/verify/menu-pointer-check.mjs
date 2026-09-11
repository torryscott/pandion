// UX-07: genuine pointer movement opens by hover before the subsequent click.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
let chromium;
for(const base of [process.env.GB2_NODE_BASE,process.cwd(),'/private/tmp','/tmp'].filter(Boolean)){
 try{({chromium}=createRequire(path.join(base,'probe.js'))('playwright'));break;}catch{}
}
assert(chromium);const browser=await chromium.launch();let checks=0;
const url=pathToFileURL(path.resolve(process.env.PS_PAGE||'standalone/index.html')).href;
async function expanded(p,menu,yes=true){assert.equal(await p.locator('[data-ps-menu="'+menu+'"]').getAttribute('aria-expanded'),String(yes));assert.equal(await p.locator('#ps-appmenu').isVisible(),yes);checks++;}
try{
 const p=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(url);await p.locator('#ps-welcome-sample').click();await p.waitForTimeout(1800);if(await p.locator('#ps-coach-ok').isVisible())await p.locator('#ps-coach-ok').click();
 await p.locator('[data-ps-menu="insert"]').click();await expanded(p,'insert');
 for(const name of ['data','edit','file','view','help','insert']){
  await p.locator('[data-ps-menu="'+name+'"]').hover();await expanded(p,name);
  await p.locator('[data-ps-menu="'+name+'"]').click();await expanded(p,name);
 }
 await p.locator('[data-ps-menu="insert"]').click();await expanded(p,'insert',false);
 await p.locator('[data-ps-menu="file"]').click();await p.locator('[data-ps-menu="data"]').click();await expanded(p,'data');
 await p.mouse.click(900,500);await expanded(p,'data',false);
 // Opening and closing an empty chart seeds the real Restore submenu.
 await p.evaluate(()=>{PS_SHELL.addChart();PS_SHELL.runCommand('delete-document');});
 await p.locator('[data-ps-menu="file"]').click();
 for(const kind of ['recent','closed']){
  const trigger=p.locator('[data-app-submenu="'+kind+'"]');assert.equal(await trigger.isDisabled(),false);
  await trigger.hover();await trigger.click();assert(await p.locator('#ps-appsubmenu').isVisible());assert.equal(await trigger.getAttribute('aria-expanded'),'true');checks++;
  assert(await p.locator('#ps-appsubmenu').evaluate(el=>el.contains(document.activeElement)));checks++;
  await p.keyboard.press('ArrowLeft');assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);checks++;
  await p.keyboard.press('ArrowRight');assert(await p.locator('#ps-appsubmenu').isVisible());checks++;
  await p.keyboard.press('Escape');assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);checks++;
 }
 await p.locator('[data-app-submenu="recent"]').hover();await p.locator('[data-app-submenu="closed"]').hover();
 assert.equal(await p.locator('[data-app-submenu="recent"]').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('[data-app-submenu="closed"]').getAttribute('aria-expanded'),'true');checks++;
 await p.locator('[data-ps-menu="edit"]').hover();assert.equal(await p.locator('#ps-appsubmenu').isVisible(),false);await p.keyboard.press('Escape');
 await p.locator('[data-ps-menu="file"]').focus();await p.keyboard.press('Enter');await expanded(p,'file');assert(await p.locator('#ps-appmenu').evaluate(el=>el.contains(document.activeElement)));checks++;
 await p.keyboard.press('ArrowRight');await expanded(p,'edit');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-ps-menu="edit"]').evaluate(el=>el===document.activeElement),true);checks++;
 assert.deepEqual(errors,[]);await p.close();
 const touch=await browser.newContext({hasTouch:true,viewport:{width:1200,height:900}}),t=await touch.newPage();
 await t.goto(url);await t.locator('#ps-welcome-sample').tap();await t.waitForTimeout(1800);if(await t.locator('#ps-coach-ok').isVisible())await t.locator('#ps-coach-ok').tap();
 await t.locator('[data-ps-menu="insert"]').tap();await t.locator('[data-ps-menu="data"]').tap();await expanded(t,'data');await t.locator('[data-ps-menu="data"]').tap();await expanded(t,'data',false);await touch.close();
 console.log('MENU POINTER PASS ('+checks+' checks)');
}finally{await browser.close();}
