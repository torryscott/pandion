// words: six definitions the review's reader found wrong or at odds with the
// glossary's own entry.
//   Skewness         "near zero is roughly symmetric" (zero skewness does not show symmetry)
//   Effect           "a main effect is one factor on its own" (the glossary warns against exactly that)
//   Std. residual    the plus or minus 2 rule with no caution (the glossary lists it as the misread)
//   Which test?      pretesting is "worse than either test used alone" (it sits between the two)
//   Wilcoxon         the pseudomedian sentence had its condition backwards
//   Tukey            family-wise control claimed for the repeated-measures version, which is approximate
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    // click a visible term and read its pop-out
    const term = async (page, key) => {
        const at = await page.evaluate((key) => {
            const el = [...document.querySelectorAll('[data-stterm="' + key + '"]')].find(e => e.offsetParent);
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, key);
        if (!at) return null;
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(450);
        const txt = await page.evaluate(() => { const g = window.__gb2_stTermPop; const el = (g && g.nodeType === 1) ? g : (g && g.el) || null; const t = el ? el.innerText.replace(/\s+/g, ' ') : ''; if (el) el.click(); return t; });
        await page.waitForTimeout(200);
        return txt;
    };
    const glossary = async (page, query) => {
        await page.keyboard.press('Escape'); await page.waitForTimeout(250);
        await press(page, 'button[aria-label="Help & shortcuts"]');
        await press(page, '[data-helpnav="glossary"]');
        const inp = page.locator('.gb2-panel input[type="search"], .gb2-panel input[type="text"]').first();
        await inp.fill(query);
        await page.waitForTimeout(500);
        return page.evaluate(() => ((document.querySelector('.gb2-panel') || {}).innerText || '').replace(/\s+/g, ' '));
    };

    let page = await open('d_small_normal');
    await stats(page, 'desc');
    let t = await term(page, 'skewness');
    ok(t && /does not by itself show symmetry/.test(t) && !/near zero is roughly symmetric/.test(t), 'Skewness: near zero no longer means symmetric', t);
    await page.close();

    page = await open('cg_2x3_unbal');
    await stats(page, 'omnibus');
    t = await term(page, 'omnibusEffect');
    ok(t && /averaged over the levels of the other factor, not that factor acting by itself/.test(t), 'Effect: a main effect is an average over the other factor', t);
    await page.close();

    page = await open('f_2x2_large');
    await stats(page, 'counts');
    t = await term(page, 'stdResidual');
    ok(t && /some pass 2 by chance, so treat it as a clue and not a separate test/.test(t), 'Standardized residual: the 2 rule carries its caution', t);
    let g = await glossary(page, 'Which test');
    ok(/does not hold the error rate that Welch's t holds when used every time/.test(g) && !/worse than either test used alone/.test(g), 'Which test?: the pretest sentence is corrected', g.slice(0, 500));
    g = await glossary(page, 'Tukey');
    ok(/On Repeated Measures that control is approximate/.test(g), 'Tukey: the repeated-measures control is called approximate', g.slice(0, 700));
    await page.close();

    page = await open('rm_missing');
    await stats(page, 'pairs');
    await choose(page, 'pairedT', 'wilcoxonSignedRank');
    t = await term(page, 'wilcoxonSR');
    ok(t && /Its null hypothesis is that the differences are spread symmetrically around zero/.test(t) && /it can reject even though the median or mean difference is zero/.test(t),
        'Wilcoxon: symmetric differences test the center; otherwise it can reject at a zero median', t);
    await page.close();
}
