// rule: Bonferroni, Holm and FDR follow the Test menu. Left on Auto they pool
// (jamovi's ANOVA post hoc); a test picked by hand stays that pair's own test.
// cg_hetero: SD 1.47 / 2.39 / 7.15, n 8 / 20 / 40.
//   R, each pair's own Welch t: raw .0020, .0000079, .0054; Holm .0039, .000024, .0054
//   R, each pair's own Student t: raw .0076, .0182, .0318; Holm .0228, .0365, .0365
//   jamovi ANOVA post hoc (pooled): A-B t(65) = -1.11, p .273, Holm .273, Tukey .514
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    const page = await open('cg_hetero');
    await stats(page, 'pairs');
    ok(await choose(page, 'holm', 'holm'), 'Correct offers Holm');
    let p = await pane(page);
    let ab = rowOf(p, /A vs B/);
    ok(/pooled t/.test(ab.join('|')) && ab.includes('.273'), 'Auto with Holm still pools, as jamovi does', ab);
    ok(/With Holm on and Test left on Auto/.test(p.notes) && !/With Tukey on/.test(p.notes),
        'the footnote names Holm and the Auto condition', p.notes.slice(-330));
    ok(/pick Welch's or Student's t under Test/.test(p.notes), 'and says how to keep each pair\'s own test');

    ok(await choose(page, 'welch', 'welch'), 'Test offers Welch');
    p = await pane(page); ab = rowOf(p, /A vs B/);
    ok(/Welch t/.test(ab.join('|')) && /t\(20\.91\) = -3\.54/.test(ab.join('|')), 'Welch picked by hand stays Welch under Holm', ab);
    ok(ab.includes('.002') && ab.includes('.004'), 'A vs B: raw .002, Holm .004 (R: .0020, .0039)', ab);
    const bc = rowOf(p, /B vs C/);
    ok(bc.filter(c => c === '.005').length === 2, 'B vs C: raw .005, Holm .005 (R: .0054 both)', bc);
    ok(!/pooled variance/.test(p.notes), 'no pooled footnote when nothing is pooled');

    ok(await choose(page, 'welch', 'studentT'), 'Test offers Student');
    p = await pane(page); ab = rowOf(p, /A vs B/);
    ok(/Student t/.test(ab.join('|')) && /t\(26\) = -2\.89/.test(ab.join('|')) && ab.includes('.008') && ab.includes('.023'),
        'Student picked by hand stays Student: raw .008, Holm .023 (R: .0076, .0228)', ab);

    ok(await choose(page, 'holm', 'bonferroni'), 'Correct offers Bonferroni');
    await choose(page, 'welch', 'welch');
    p = await pane(page); ab = rowOf(p, /A vs B/);
    ok(/Welch t/.test(ab.join('|')) && ab.includes('.006'), 'Welch under Bonferroni: .006 (R: .0059)', ab);

    ok(await choose(page, 'holm', 'tukey'), 'Correct offers Tukey');
    p = await pane(page); ab = rowOf(p, /A vs B/);
    ok(/pooled t/.test(ab.join('|')) && ab.includes('.514'), 'Tukey pools whatever Test says (jamovi: .514)', ab);
    ok(/With Tukey on, every row/.test(p.notes), 'and its footnote is Tukey\'s');
    await page.close();
}
