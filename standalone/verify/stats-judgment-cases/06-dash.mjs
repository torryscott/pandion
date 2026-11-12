// dash: with Correct set to None the p (adj) column shows an underlined dash.
// Clicked, it used to say "Here the raw p = .011 became p = .011 after
// adjusting for the 9 comparisons. It still clears your .05 cutoff." Nothing
// had been adjusted, and every correction the app offers puts that p above
// .05 (Bonferroni .347, Holm .270, FDR .116, Tukey .288, Games-Howell .071).
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    // the explanations of one row's p and p (adj) cells, by the row's label
    const explain = (page, re) => page.evaluate((src) => {
        const tr = [...document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]')]
            .find(t => new RegExp(src).test((t.innerText || '').replace(/\s+/g, ' ')));
        if (!tr) return null;
        const els = [...tr.querySelectorAll('[data-sthere]')];
        const pIdx = els.findIndex(e => /^(<\s*)?\.\d+$/.test((e.textContent || '').trim()));
        return { p: els[pIdx] ? els[pIdx].getAttribute('data-sthere') : '', padj: els[pIdx + 1] ? els[pIdx + 1].getAttribute('data-sthere') : '',
                 padjText: els[pIdx + 1] ? els[pIdx + 1].textContent.trim() : '' };
    }, re.source);

    let page = await open('cg_2x3_unbal');
    await stats(page, 'pairs');
    // a real click on the dash of the significant "High: F vs M" row
    const at = await page.evaluate(() => {
        const tr = [...document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]')].find(t => t.querySelector('[data-cmp-sig]'));
        const el = [...tr.querySelectorAll('[data-sthere]')].find(x => (x.textContent || '').trim() === '—');
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    ok(at, 'the dash in the p (adj) column is a clickable term');
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(500);
    // the pop-out is a body-level element the engine keeps in window.__gb2_stTermPop
    const popEl = () => { const g = window.__gb2_stTermPop; return (g && g.nodeType === 1) ? g : (g && g.el) || null; };
    const pop = await page.evaluate('(' + popEl.toString() + ')()' + ' ? (' + popEl.toString() + ')().innerText.replace(/\\s+/g, " ") : ""');
    ok(/No correction is applied, so there is no adjusted p here: each of the 9 comparisons is judged on its own/.test(pop),
        'clicked, it says no correction is applied', pop.slice(-330));
    ok(!/became/.test(pop) && !/still clears/.test(pop), 'and no longer claims the p survived an adjustment');
    await page.evaluate('(function () { var el = (' + popEl.toString() + ')(); if (el) el.click(); })()');

    await choose(page, 'holm', 'holm');
    let e = await explain(page, /F: Low vs High/);
    ok(/still clears your \.05 cutoff/.test(e.padj), 'under Holm a p that passes: "still clears"', e);
    e = await explain(page, /^\s*F vs M.*t\(38\) = 2\.14/);
    ok(e && /no longer clears your \.05 cutoff/.test(e.padj), 'a raw p below .05 that Holm lifts above it: "no longer clears" (.039 to .270)', e);
    e = await explain(page, /M: Low vs Mid/);
    ok(/did not clear your \.05 cutoff before the adjustment, and does not now/.test(e.padj), 'a raw p that never passed is not said to have lost anything', e);
    await page.close();

    page = await open('cg_two_equal');
    await stats(page, 'pairs');
    e = await explain(page, /Placebo vs Drug/);
    ok(/No correction is applied, and with one comparison none is needed/.test(e.padj), 'one comparison: no correction needed', e);
    await choose(page, 'holm', 'holm');
    e = await explain(page, /Placebo vs Drug/);
    ok(/With a correction on, significance is decided by the adjusted p/.test(e.p) && !/several pairs/.test(e.p),
        'and with one pair nothing says "several pairs were tested"', e);
    await page.close();
}
