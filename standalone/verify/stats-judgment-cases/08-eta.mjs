// eta: eta squared and omega squared divide by the sum of the ANOVA table's
// own rows, as jamovi's ANOVA does. They divided by the data's total sum of
// squares, which is the same thing on a one-way or a balanced design and a
// different thing when cell sizes differ (Type III rows do not add up to the
// total).
//   jamovi ANOVA, cg_2x3_unbal (cells of 3 to 12):
//     dose  eta2 .290  omega2  .254      (the app showed .22 and .19)
//     sex   eta2 .013  omega2 -.004
//     dose x sex  eta2 .080  omega2 .047 (the app showed .06 and .04)
//   partial eta squared was already equal: .320, .020, .115
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    const eff = p => ['Main effect of dose', 'Main effect of sex', 'Interaction dose'].map(n => { const r = rowOf(p, new RegExp('^' + n)); return r[r.length - 1]; });
    let page = await open('cg_2x3_unbal');
    await stats(page, 'omnibus');
    let p = await pane(page);
    ok(eff(p).join(' ') === '.29 .01 .08', 'eta squared on the unbalanced two-way design matches jamovi (.290, .013, .080)', eff(p));
    ok(await choose(page, 'eta', 'omega'), 'the effect size menu offers omega squared');
    p = await pane(page);
    ok(eff(p)[0] === '.25' && eff(p)[2] === '.05', 'omega squared matches jamovi (.254 and .047)', eff(p));
    await choose(page, 'eta', 'etaP');
    p = await pane(page);
    ok(eff(p).join(' ') === '.32 .02 .11', 'partial eta squared is unchanged (.320, .020, .115)', eff(p));
    await page.close();

    page = await open('cg_hetero');
    await stats(page, 'omnibus');
    p = await pane(page);
    ok(rowOf(p, /^Main effect of g/).includes('.14'), 'a one-way design is unchanged (.14)', rowOf(p, /^Main effect of g/));
    await page.close();
}
