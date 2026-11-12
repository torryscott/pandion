// lints: Check graph said "Looks good" for a correlation of .89 made by one
// point (Spearman .09, and -.21 without the point), for a clean U shape
// reported as r = .01, for groups of 2, 3 and 1 drawn as bars with error
// bars, for a mean of 59.7 beside a median of 27.1 at n = 12 (the skew rule
// needed 25 values), and for a scale whose alpha of .33 came from an item
// never reverse-scored. Five rules, thresholds first drafts:
//   one point changes r by .20 or more; a simple curve explains 25 points
//   more of the variation than the line; a group under 5 values; skewness
//   from 10 values, or the mean outside the quartiles from 8; an item whose
//   correlation with the rest is negative (jamovi: q5, -.296).
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    let page = await open('xy_outlier');
    let l = await lint(page);
    ok(/One point is doing a lot of the work/.test(l), 'r = .89 from one point is flagged', l.slice(0, 300));
    ok(/the single point at \(95, 80\) changes r from \.89 to -\.21/.test(l), 'naming the point and both values of r (R: .888 and -.209)', l.match(/Leaving out[^.]*\.[^.]*\./));
    ok(!/The pattern may be curved/.test(l), 'and the curve check stands aside');
    await page.close();

    page = await open('xy_ushape');
    l = await lint(page);
    ok(/The pattern may be curved/.test(l), 'the U shape is flagged as curved', l.slice(0, 300));
    ok(/straight line accounts for about 0 percent[^.]*a simple curve accounts for about 9\d percent/.test(l), 'with both shares (R: 0 and 98 percent)', l.match(/A straight line[^.]*\./));
    ok(!/One point is doing/.test(l), 'and no single point is blamed');
    await page.close();

    page = await open('xy_simpson_pooled');
    l = await lint(page);
    ok(!/One point is doing/.test(l) && !/may be curved/.test(l), 'an ordinary straight-line scatter passes both');
    ok(/No single point drives r/.test(l) && /A straight line fits the pattern/.test(l), 'and lists them among the checks it passed', l.slice(-500));
    await page.close();

    page = await open('cg_tiny');
    l = await lint(page);
    ok(/Very small groups/.test(l) && /a single value, so it has no error bar at all/.test(l), 'groups of 2, 3 and 1 under bars are flagged', l.slice(0, 300));
    await page.close();
    page = await open('cg_tiny', { showDataPoints: true });
    ok(!/Very small groups/.test(await lint(page)), 'and not when the values themselves are drawn');
    await page.close();

    page = await open('cg_skew_outlier');
    l = await lint(page);
    ok(/A skewed group is summarized by its mean/.test(l) && /skewness = 3\.4/.test(l), 'the outlier at n = 12 is flagged (skewness 3.40, was unchecked under 25 values)', l.slice(0, 300));
    await page.close();
    page = await open('cg_meanout');
    l = await lint(page);
    ok(/The mean sits outside the middle of its group/.test(l) && /the mean \(18\.13\) lies above three quarters of the values \(the upper quartile is 13\.25\)/.test(l),
        'eight values with one far out: the mean (18.13) is above the upper quartile (13.25)', l.slice(0, 400));
    await page.close();
    page = await open('cg_two_equal');
    l = await lint(page);
    ok(!/Very small groups|skewed group|outside the middle/.test(l), 'ordinary groups of 10 raise none of these');
    ok(/Enough values behind each mean/.test(l) && /Mean fits the data/.test(l), 'and both checks count as passed', l.slice(-400));
    await page.close();

    page = await open('l_reverse_unflipped');
    l = await lint(page);
    ok(/An item runs against the others/.test(l) && /q5 \(r = -\.30\) correlates negatively/.test(l), 'the unreversed item is named (jamovi: q5, -.296)', l.slice(0, 300));
    await stats(page, 'alpha');
    let p = await pane(page);
    ok(/Heads up: q5 \(r = -\.30\) runs against the other items/.test(p.text), 'the Reliability tab says so beside alpha', p.text.slice(0, 400));
    ok(/no item is marked reverse-scored/.test(p.notes) && !/, reverse-scored item codes/.test(p.notes), 'and its footnote no longer claims reverse scoring was applied', p.notes.slice(0, 200));
    await page.close();
    page = await open('l_reverse_unflipped', { chartSpec: JSON.stringify({ likertReverseItems: ['q5'] }) });
    l = await lint(page);
    ok(!/runs against the others/.test(l) && /Items point the same way/.test(l), 'with q5 reverse-scored the rule passes');
    await stats(page, 'alpha');
    p = await pane(page);
    ok(!/Heads up/.test(p.text) && /with the items marked \(R\) reflected/.test(p.notes), 'and the footnote says the marked items were reflected', p.notes.slice(0, 200));
    await page.close();
}
