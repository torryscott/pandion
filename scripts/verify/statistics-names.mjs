// Check every visible statistics subpanel, including result cells that open
// definitions. A glossary name must not replace the displayed statistic.
export async function checkStatisticsNames(page, label) {
    const states = [];
    const tabs = await page.locator('.gb2-panel [data-st-tab]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-st-tab')));
    for (const tab of tabs.length ? tabs : [null]) {
        if (tab) await page.locator('.gb2-panel [data-st-tab]').evaluateAll((nodes, key) => {
            nodes.find(n => n.getAttribute('data-st-tab') === key).click();
        }, tab);
        const terms = await page.locator('.gb2-panel .gb2-stterm').evaluateAll(nodes => nodes
            .filter(n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
            .map(n => ({
                text: (n.textContent || '').replace(/\s+/g, ' ').trim(),
                name: n.getAttribute('aria-label') || '',
                key: n.getAttribute('data-stterm'), result: n.classList.contains('gb2-stcellterm'),
            })));
        const state = { label, tab, terms };
        states.push(state);
        const bad = terms.filter(t => !t.text || !t.name.toLowerCase().includes(t.text.toLowerCase()));
        if (bad.length) throw new Error(label + '/' + tab + ': statistic/label missing from accessible name: ' + JSON.stringify(bad));
        state.snapshot = await page.locator('.gb2-panel').ariaSnapshot();
    }
    // Some chart-family panels have plain result tables and no definition
    // actions. Do not invent a minimum number of terms for those panels.
    return states;
}
