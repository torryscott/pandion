// Runtime accessibility contract for Charts/Layouts document navigation.
//
// Pins the ARIA tab pattern, roving focus, selected state, panel
// relationships, keyboard switching, rename, and close behavior.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(500);
}
await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) window.PS_SHELL.addChart();
    await new Promise(resolve => setTimeout(resolve, 600));
});

const chartPattern = await page.evaluate(() => {
    const bar = document.getElementById('ps-tabs');
    const tablist = bar.querySelector('[role="tablist"]');
    const tabs = Array.from(bar.querySelectorAll('[role="tab"]'));
    const selected = tabs.filter(tab => tab.getAttribute('aria-selected') === 'true');
    const tabbable = tabs.filter(tab => tab.tabIndex === 0);
    const active = window.PS_SHELL.chart().id;
    const activeWrap = bar.querySelector(
        '.ps-tab[data-chart-id="' + active + '"]',
    );
    const activeTab = activeWrap && activeWrap.querySelector('[role="tab"]');
    const closeButtons = Array.from(bar.querySelectorAll('.ps-tab-x'));
    const panel = document.getElementById('psroot');
    return {
        ownerRole: bar.getAttribute('role'),
        role: tablist && tablist.getAttribute('role'),
        label: tablist && tablist.getAttribute('aria-label'),
        count: tabs.length,
        selected: selected.length,
        tabbable: tabbable.length,
        activeSelected: activeTab && activeTab.getAttribute('aria-selected'),
        activeTabIndex: activeTab && activeTab.tabIndex,
        controls: activeTab && activeTab.getAttribute('aria-controls'),
        panelRole: panel.getAttribute('role'),
        panelLabelledby: panel.getAttribute('aria-labelledby'),
        activeId: activeTab && activeTab.id,
        closeTabStops: closeButtons.filter(button => button.tabIndex === 0).length,
        nestedClose: tabs.some(tab => !!tab.querySelector('.ps-tab-x')),
    };
});
ok(chartPattern.ownerRole === 'group' &&
   chartPattern.role === 'tablist' && chartPattern.label === 'Chart documents',
   'the Charts strip is a specifically named tablist');
ok(chartPattern.count >= 4 && chartPattern.selected === 1 &&
   chartPattern.tabbable === 1 && chartPattern.activeSelected === 'true' &&
   chartPattern.activeTabIndex === 0,
   'exactly one chart tab is selected and in the tab sequence');
ok(chartPattern.controls === 'psroot' && chartPattern.panelRole === 'tabpanel' &&
   chartPattern.panelLabelledby === chartPattern.activeId,
   'the selected chart tab and chart panel reference one another');
ok(chartPattern.closeTabStops === 1 && !chartPattern.nestedClose,
   'only the active close button is tabbable and no close button is nested inside a tab');

await page.locator('#ps-tabs [role="tab"][aria-selected="true"]').focus();
const beforeLeft = await page.evaluate(() => window.PS_SHELL.chart().id);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(350);
const afterLeft = await page.evaluate(() => {
    const selected = document.querySelector('#ps-tabs [role="tab"][aria-selected="true"]');
    return {
        active: window.PS_SHELL.chart().id,
        selectedId: selected && selected.closest('.ps-tab').getAttribute('data-chart-id'),
        focused: document.activeElement === selected,
    };
});
ok(afterLeft.active !== beforeLeft && afterLeft.active === afterLeft.selectedId &&
   afterLeft.focused,
   'ArrowLeft activates, selects, and focuses the previous document');

await page.keyboard.press('Home');
await page.waitForTimeout(350);
let edge = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#ps-tabs [role="tab"]'));
    return {
        active: window.PS_SHELL.chart().id,
        first: tabs[0].closest('.ps-tab').getAttribute('data-chart-id'),
        focused: document.activeElement === tabs[0],
    };
});
ok(edge.active === edge.first && edge.focused,
   'Home activates and focuses the first document');

await page.keyboard.press('End');
await page.waitForTimeout(350);
edge = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('#ps-tabs [role="tab"]'));
    const last = tabs[tabs.length - 1];
    return {
        active: window.PS_SHELL.chart().id,
        last: last.closest('.ps-tab').getAttribute('data-chart-id'),
        focused: document.activeElement === last,
    };
});
ok(edge.active === edge.last && edge.focused,
   'End activates and focuses the last document');

await page.keyboard.press('F2');
await page.waitForTimeout(120);
const renameOpen = await page.evaluate(() => {
    const input = document.querySelector('#ps-tabs .ps-tab-rename');
    return {
        open: !!input,
        focused: document.activeElement === input,
        label: input && input.getAttribute('aria-label'),
    };
});
ok(renameOpen.open && renameOpen.focused && /^Rename document /.test(renameOpen.label),
   `F2 opens and labels the inline rename editor (${JSON.stringify(renameOpen)})`);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('Keyboard chart');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const renamed = await page.evaluate(() => {
    const tab = document.querySelector('#ps-tabs [role="tab"][aria-selected="true"]');
    return {
        name: window.PS_SHELL.chart().name,
        text: tab && tab.textContent.trim(),
        focused: document.activeElement === tab,
    };
});
ok(renamed.name === 'Keyboard chart' && renamed.text === 'Keyboard chart' &&
   renamed.focused,
   'Enter commits the rename and restores focus to the semantic tab');

const countBeforeClose = await page.locator('#ps-tabs [role="tab"]').count();
await page.keyboard.press('Tab');
const closeFocus = await page.evaluate(() =>
    document.activeElement && document.activeElement.classList.contains('ps-tab-x'));
ok(closeFocus, 'Tab from the selected tab reaches its specifically named close button');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const afterClose = await page.evaluate(() => {
    const selected = document.querySelector('#ps-tabs [role="tab"][aria-selected="true"]');
    return {
        count: document.querySelectorAll('#ps-tabs [role="tab"]').length,
        selected: !!selected,
        focused: document.activeElement === selected,
    };
});
ok(afterClose.count === countBeforeClose - 1 && afterClose.selected &&
   afterClose.focused,
   'closing the active document selects and focuses a valid replacement tab');

await page.evaluate(async () => {
    window.PS_SHELL.addLayout();
    window.PS_SHELL.addLayout();
    await new Promise(resolve => setTimeout(resolve, 500));
});
const layoutPattern = await page.evaluate(() => {
    const bar = document.getElementById('ps-tabs');
    const tablist = bar.querySelector('[role="tablist"]');
    const tabs = Array.from(bar.querySelectorAll('[role="tab"]'));
    const selected = tabs.filter(tab => tab.getAttribute('aria-selected') === 'true');
    const active = selected[0];
    const panel = document.getElementById('ps-layout');
    return {
        workspace: window.PS_SHELL.workspace(),
        label: tablist && tablist.getAttribute('aria-label'),
        count: tabs.length,
        selected: selected.length,
        controls: active && active.getAttribute('aria-controls'),
        panelLabelledby: panel.getAttribute('aria-labelledby'),
        activeId: active && active.id,
        allLayouts: Array.from(bar.querySelectorAll('.ps-tab')).every(wrapper => {
            const id = wrapper.getAttribute('data-chart-id');
            return window.PS_SHELL.charts().find(chart => chart.id === id)?.type === 'layout';
        }),
    };
});
ok(layoutPattern.workspace === 'layout' &&
   layoutPattern.label === 'Layout documents' &&
   layoutPattern.count === 2 && layoutPattern.selected === 1,
   'the Layouts workspace exposes its own filtered, named tablist');
ok(layoutPattern.controls === 'ps-layout' &&
   layoutPattern.panelLabelledby === layoutPattern.activeId &&
   layoutPattern.allLayouts,
   'layout tabs control and label the layout panel without leaking chart documents');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TAB ACCESSIBILITY CHECK PASS');
await browser.close();
