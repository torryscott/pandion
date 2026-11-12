// drops: two places left data out without a word.
// 1. A repeated-measures ANOVA needs every occasion from a subject. On
//    rm_missing it used 10 of 12 people while the chart's means and the
//    Descriptives table kept all 12, and the Omnibus tab did not say so.
// 2. A group with a single value has no two-group t, so its pairs vanished
//    from the list (the pair that drove the omnibus among them). Under a
//    pooled correction they are computable, and jamovi lists them:
//      jamovi ANOVA post hoc, groups of 2, 3 and 1 (cg_tiny), df 3
//        A-B t = -2.66  p .076  Tukey .147  Bonferroni .228  Holm .091  d -2.43
//        A-C t = -5.11  p .015  Tukey .029  Bonferroni .044  Holm .044  d -6.25
//        B-C t = -3.31  p .045  Tukey .090  Bonferroni .136  Holm .091  d -3.82
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    const dataRows = p => p.rows.filter(r => / vs /.test(r.join(' ')));
    const lastP = r => r.filter(c => /^(<\s*)?\.\d+$|^1\.000$/.test(c));

    let page = await open('rm_missing');
    await stats(page, 'omnibus');
    let p = await pane(page);
    ok(/uses the 10 of 12 subjects who have a value at every occasion; 2 with a missing occasion are left out/.test(p.notes),
        'the repeated-measures omnibus says how many people it used', p.notes.slice(-320));
    await page.close();
    page = await open('rm_mixed');
    await stats(page, 'omnibus');
    ok(!/with a missing occasion/.test((await pane(page)).notes), 'and says nothing when everyone is complete');
    await page.close();

    page = await open('cg_tiny');
    await stats(page, 'pairs');
    p = await pane(page);
    ok(dataRows(p).length === 1, 'with no correction a group of one still has no test of its own (1 row)', dataRows(p));
    ok(/C has a single value, so it has no two-group test of its own and is not listed/.test(p.notes), 'and the footnote now names the group left out', p.notes.slice(-340));

    await choose(page, 'holm', 'holm');
    p = await pane(page);
    let rows = dataRows(p);
    ok(rows.length === 3, 'under Holm (Test on Auto) its pooled pairs are listed, as in jamovi', rows);
    const ac = rowOf(p, /A vs C/), ab = rowOf(p, /A vs B/), bc = rowOf(p, /B vs C/);
    ok(/t\(3\) = -5\.11/.test(ac.join('|')) && lastP(ac).join(' ') === '.015 .044', 'A vs C: t(3) = -5.11, p .015, Holm .044', ac);
    ok(lastP(ab).join(' ') === '.076 .091' && lastP(bc).join(' ') === '.045 .091', 'A vs B .076 to .091 and B vs C .045 to .091 (jamovi)', [ab, bc]);
    ok(/d = -6\.25/.test(ac.join('|')), 'with the model\'s d (-6.25)', ac);
    ok(!/has a single value/.test(p.notes), 'and no left-out note, since nothing is left out');

    await choose(page, 'holm', 'tukey');
    p = await pane(page);
    ok(lastP(rowOf(p, /A vs C/)).join(' ') === '.015 .029' && lastP(rowOf(p, /A vs B/)).join(' ') === '.076 .147' && lastP(rowOf(p, /B vs C/)).join(' ') === '.045 .090',
        'Tukey: .029, .147, .090 (jamovi)', dataRows(p));
    await choose(page, 'holm', 'bonferroni');
    p = await pane(page);
    ok(lastP(rowOf(p, /A vs C/)).join(' ') === '.015 .044' && lastP(rowOf(p, /A vs B/)).join(' ') === '.076 .228' && lastP(rowOf(p, /B vs C/)).join(' ') === '.045 .136',
        'Bonferroni: .044, .228, .136 (jamovi)', dataRows(p));
    await choose(page, 'holm', 'gamesHowell');
    p = await pane(page);
    ok(dataRows(p).length === 1 && /has a single value/.test(p.notes), 'Games-Howell runs each pair as Welch\'s t, so the group of one is left out again, and named');
    await page.close();

    page = await open('cg_two_equal');
    await stats(page, 'pairs');
    ok(!/single value/.test((await pane(page)).notes), 'no such note on ordinary groups');
    await page.close();
}
