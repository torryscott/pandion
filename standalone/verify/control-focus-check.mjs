// UX-03/04: keyboard position and accessible choices survive rebuilds and echoes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
let chromium;
for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
  try { ({ chromium } = createRequire(path.join(base, 'probe.js'))('playwright')); break; } catch {}
}
assert(chromium, 'Playwright required');
let checks = 0;
let choiceChecks = 0;
const choiceEvidence = [];
const failures = [];
const hostDir = process.env.GB2_FOCUS_HOST_DIR;
// The replacement must contain the host's newly computed method and widths,
// rather than replaying the original within-subjects payload as an echo.
if (hostDir) execFileSync('Rscript', ['standalone/verify/control-focus-host.R', hostDir], { stdio: 'pipe', timeout: 30000 });
const browser = await chromium.launch();
const evidence = process.env.PS_FOCUS_OUT;
if (evidence) mkdirSync(evidence, { recursive: true });
const choiceLabels = {
  type: { se: 'SE', sd: 'SD', ci95: '95% CI', ci99: '99% CI', ci95c: 'Difference-adjusted', none: 'None' },
  method: { within: 'Within-subjects (Cousineau-Morey)', between: 'Between-subjects (uncorrected)' }
};
async function selected(page, group, value, stage) {
  const attr = 'data-eb-' + group;
  const labels = choiceLabels[group];
  const actual = await page.locator('[' + attr + ']').evaluateAll((buttons, attr) => buttons.map(b => ({
    value: b.getAttribute(attr), pressed: b.getAttribute('aria-pressed'), label: b.textContent
  })), attr);
  const expected = Object.entries(labels).map(([key, label]) => ({ value: key, pressed: String(key === value), label }));
  assert.deepEqual(actual, expected, stage + ': exactly one ' + group + ' choice is pressed, with stable labels');
  // Read Chromium's accessibility tree, independently of the DOM attribute
  // checks. This verifies exposed semantics, not a human screen-reader session.
  page.choiceCDP ||= await page.context().newCDPSession(page);
  const { root } = await page.choiceCDP.send('DOM.getDocument');
  const exposed = [];
  for (const [key, label] of Object.entries(labels)) {
    const { nodeId } = await page.choiceCDP.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[${attr}="${key}"]` });
    const { nodes } = await page.choiceCDP.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const node = nodes[0];
    const state = { value: key, role: node.role?.value, name: node.name?.value,
      pressed: String(node.properties?.find(p => p.name === 'pressed')?.value.value) };
    assert.deepEqual(state, { value: key, role: 'button', name: label, pressed: String(key === value) },
      stage + ': accessibility tree exposes ' + group + '/' + key);
    exposed.push(state);
  }
  choiceEvidence.push({ fixture: page.choiceFixture, stage, group, value, exposed });
  choiceChecks++;
}
async function focused(page, selector, label) {
  const hasFocus = await page.waitForFunction(sel => document.activeElement?.matches(sel), selector, { timeout: 2500 })
    .then(() => true, () => false);
  if (!hasFocus) {
    const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName,
      field: document.activeElement?.getAttribute('data-field'), label: document.activeElement?.getAttribute('aria-label') }));
    assert.fail(label + ': ' + JSON.stringify(active));
  }
  checks++;
}
async function newPage(fixture) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.choiceFixture = fixture;
  page.setDefaultTimeout(12000);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  if (hostDir) {
    // Exercise the production pre-swap hook as well as local redraws.
    // This minimal Html-result stand-in replaces the host just as a fresh
    // R result does; it contains no focus preservation of its own.
    await page.addInitScript(() => {
      customElements.define('jmv-results-html', class extends HTMLElement {
        render(payload) {
          const old = this.querySelector('.graphbuilder2-host');
          const fresh = document.createElement('div');
          fresh.id = old.id + '-echo'; fresh.className = 'graphbuilder2-host';
          this.replaceChildren(fresh);
          window.__gb2_lastRenderedHash = null;
          window.GraphBuilder2.render(fresh.id, payload);
          this.ready = Promise.resolve();
        }
      });
    });
  }
  let loadedSource = false;
  if (!hostDir && process.env.PS_FOCUS_BUNDLE === 'source') await page.route('**/graphbuilder2.min.js', route => {
    loadedSource = true;
    return route.fulfill({ path: path.resolve('inst/widget/graphbuilder2.js'), contentType: 'text/javascript' });
  });
  const filename = path.resolve(hostDir ? path.join(hostDir, (fixture === 'cg_bar' ? 'cg_bar_labels' : fixture) + '.html') : process.env.PS_PAGE || 'standalone/index.html');
  if (hostDir) {
    const match = readFileSync(filename, 'utf8').match(/var __gb2_payload = (\{.*?\});\n/s);
    assert(match, 'R fixture contains a real analysis payload');
    page.hostPayload = JSON.parse(match[1]);
  }
  await page.goto(pathToFileURL(filename).href);
  if (hostDir) {
    await page.waitForSelector('.graphbuilder2-host svg');
    // Wrap before any keyboard interaction: reparenting a focused DOM
    // subtree itself blurs it, which is unrelated to a result echo.
    await page.evaluate(() => {
      const host = document.querySelector('.graphbuilder2-host');
      const result = document.createElement('jmv-results-html');
      host.parentNode.insertBefore(result, host); result.appendChild(host);
    });
  }
  if (!hostDir) {
    await page.waitForFunction(() => !!window.PS_SHELL);
    if (process.env.PS_FOCUS_BUNDLE === 'source') assert(loadedSource, 'source renderer actually loaded');
    if (await page.locator('#ps-welcome').isVisible()) await page.locator('#ps-welcome-close').click();
    await page.evaluate(rm => {
      const S = window.PS_SHELL;
      S.loadTable('keyboard focus', ['Group', 'Before', 'After'],
        Array.from({ length: 16 }, (_, i) => [i % 2 ? 'B' : 'A', String(10 + i), String(13 + i + i % 3)]),
        { Group: 'nominal', Before: 'continuous', After: 'continuous' });
      const mod = rm ? 'rmplotbuilder' : 'plotbuilder';
      S.setModule(mod);
      S.setRoles(mod, rm ? { measures: ['Before', 'After'] } : { xvar: 'Group', yvar: 'After' });
      S.setWorkspace('chart');
      window.setOption('graphType', 'bar');
      window.setOption('errorBarType', 'ci95');
    }, fixture === 'rm_bar');
    await page.waitForTimeout(1900); // drain the real 1.5-second option echo
    if (await page.locator('#ps-coach-ok').isVisible()) await page.locator('#ps-coach-ok').click();
  }
  await page.locator('[data-role="error-bar"] rect').first().click();
  await page.locator('[data-bs-tab="errorbars"]').click();
  await page.locator('[data-eb-btn="eb-type"]').click();
  await page.waitForTimeout(500); // finish the initial panel reveal/height fit
  return page;
}
async function changeType(page, value, key) {
  const selector = `[data-eb-type="${value}"]`;
  await page.locator(selector).focus();
  const scrollState = el => {
    const ancestors = {};
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.id) ancestors[p.id] = p.scrollTop;
    }
    return { x: window.scrollX, y: window.scrollY, ancestors };
  };
  const scroll = await page.locator(selector).evaluate(scrollState);
  await page.locator(selector).evaluate(el => { window.__focusOldControl = el; });
  await page.keyboard.press(key);
  await page.waitForFunction(() => !window.__focusOldControl.isConnected);
  await focused(page, selector, value + ' retains focus after local redraw');
  await selected(page, 'type', value, 'after local redraw');
  await page.waitForTimeout(1900);
  await focused(page, selector, value + (hostDir ? ' retains focus after settling' : ' retains focus after delayed echo'));
  await selected(page, 'type', value, hostDir ? 'after settling' : 'after delayed echo');
  if (page.choiceFixture === 'rm_bar') await selected(page, 'method', 'within', 'type changes preserve the method');
  const after = await page.locator(selector).evaluate(scrollState);
  assert.deepEqual(after, scroll, 'changing a setting does not move the viewport'); checks++;
  if (!hostDir) {
    assert.equal(await page.evaluate(() => window.PS_SHELL.buildPayload().errorBarType), value); checks++;
  }
}
try {
  for (const fixture of ['cg_bar', 'rm_bar']) {
    let page;
    try {
      page = await newPage(fixture);
      await selected(page, 'type', hostDir ? 'se' : 'ci95', 'initial panel');
      if (fixture === 'rm_bar') await selected(page, 'method', 'within', 'initial panel');
      // The R battery starts with SE; make the first change to CI there.
      if (hostDir) await changeType(page, 'ci95', 'Enter');
      await changeType(page, 'se', 'Enter');
      if (hostDir) {
        assert(await page.evaluate(() => !!window.__gb2_htmlViewPatched), 'production Html pre-swap hook is installed'); checks++;
        await page.locator('[data-eb-type="se"]').evaluate(el => { window.__focusOldControl = el; });
        await page.evaluate(payload => {
          document.querySelector('jmv-results-html').render(payload);
        }, page.hostPayload);
        await page.waitForFunction(() => !window.__focusOldControl.isConnected);
        await focused(page, '[data-eb-type="se"]', 'Html-result replacement restores the selected control');
        await selected(page, 'type', 'se', 'Html-result replacement');
        if (fixture === 'rm_bar') await selected(page, 'method', 'within', 'Html-result replacement');
      }
      await page.keyboard.press('Tab');
      await focused(page, '[data-eb-type="sd"]', 'Tab reaches the next error type');
      if (evidence) await page.screenshot({ path: path.join(evidence, fixture + '-keyboard.png') });
      await changeType(page, 'sd', 'Space');
      await page.keyboard.press('Shift+Tab');
      await focused(page, '[data-eb-type="se"]', 'Shift+Tab reaches the preceding error type');
      await changeType(page, 'ci99', 'Enter');
      await changeType(page, 'ci95c', 'Space');
      await changeType(page, 'none', 'Enter');
      await changeType(page, 'ci95', 'Enter');
      // Re-activating the current choice must not clear its selected state.
      await page.keyboard.press('Space');
      await selected(page, 'type', 'ci95', 'selected choice activated again');
      // Like the keyboard path: a change rebuilds the panel on a zero-delay
      // timer, so wait for the clicked control to be replaced before the
      // two-step accessibility read (DOM node id, then its AX node), or the
      // rebuild can land between the two calls and the id is gone.
      await page.locator('[data-eb-type="sd"]').evaluate(el => { window.__focusOldControl = el; });
      await page.locator('[data-eb-type="sd"]').click();
      await page.waitForFunction(() => !window.__focusOldControl.isConnected);
      await selected(page, 'type', 'sd', 'mouse activation');
      await page.waitForTimeout(1900);
      await selected(page, 'type', 'sd', 'mouse activation after echo/settling');
      if (!hostDir) {
        // An intentional focus move during the delayed host echo wins.
        await page.locator('[data-eb-type="se"]').focus();
        await page.locator('[data-eb-type="se"]').evaluate(el => { window.__focusOldControl = el; });
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !window.__focusOldControl.isConnected);
        await focused(page, '[data-eb-type="se"]', 'focus restored before moving elsewhere');
        await page.locator('#ps-save').focus();
        await page.waitForTimeout(1900);
        await focused(page, '#ps-save', 'delayed echo does not steal focus from another control');
      }
      if (fixture === 'rm_bar') {
        await page.setViewportSize({ width: 1000, height: 700 });
        await page.waitForTimeout(700);
        await page.locator('[data-eb-method="between"]').focus();
        const panelScroll = await page.locator('[data-eb-method="between"]').evaluate(el => el.closest('.gb2-panel').scrollTop);
        await page.keyboard.press('Enter');
        await selected(page, 'method', 'between', 'method immediate repaint');
        await page.waitForTimeout(1900);
        await selected(page, 'method', 'between', 'method after echo/settling');
        await selected(page, 'type', hostDir ? 'sd' : 'se', 'method change preserves the type');
        await focused(page, '[data-eb-method="between"]', 'RM method retains focus after host recomputation');
        assert.equal(await page.locator('[data-eb-method="between"]').evaluate(el => el.closest('.gb2-panel').scrollTop), panelScroll,
          'RM method preserves the panel scroll position across its echo'); checks++;
        if (!hostDir) {
          assert.equal(await page.evaluate(() => window.PS_SHELL.buildPayload().errorBarMethod), 'between'); checks++;
        } else {
          const echo = JSON.parse(readFileSync(path.join(hostDir, 'rm_bar_between_payload.json'), 'utf8'));
          assert.equal(echo.errorBarMethod, 'between');
          assert.equal(echo.errorBarType, 'sd');
          await page.evaluate(payload => document.querySelector('jmv-results-html').render(payload), echo);
          await selected(page, 'method', 'between', 'method after Html-result replacement');
        }
        await page.keyboard.press('Shift+Tab');
        await focused(page, '[data-eb-method="within"]', 'method choices keep their tab sequence');
        await page.keyboard.press('Space');
        await selected(page, 'method', 'within', 'method keyboard return');
        await page.waitForTimeout(1900);
        await selected(page, 'method', 'within', 'method return after echo/settling');
        // Re-activating the current choice may or may not rebuild: give a
        // rebuild time to land, then read.
        await page.locator('[data-eb-method="within"]').evaluate(el => { window.__focusOldControl = el; });
        await page.locator('[data-eb-method="within"]').click();
        await page.waitForFunction(() => !window.__focusOldControl.isConnected, null, { timeout: 1500 }).catch(() => {});
        await selected(page, 'method', 'within', 'current method clicked again');
        await selected(page, 'type', hostDir ? 'sd' : 'se', 'method return preserves the type');
      }
      assert.deepEqual(page.errors, []);
      console.log('  ok ' + fixture + ': redraw, ' + (hostDir ? 'settling' : 'delayed echo') + ', sequential choices, viewport');
    } catch (e) { failures.push(fixture + ': ' + e.message); }
    finally { if (page) await page.close(); }
  }
  if (!hostDir) {
    let page;
    try {
      page = await newPage('cg_bar');
      await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
      await page.locator('#ps-data-filter-btn').click();
      await focused(page, '[data-filter-col="0"]', 'opening filters starts at the variable');
      // Change the real select, then follow its keyboard path. The test
      // does not repair focus after the control rebuild.
      await page.locator('[data-filter-col="0"]').selectOption('Before');
      await focused(page, '[data-filter-col="0"]', 'changing a variable keeps focus');
      await page.keyboard.press('Tab');
      await focused(page, '[data-filter-op="0"]', 'Tab reaches comparison');
      await page.locator('[data-filter-op="0"]').selectOption('ge');
      await focused(page, '[data-filter-op="0"]', 'changing comparison keeps focus');
      await page.keyboard.press('Tab');
      await focused(page, '[data-filter-value="0"]', 'Tab reaches value');
      await page.locator('[data-filter-value="0"]').fill('12');
      await page.locator('[data-filter-op="0"]').focus();
      await page.locator('[data-filter-op="0"]').selectOption('nul');
      await focused(page, '[data-filter-op="0"]', 'no-value comparison keeps focus');
      assert.equal(await page.locator('[data-filter-value="0"]').isVisible(), false); checks++;
      await page.keyboard.press('Tab');
      await focused(page, '.ps-filter-remove', 'Tab skips the hidden value');
      await page.locator('#ps-filtermenu').getByText('+ Add condition', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await focused(page, '[data-filter-col="1"]', 'adding a condition focuses its variable');
      await page.locator('[aria-label="Remove filter 2"]').focus();
      await page.keyboard.press('Enter');
      await focused(page, '[data-filter-col="0"]', 'removing the focused last condition returns to the surviving condition');
      await page.keyboard.press('Escape');
      await focused(page, '#ps-data-filter-btn', 'Escape returns to the filter trigger');
      assert.deepEqual(page.errors, []);
      console.log('  ok filters: variable, comparison, hidden value, add/remove focus');
    } catch (e) { failures.push('filters: ' + e.message); }
    finally { if (page) await page.close(); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`CONTROL FOCUS PASS (${checks} checks)`);
  console.log(`ACCESSIBLE ERROR CHOICES PASS (${choiceChecks} group-state checks, DOM and browser accessibility tree)`);
} finally {
  if (evidence) writeFileSync(path.join(evidence, 'choice-accessibility.json'), JSON.stringify(choiceEvidence, null, 2) + '\n');
  await browser.close();
}
