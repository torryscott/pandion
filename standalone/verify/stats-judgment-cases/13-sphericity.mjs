// sphericity: the repeated-measures Omnibus always applied the Greenhouse-
// Geisser correction, so it could not show jamovi's default row (no
// correction), and with few subjects it corrected when nothing was wrong
// (3.4% false alarms against a nominal 5 at n = 10 in a simulation). The
// Omnibus tab now carries a Sphericity choice. Automatic follows the textbook
// rule, Huynh-Feldt when the Greenhouse-Geisser epsilon is above .75 and
// Greenhouse-Geisser at .75 or below; None, Greenhouse-Geisser and
// Huynh-Feldt are the manual choices; Mauchly's test and both epsilons are
// shown; and a note says when a choice does not suit the data, and why.
//
// Every expected number is jamovi's own: jmv::anovaRM with spherTests = TRUE
// and spherCorr = c("none", "GG", "HF"), run with jamovi 2.7.32's R, on the
// sph_* fixtures. Quoted to the precision the app prints.
//
//   sph_k3     W .7766, p .02255, GG .8174, HF .8567; F = 45.95;
//              df none 2, 62 | GG 1.6348, 50.679 | HF 1.7134, 53.115
//   sph_k4     W .01599, p < .001, GG .3689, HF .3726; F = 3.098;
//              none 3, 93 p .03057 | GG 1.1068, 34.310 p .08368 |
//              HF 1.1179, 34.654 p .08322
//   sph_mixed  (13 + 19 subjects) W .7858, p .03036, GG .8236, HF .8652;
//              occasions F = 72.90, occasions x g F = 0.6105;
//              none 2, 60 p .5464 | GG 1.6472, 49.417 p .5165 |
//              HF 1.7305, 51.915 p .5241; between row F(1, 30)
//   sph_flat   W .9574, p .5206, GG .9591, HF 1; F = 6.847;
//              none and HF 2, 62 p .002057 | GG 1.9183, 59.467 p .002397
//   sph_two    two conditions: no check, F(1, 31)
export default async function ({ open, stats, pane, rowOf, ok }) {
    const card = (page) => page.evaluate(() => {
        const p = [...document.querySelectorAll('[data-st-pane]')].find(q => q.offsetParent && q.offsetHeight > 0);
        if (!p) return {};
        const txt = s => { const e = p.querySelector(s); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null; };
        const sel = p.querySelector('[data-st-act="omnispher"]');
        const note = p.querySelector('[data-role="spher-note"]');
        return { check: txt('[data-role="spher-check"]'), note: txt('[data-role="spher-note"]'),
                 state: note && note.getAttribute('data-spher-state'), sel: sel && sel.value,
                 options: sel ? [...sel.options].map(o => o.value + ':' + o.textContent) : [] };
    });
    const pick = (page, value) => page.evaluate(async (value) => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const sel = document.querySelector('[data-st-act="omnispher"]');
        if (!sel) return false;
        sel.value = value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await s(900);
        return true;
    }, value);
    const main = async (page) => rowOf(await pane(page), /^Main effect of Occasions/);
    const inter = async (page) => rowOf(await pane(page), /^Interaction/);

    // ---- a small departure: Automatic is Huynh-Feldt
    let page = await open('sph_k3');
    await stats(page, 'omnibus');
    let c = await card(page);
    ok(c.sel === 'auto' && c.options.join('|') === 'auto:Automatic|none:None|gg:Greenhouse-Geisser|hf:Huynh-Feldt',
        'the Omnibus tab offers Automatic, None, Greenhouse-Geisser and Huynh-Feldt, on Automatic', c);
    ok(c.check === "Mauchly's W = .777, p = .023. Epsilon: Greenhouse-Geisser .817, Huynh-Feldt .857.",
        "the check line is jamovi's sphericity table (W .777, p .023, epsilons .817 and .857)", c.check);
    ok((await main(page))[2] === '1.71, 53.12', 'epsilon above .75: Automatic applies Huynh-Feldt, df 1.71, 53.12', await main(page));
    ok(c.state === 'auto-hf' && /Automatic used Huynh-Feldt \(epsilon = \.857\)/.test(c.note), 'and the note says so', c.note);
    ok(/Huynh-Feldt-corrected \(eps = \.86\)\.$/.test((await pane(page)).notes), 'the footnote names the correction applied');
    await pick(page, 'gg');
    c = await card(page);
    ok((await main(page))[2] === '1.63, 50.68', 'Greenhouse-Geisser by hand: df 1.63, 50.68', await main(page));
    ok(c.state === 'gg-cautious' && /above \.75 \(\.817\), where Greenhouse-Geisser is a little too cautious\. Automatic uses Huynh-Feldt here: F\(1\.71, 53\.12\) = 45\.95, p < \.001\./.test(c.note),
        'the note says why that choice is too cautious here and what Automatic gives', c.note);
    await pick(page, 'none');
    c = await card(page);
    ok((await main(page))[2] === '2, 62', "None: the uncorrected df 2, 62, jamovi's default row", await main(page));
    ok(c.state === 'none-small' && /a little too easily here \(epsilon = \.817, Mauchly's p = \.023\)/.test(c.note), 'with a warning sized to the small departure', c.note);
    ok(/No sphericity correction is applied\.$/.test((await pane(page)).notes), 'and the footnote records that no correction is applied');
    await pick(page, 'hf');
    c = await card(page);
    ok(c.state === 'hf-same' && /Same as Automatic/.test(c.note) && (await main(page))[2] === '1.71, 53.12', 'Huynh-Feldt by hand is what Automatic picks here, and the note says so', c.note);
    // saved with the chart, kept across the re-render, and one Undo away
    await page.waitForTimeout(3500);
    let saved = await page.evaluate(() => { try { return JSON.parse(PS_SHELL.optionStore().chartSpec || '{}').rmSphericity; } catch (e) { return 'unreadable'; } });
    ok(saved === 'hf' && (await card(page)).sel === 'hf', 'the choice is saved with the chart and survives the re-render', saved);
    await pick(page, 'none');
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const b = [...document.querySelectorAll('.graphbuilder2-host button')].find(x => /^undo/i.test(x.title || x.getAttribute('aria-label') || ''));
        if (b) b.click();
        await s(900);
    });
    ok((await card(page)).sel === 'hf' && (await main(page))[2] === '1.71, 53.12', 'Undo takes the choice back one step');
    // the repeated-measures ANOVA bracket names the correction too
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.__gb2_setOption('annotationsJson', JSON.stringify([{ id: 'sphA', kind: 'bracket', x1Cat: 'a', x2Cat: 'c',
            autoPValue: true, autoPTest: 'rmAnova', autoPFormat: 'apa' }]));
        await s(3000);
    });
    const label = await page.evaluate(() => [...document.querySelectorAll('svg[data-role="gb2-chart-svg"] text')]
        .map(t => t.textContent).find(t => /F\(/.test(t)) || '');
    ok(/F\(1\.71, 53\.12\) = 45\.95, p < \.001.*Huynh-Feldt corrected$/.test(label), 'a repeated-measures ANOVA bracket shows the same df and names Huynh-Feldt', label);
    ok(page.__errors.length === 0, 'no page errors', page.__errors.slice(0, 2));
    await page.close();

    // ---- a large departure: Automatic is Greenhouse-Geisser, and None flips the verdict
    page = await open('sph_k4');
    await stats(page, 'omnibus');
    c = await card(page);
    ok(c.check === "Mauchly's W = .016, p < .001. Epsilon: Greenhouse-Geisser .369, Huynh-Feldt .373.", 'check line: W .016, p < .001, epsilons .369 and .373', c.check);
    let m = await main(page);
    ok(m[2] === '1.11, 34.31' && m[3] === '.084', 'epsilon at or below .75: Automatic applies Greenhouse-Geisser, F(1.11, 34.31), p = .084', m);
    ok(c.state === 'auto-gg' && /Automatic used Greenhouse-Geisser \(epsilon = \.369\)/.test(c.note), 'and the note says so', c.note);
    await pick(page, 'none');
    c = await card(page);
    m = await main(page);
    ok(m[2] === '3, 93' && m[3] === '.031', "None: F(3, 93), p = .031, significant where the corrected test is not", m);
    ok(c.state === 'none-large' && /reaches significance too easily here \(epsilon = \.369, Mauchly's p < \.001\)\. Automatic gives F\(1\.11, 34\.31\) = 3\.10, p = \.084\./.test(c.note),
        'the note says the uncorrected test is too easy here and gives the corrected result', c.note);
    await pick(page, 'hf');
    c = await card(page);
    m = await main(page);
    ok(m[2] === '1.12, 34.65' && m[3] === '.083', 'Huynh-Feldt by hand: F(1.12, 34.65), p = .083', m);
    ok(c.state === 'hf-generous' && /\.75 or below \(\.369\), where Huynh-Feldt corrects too little\. Automatic uses Greenhouse-Geisser here/.test(c.note), 'and the note says why it corrects too little here', c.note);
    await page.close();

    // ---- a mixed design: the within-subject rows follow the choice, the between row does not
    page = await open('sph_mixed');
    await stats(page, 'omnibus');
    c = await card(page);
    ok(c.check === "Mauchly's W = .786, p = .030. Epsilon: Greenhouse-Geisser .824, Huynh-Feldt .865.", 'mixed design check line, from the pooled within-group covariance', c.check);
    let p = await pane(page);
    ok(rowOf(p, /^Main effect of Occasions/)[2] === '1.73, 51.91' && rowOf(p, /^Interaction/)[2] === '1.73, 51.91' && rowOf(p, /^Interaction/)[3] === '.524',
        'Automatic (Huynh-Feldt): both within rows on df 1.73, 51.91, interaction p = .524', p.rows);
    ok(rowOf(p, /^Main effect of g/)[2] === '1, 30', 'the between-subjects row keeps its df 1, 30');
    await pick(page, 'none');
    ok((await inter(page))[2] === '2, 60' && (await inter(page))[3] === '.546', 'None: interaction on df 2, 60, p = .546', await inter(page));
    ok(/the within-subject rows reach significance/.test((await card(page)).note), 'the note speaks of the within-subject rows');
    await pick(page, 'gg');
    ok((await inter(page))[2] === '1.65, 49.42' && (await inter(page))[3] === '.516', 'Greenhouse-Geisser: interaction on df 1.65, 49.42, p = .516', await inter(page));
    ok(rowOf(await pane(page), /^Main effect of g/)[2] === '1, 30', 'and the between row is still 1, 30');
    await page.close();

    // ---- sphericity holds: Automatic corrects nothing and equals jamovi's default row
    page = await open('sph_flat');
    await stats(page, 'omnibus');
    c = await card(page);
    ok(c.check === "Mauchly's W = .957, p = .521. Epsilon: Greenhouse-Geisser .959, Huynh-Feldt 1.000.", 'check line: W .957, p = .521, epsilons .959 and 1.000', c.check);
    m = await main(page);
    ok(m[2] === '2, 62' && m[3] === '.002', "Automatic applies nothing: F(2, 62), p = .002, jamovi's default row", m);
    ok(c.state === 'auto-flat' && c.note === "No correction was needed: Huynh-Feldt's epsilon is 1.00.", 'and says no correction was needed', c.note);
    ok(!/corrected/.test((await pane(page)).notes), 'no footnote claims a correction');
    await pick(page, 'gg');
    c = await card(page);
    ok((await main(page))[2] === '1.92, 59.47', 'Greenhouse-Geisser by hand still corrects: df 1.92, 59.47', await main(page));
    ok(/Automatic applies no correction here: F\(2, 62\) = 6\.85, p = \.002\./.test(c.note), 'and the note gives the uncorrected result Automatic uses', c.note);
    await page.close();

    // ---- two conditions: sphericity cannot fail, so there is nothing to choose
    page = await open('sph_two');
    await stats(page, 'omnibus');
    c = await card(page);
    ok(c.sel == null && c.check == null && c.note == null, 'two conditions: no Sphericity control, check or note', c);
    ok((await main(page))[2] === '1, 31', 'and the test is F(1, 31)', await main(page));
    await page.close();
}
