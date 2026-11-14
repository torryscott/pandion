// slips: six small things the review found.
// 1. The chart's spoken description said "Error bars show standard errors"
//    on histograms, box plots and median charts, which draw none.
// 2. An explanation asserted a direction for a correlation of .01
//    ("The two variables tend to rise together.", p = .944).
// 3. Automatic histogram bins on non-integer data added one bin too many,
//    holding only the largest value (8 values, 7 bins).
// 4. Dunnett's t carried the sign of treatment minus control while the row
//    and its d read left minus right (+3.02 beside d = -1.35).
// 5. A small negative value printed as "-.00".
// 6. The Correlation footnote pointed to a Check graph caveat that is only
//    shown when stars or a treatment are on.
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    // every explanation attached to the numbers of the visible pane
    const explains = page => page.evaluate(() => {
        const p = [...document.querySelectorAll('[data-st-pane]')].find(q => q.offsetParent && q.offsetHeight > 0) || document.querySelector('.gb2-panel');
        return [...p.querySelectorAll('[data-sthere]')].map(e => e.getAttribute('data-sthere'));
    });

    for (const id of ['d_small_normal', 'cg_skew_box', 'cg_skew_median']) {
        const page = await open(id);
        const a = await aria(page);
        ok(a.length > 20 && !/Error bars/.test(a), id + ': no error-bar sentence where no error bars are drawn', a);
        await page.close();
    }
    let page = await open('cg_two_equal');
    ok(/Error bars show standard errors/.test(await aria(page)), 'a bar chart of means still says what its error bars show');
    await stats(page, 'pairs');
    await choose(page, 'holm', 'dunnett');
    let p = await pane(page);
    ok(/t\(18\) = -3\.02/.test(rowOf(p, /Placebo vs Drug/).join('|')) && /d = -1\.35/.test(rowOf(p, /Placebo vs Drug/).join('|')),
        'Dunnett\'s t has the row\'s sign (-3.02 beside d = -1.35)', rowOf(p, /Placebo vs Drug/));
    await page.close();

    page = await open('xy_ushape');
    await stats(page);
    let ex = (await explains(page)).join(' || ');
    ok(/no straight-line tendency to speak of/.test(ex) && !/tend to rise together/.test(ex), 'r = .01: no direction is asserted', ex.slice(0, 260));
    await choose(page, 'pearson', 'spearman');
    p = await pane(page);
    ok(!p.rows.some(r => r.includes('-.00')) && p.rows.some(r => r.includes('.00')), 'a rank correlation of -.003 prints as .00, not -.00', p.rows);
    await page.close();
    page = await open('xy_outlier');
    await stats(page);
    ok(/tend to rise together/.test((await explains(page)).join(' ')), 'r = .89 still says which way');
    await page.close();

    page = await open('c_six_missing');
    await stats(page);
    ex = (await explains(page)).join(' || ');
    ok(/r = \.02 between v3 and v4[^|]*no consistent tendency for one to rise or fall with the other/.test(ex), 'a matrix cell of .02 asserts no direction', ex.match(/Here r = \.02[^|]*/));
    ok(/r = \.63 between v1 and v2[^|]*tends to go up too/.test(ex), 'a cell of .63 still does');
    p = await pane(page);
    ok(!/Check-graph tab's many-tests caveat/.test(p.text) && /Adjust p menu above allows for that/.test(p.text), 'the footnote points to Adjust p, not to a caveat that is not showing');
    await page.close();

    page = await open('d_small_normal');
    await stats(page, 'bins');
    p = await pane(page);
    const bins = p.rows.filter(r => / to /.test(r[0] || ''));
    ok(bins.length === 6, '8 values: six bins, not seven', bins);
    ok(/102\.812 to 107\.000/.test(bins[5][0]) && bins[5][1] === '2', 'the top bin ends at the largest value and holds it (2 values)', bins[5]);
    ok(bins.reduce((s, r) => s + Number(r[1]), 0) === 8, 'and every value is still counted');
    await page.close();
}
