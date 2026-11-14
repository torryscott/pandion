// mixed: a repeated-measures chart draws within-subject error bars by
// default, for each group's line too. On the review's mixed design they ran
// 2 to 6 times narrower than ordinary standard errors (0.35 against 2.24 at
// one occasion), so two groups looked far apart where their own test gave
// p = .076, and the Descriptives table printed that SE and a "95% CI" built
// from it beside the raw SD. The default stays; three places now say what
// the bars are.
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    let page = await open('rm_mixed');
    let a = await aria(page);
    ok(/Error bars show within-subject standard errors/.test(a), 'the spoken description names within-subject bars', a);
    ok(/cannot be used to compare the groups/.test(a), 'and on a chart with groups says what they cannot do');
    await stats(page, 'desc');
    let p = await pane(page);
    const head = (p.rows[0] || []).join(' | ');
    ok(/SE \(within\)/i.test(head) && /95% CI lower \(within\)/i.test(head) && /95% CI upper \(within\)/i.test(head),
        'Descriptives heads its SE and CI columns as within-subject', head);
    ok(rowOf(p, /mid .* Control/).includes('0.35'), 'the numbers are unchanged (mid, Control: 0.35)', rowOf(p, /mid .* Control/));
    ok(/cannot compare one group with another/.test(p.notes), 'and its footnote says what they are for');
    const l = await lint(page);
    ok(/These error bars cannot compare the groups/.test(l), 'Check graph carries the note', l.slice(0, 400));
    await page.close();

    page = await open('rm_missing');
    a = await aria(page);
    ok(/within-subject standard errors/.test(a) && !/compare the groups/.test(a), 'no groups: within-subject is named, the groups sentence is not added', a);
    ok(!/cannot compare the groups/.test(await lint(page)), 'and Check graph has no such note');
    await page.close();

    page = await open('rm_mixed', { errorBarMethod: 'between' });
    a = await aria(page);
    ok(/Error bars show standard errors/.test(a) && !/within-subject/.test(a), 'between-subjects bars are described plainly', a);
    await stats(page, 'desc');
    p = await pane(page);
    ok(!/within/i.test((p.rows[0] || []).join(' | ')), 'with plain Descriptives headers', p.rows[0]);
    ok(!/cannot compare the groups/.test(await lint(page)), 'and no Check graph note');
    await page.close();

    page = await open('cg_two_equal');
    a = await aria(page);
    ok(/Error bars show standard errors/.test(a) && !/within-subject/.test(a), 'a Compare Groups chart is untouched', a);
    await stats(page, 'desc');
    ok(!/within/i.test(((await pane(page)).rows[0] || []).join(' | ')), 'headers included');
    await page.close();
}
