// welch: a Welch's F row under the classic F on one-way designs.
//   R oneway.test(v ~ g): F = 14.715, df 2 and 33.869, p = .000025 (jamovi's
//   One-Way ANOVA prints the same); the classic F is 5.46 on 2 and 65.
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    let page = await open('cg_hetero');
    await stats(page, 'omnibus');
    let p = await pane(page);
    const w = rowOf(p, /Welch's F/);
    ok(w.length > 0, 'the Omnibus tab has a Welch\'s F row', p.rows);
    ok(w.includes('14.72') && w.includes('2, 33.87') && w.some(c => /< \.001/.test(c)), 'F 14.72 on 2 and 33.87 df, p < .001', w);
    ok(rowOf(p, /Main effect of g/).includes('5.46'), 'under the classic F, which is unchanged (5.46)');
    ok(/the classic F assumes the groups share one spread; Welch's F does not/.test(p.notes), 'and the caution points from one to the other');
    await page.close();
    page = await open('cg_two_equal');
    await stats(page, 'omnibus');
    p = await pane(page);
    // two groups: Welch's F is the square of Welch's t (-3.02 squared = 9.10)
    ok(rowOf(p, /Welch's F/).includes('9.10'), 'two groups: Welch\'s F is Welch\'s t squared (9.10)', rowOf(p, /Welch's F/));
    await page.close();
    page = await open('cg_2x3_unbal');
    await stats(page, 'omnibus');
    ok(rowOf(await pane(page), /Welch's F/).length === 0, 'no Welch row on a two-way design');
    await page.close();
    page = await open('cg_tiny');
    await stats(page, 'omnibus');
    ok(rowOf(await pane(page), /Welch's F/).length === 0, 'and none when a group has a single value');
    await page.close();
}
