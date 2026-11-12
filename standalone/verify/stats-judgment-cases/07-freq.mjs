// freq: on a two-category outcome the Pairwise tab listed "Improved: Drug vs
// Placebo" and "Not improved: Drug vs Placebo" as two tests. They are one
// (the two proportions of a pair add to 1, z differs only in sign), so Holm
// doubled the p against the chi-square on the same table: .016 there, .033
// here. The sparse 2 x 2 was told to "combine sparse categories", which it
// cannot, and no exact test was offered.
//   jamovi Contingency Tables, 30/20 against 18/32: chi-square 5.77, p = .016
//   R fisher.test: .0272 for that table; .2063 for 3/1 against 1/4 (chi-square .099)
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    const dataRows = p => p.rows.filter(r => / vs /.test(r.join(' ')));

    let page = await open('f_2x2_large');
    await stats(page, 'chisq');
    let p = await pane(page);
    ok(/Fisher's exact test: p = \.027/.test(p.notes), 'the Chi-square tab adds Fisher\'s exact test on a 2 by 2 table (R: .0272)', p.notes.slice(0, 260));
    ok(!/Heads up/.test(p.text), 'with no small-count warning on a table of 100');
    await stats(page, 'pairwise');
    p = await pane(page);
    let rows = dataRows(p);
    ok(rows.length === 1, 'the Pairwise tab lists the pair of groups once', rows);
    ok(rows[0].filter(c => c === '.016').length === 2, 'and Holm leaves its p at .016, the chi-square\'s own', rows[0]);
    ok(/1 of 1 significant/.test(p.text), 'tally: 1 of 1');
    ok(/each pair of groups is one test and is listed once/.test(p.notes), 'the footnote says why there is one row');
    ok(!/Heads up/.test(p.text), 'no small-count warning here either');
    await page.close();

    page = await open('f_2x2_small');
    await stats(page, 'chisq');
    p = await pane(page);
    ok(/Fisher's exact test: p = \.206/.test(p.notes), 'the sparse 2 by 2: Fisher\'s exact p = .206 (R: .2063)', p.notes.slice(0, 260));
    ok(/read Fisher's exact test above/.test(p.text) && !/combine sparse categories/.test(p.text), 'and the warning points to it, not to combining categories');
    await stats(page, 'pairwise');
    p = await pane(page);
    rows = dataRows(p);
    ok(rows.length === 1 && rows[0].filter(c => c === '.099').length === 2, 'one row, p .099 before and after Holm', rows);
    ok(/Heads up: some of these comparisons rest on very small counts \(the smallest expected count is 1\.8\)/.test(p.text),
        'the Pairwise tab now warns about small counts too', p.text.slice(-420));
    ok(/Fisher's exact test on the Chi-square tab/.test(await lint(page)), 'Check graph names the remedy');
    await page.close();

    page = await open('f_3x3_zero');
    await stats(page, 'chisq');
    p = await pane(page);
    ok(!/Fisher/.test(p.text) && /combine sparse categories/.test(p.text), 'a 3 by 3 table gets no Fisher line and keeps the combine advice');
    await stats(page, 'pairwise');
    p = await pane(page);
    ok(dataRows(p).length === 9, 'and still lists all 9 of its comparisons', dataRows(p).length);
    ok(/Heads up/.test(p.text), 'with the small-count warning');
    await page.close();
}
