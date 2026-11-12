// spread: pooled comparisons and the classic F assume one spread, and nothing
// said so. A plain line appears when the largest SD in a panel is more than
// twice the smallest. cg_hetero SDs 1.47 / 2.39 / 7.15; cg_two_equal 2.89 / 2.85.
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    let page = await open('cg_hetero');
    await stats(page, 'pairs');
    let p = await pane(page);
    ok(/spreads differ a lot \(SD from 1\.47 to 7\.15\)/.test(p.notes), 'Compare pairs names the two SDs', p.notes.slice(-300));
    ok(/Welch's t and Games-Howell do not/.test(p.notes), 'and names the tests that do not assume one spread');
    await stats(page, 'omnibus');
    p = await pane(page);
    ok(/spreads differ a lot \(SD from 1\.47 to 7\.15\)/.test(p.notes), 'Omnibus carries the same caution', p.notes.slice(-300));
    await page.close();
    page = await open('cg_two_equal');
    await stats(page, 'pairs');
    p = await pane(page);
    ok(!/spreads differ/.test(p.notes), 'no caution when the spreads are alike');
    await stats(page, 'omnibus');
    ok(!/spreads differ/.test((await pane(page)).notes), 'nor on its Omnibus tab');
    await page.close();
    page = await open('rm_missing');
    await stats(page, 'pairs');
    ok(!/spreads differ/.test((await pane(page)).notes), 'and never on a repeated-measures chart, whose pairs are paired');
    await page.close();
}
