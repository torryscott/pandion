// Stats-suite assertions (pairs with stats-probe.R): bracket tests +
// the Sigma Statistics panel across all 7 modules. ~240 checks.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    for (const b of [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch { }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const OUT = process.env.GB2_STATS_PROBE_OUT || '/tmp/gb2-stats-probe';
const EXP = JSON.parse(readFileSync(path.join(OUT, 'expected.json'), 'utf8'));

const browser = await chromium.launch();
let fails = 0;
function check(name, cond, detail) {
    if (cond) console.log('  ok  ' + name);
    else { console.log('  FAIL ' + name + ' :: ' + detail); fails++; }
}

async function openPage(file) {
    const ctx = await browser.newContext();   // fresh ctx: no shared localStorage
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, file));
    await page.waitForTimeout(900);
    return { ctx, page, errs };
}
async function bracketLabels(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-role="bracket-text"]'))
            .map(t => t.textContent));
}
// Click the bracket label -> inspector panel opens; read the Stats
// readout + the two dropdowns (painted at panel init on any tab).
async function openPanel(page, idx = 0) {
    // Guard: a missing bracket (slow render under load) must FAIL the
    // caller's checks, not crash the whole suite with an uncaught
    // undefined.dispatchEvent (which is how one flake aborted a run
    // and hid the remaining ~300 assertions, Jul 2026).
    const found = await page.evaluate(i => {
        const t = document.querySelectorAll('[data-role="bracket-text"]')[i];
        if (!t) return false;
        t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    }, idx);
    if (!found) {
        return { readout: null, effectValue: null, effectText: null,
                 effectDisabled: null, testValue: null,
                 testOptions: [], corrOptions: [] };
    }
    await page.waitForTimeout(700);
    return page.evaluate(() => {
        const ro = document.querySelector('[data-role="autoP-result"]');
        const te = document.querySelector('select[data-field="autoPTest"]');
        const ce = document.querySelector('select[data-field="autoPCorrection"]');
        const ee = document.querySelector('select[data-field="autoPEffect"]');
        return {
            readout: ro ? ro.textContent : null,
            effectValue: ee ? ee.value : null,
            effectText: (ee && ee.selectedIndex >= 0)
                ? ee.options[ee.selectedIndex].textContent : null,
            effectDisabled: ee ? ee.disabled : null,
            testValue: te ? te.value : null,
            testOptions: te ? Array.from(te.options).map(o => o.value) : [],
            corrOptions: ce ? Array.from(ce.options).map(o => o.value) : [],
        };
    });
}


async function openLint(page) {
    await page.evaluate(() => {
        document.querySelector('[aria-label="Help & shortcuts"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const b = document.querySelector('[data-helpnav="graphLint"]');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    return page.evaluate(() => document.body.innerText || '');
}

// ---- Case A: RM auto -> paired t ------------------------------------
{
    const { ctx, page, errs } = await openPage('a_rm_auto.html');
    console.log('case A (RM auto -> paired):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('label is paired df ' + EXP.pairedDf, labels.some(l => l.includes(EXP.pairedDf)),
          'labels=' + JSON.stringify(labels));
    check('label has dz (paired effect)', labels.some(l => l.includes('dz')),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page);
    check('readout names paired t + (auto)',
          !!p.readout && p.readout.includes('paired t') && p.readout.includes('(auto)'),
          'readout=' + JSON.stringify(p.readout));
    check('dropdown value is auto', p.testValue === 'auto', 'value=' + p.testValue);
    check('RM keeps paired options', p.testOptions.includes('pairedT') &&
          p.testOptions.includes('wilcoxonSignedRank'), JSON.stringify(p.testOptions));
    check('pure RM offers the RM-ANOVA omnibus', p.testOptions.includes('rmAnova'),
          JSON.stringify(p.testOptions));
    check('RM hides tukey + gamesHowell', !p.corrOptions.includes('tukey') &&
          !p.corrOptions.includes('gamesHowell'), JSON.stringify(p.corrOptions));
    check('effect select names the FORCED effect (dz)',
          p.effectDisabled === true && p.effectText === "Cohen's dz (paired)",
          'text=' + JSON.stringify(p.effectText) + ' disabled=' + p.effectDisabled);
    async function pickTest(v) {
        await page.evaluate(val => {
            const te = document.querySelector('select[data-field="autoPTest"]');
            te.value = val;
            te.dispatchEvent(new Event('change', { bubbles: true }));
        }, v);
        await page.waitForTimeout(400);
        return page.evaluate(() => {
            const ee = document.querySelector('select[data-field="autoPEffect"]');
            return { v: ee.value, t: ee.selectedIndex >= 0 ? ee.options[ee.selectedIndex].textContent : null, d: ee.disabled };
        });
    }
    const eW = await pickTest('welch');
    check('un-force restores the d/g choice', eW.v === 'cohensD' && eW.d === false,
          JSON.stringify(eW));
    const eM = await pickTest('mannWhitneyU');
    check('rank test forces rank-biserial r', eM.d === true && eM.t === 'Rank-biserial r',
          JSON.stringify(eM));
    await ctx.close();
}

// ---- Case B: CG persisted pairedT -> refused ------------------------
{
    const { ctx, page, errs } = await openPage('b_cg_paired_refused.html');
    console.log('case B (CG paired -> refused):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('label falls back to manual text', labels.some(l => l === 'MANUAL'),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page);
    check('readout explains within-subjects need',
          !!p.readout && p.readout.includes('Paired tests need within-subjects data'),
          'readout=' + JSON.stringify(p.readout));
    check('persisted pairedT stays visible', p.testOptions.includes('pairedT'),
          JSON.stringify(p.testOptions));
    check('wilcoxonSignedRank hidden on CG', !p.testOptions.includes('wilcoxonSignedRank'),
          JSON.stringify(p.testOptions));
    // Jul 2026 (Torry): corrections that cannot apply to THIS bracket's
    // resolved test are GONE from the dropdown - a persisted pairedT on CG
    // is exactly such a bracket, so the pooled trio must be hidden while
    // the generic corrections stay.
    check('pooled corrections hidden for a paired-test bracket (test gate)',
          !p.corrOptions.includes('tukey') && !p.corrOptions.includes('gamesHowell') &&
          !p.corrOptions.includes('dunnett') && p.corrOptions.includes('holm') &&
          p.corrOptions.includes('bonferroni') && p.corrOptions.includes('fdrBH'),
          JSON.stringify(p.corrOptions));
    await ctx.close();
}

// ---- Case C: RM + persisted Tukey -> raw p + disclosure -------------
{
    const { ctx, page, errs } = await openPage('c_rm_tukey.html');
    console.log('case C (RM + tukey -> raw + disclosed):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('paired label intact (raw p)', labels.some(l => l.includes(EXP.pairedDf)),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page);
    check('readout discloses wrong-model fallback',
          !!p.readout && p.readout.includes('wrong model for repeated'),
          'readout=' + JSON.stringify(p.readout));
    check('persisted tukey stays visible', p.corrOptions.includes('tukey'),
          JSON.stringify(p.corrOptions));
    check('gamesHowell hidden on RM', !p.corrOptions.includes('gamesHowell'),
          JSON.stringify(p.corrOptions));
    await ctx.close();
}

// ---- Case D: CG + Tukey on Welch brackets -> really corrected -------
{
    const { ctx, page, errs } = await openPage('d_cg_tukey.html');
    console.log('case D (CG tukey really corrects):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('A-B label = R ptukey ' + EXP.pAB, labels.includes(EXP.pAB),
          'labels=' + JSON.stringify(labels));
    check('A-C label = R ptukey ' + EXP.pAC, labels.includes(EXP.pAC),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout shows raw -> adjusted family line',
          !!p.readout && p.readout.includes('(raw)') && p.readout.includes('Tukey, k=3'),
          'readout=' + JSON.stringify(p.readout));
    check('anovaX offered with 3 x-levels', p.testOptions.includes('anovaX'),
          JSON.stringify(p.testOptions));
    const dtxt = await openLint(page);
    check('no note -> no pcorrnote nag',
          !dtxt.includes('does not mention the p-value correction'), 'nag fired without a note');
    await ctx.close();
}

// ---- Case G: one x-category -> omnibus options hidden ---------------
{
    const { ctx, page, errs } = await openPage('g_cg_onecat.html');
    console.log('case G (one x-level, omnibus hidden):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const p = await openPanel(page);
    check('anovaX hidden with one x-level', !p.testOptions.includes('anovaX'),
          JSON.stringify(p.testOptions));
    check('anovaGroup hidden without groups', !p.testOptions.includes('anovaGroup'),
          JSON.stringify(p.testOptions));
    await ctx.close();
}

// ---- Case E: one-tailed disclosure on labels ------------------------
{
    const { ctx, page, errs } = await openPage('e_rm_onetailed.html');
    console.log('case E (one-tailed labels):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('APA label carries one-tailed after p',
          labels.some(l => l.includes('t(7)') && l.includes('p < .001, one-tailed')),
          'labels=' + JSON.stringify(labels));
    check('asterisks label carries (one-tailed)',
          labels.some(l => /^\*{3} \(one-tailed\)$/.test(l)),
          'labels=' + JSON.stringify(labels));
    await ctx.close();
}

// ---- Case F: correction + note lacking its name -> lint fires -------
{
    const { ctx, page, errs } = await openPage('f_cg_tukey_note.html');
    console.log('case F (pcorrnote lint):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const txt = await openLint(page);
    check('pcorrnote fires', txt.includes('does not mention the p-value correction'),
          'lint text missing');
    check('suggests exact wording', txt.includes('P values are Tukey-corrected'),
          'suggested sentence missing');
    await ctx.close();
}

// ---- Case H: retired chi-square plot stays gone; Statistics remains -
{
    const { ctx, page, errs } = await openPage('h_freq_chisq_hover.html');
    console.log('case H (chi-square plot retired, Statistics preserved):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    check('saved freqShowChisq=true cannot restore the chart annotation',
          await page.locator('[data-role="freq-chisq-group"]').count() === 0);
    await page.locator('[aria-label="Add to chart"]').click();
    check('Add menu has no chi-square plot item',
          await page.locator('[data-role="add-ann-menu"] [data-kind="freqChisq"]').count() === 0);
    await page.keyboard.press('Escape');
    await page.locator('[aria-label="Statistics"]').click();
    const statState = await page.evaluate(() => ({
        chiTab: !!document.querySelector('[data-st-tab="chisq"]'),
        chiText: document.querySelector('[data-st-pane="chisq"]')?.textContent || '',
        countText: document.querySelector('[data-st-pane="counts"]')?.textContent || ''
    }));
    check('Statistics retains the chi-square results',
          statState.chiTab && /Chi-square/.test(statState.chiText), statState.chiText);
    check('Statistics retains the R-matched residual (' + EXP.resVal + ')',
          statState.countText.includes(EXP.resVal) &&
          statState.countText.includes(EXP.resWho.replace(' in ', ' · ')),
          statState.countText);
    await ctx.close();
}

// ---- Case I: freq proportion brackets --------------------------------
{
    const { ctx, page, errs } = await openPage('i_freq_prop_brackets.html');
    console.log('case I (freq proportion brackets):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('independent z + p match prop.test (' + EXP.propIndZ + ')',
          labels.some(l => l.includes(EXP.propIndZ) && l.includes(EXP.propIndP)),
          'labels=' + JSON.stringify(labels));
    check('label carries \u0394p = ' + EXP.propIndD,
          labels.some(l => l.includes('\u0394p = ' + EXP.propIndD)),
          'labels=' + JSON.stringify(labels));
    check('same-sample z + p match the multinomial formula (' + EXP.propSameZ + ')',
          labels.some(l => l.includes(EXP.propSameZ) && l.includes(EXP.propSameP)),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout names the independent variant',
          !!p.readout && p.readout.includes('proportion z-test (independent groups)'),
          'readout=' + JSON.stringify(p.readout));
    check('readout shows p1 with raw counts',
          !!p.readout && p.readout.includes('(40 of 100)'),
          'readout=' + JSON.stringify(p.readout));
    // The readout strips leading zeros for the proportion-difference CI
    // (APA: |value| <= 1), while stats-probe.R prints them via %.2f.
    const propCiApa = EXP.propIndCi.replace(/(-?)0\.(\d)/g, '$1.$2');
    check('readout CI matches prop.test ' + propCiApa,
          !!p.readout && p.readout.includes(propCiApa) &&
          p.readout.includes('diff in proportions'),
          'readout=' + JSON.stringify(p.readout));
    check('freq dropdown is propZ-only',
          p.testOptions.includes('propZ') && !p.testOptions.includes('welch') &&
          !p.testOptions.includes('anovaX'), JSON.stringify(p.testOptions));
    check('freq hides tukey + gamesHowell', !p.corrOptions.includes('tukey') &&
          !p.corrOptions.includes('gamesHowell'), JSON.stringify(p.corrOptions));
    check('effect forced to proportion difference',
          p.effectDisabled === true && p.effectText === 'Difference in proportions',
          'text=' + JSON.stringify(p.effectText));
    const p2 = await openPanel(page, 1);
    check('same-sample readout names the variant',
          !!p2.readout && p2.readout.includes('same sample'),
          'readout=' + JSON.stringify(p2.readout));
    await ctx.close();
}

// ---- Case J: pure-RM one-way RM-ANOVA (GG) ---------------------------
{
    const { ctx, page, errs } = await openPage('j_rm_anova.html');
    console.log('case J (RM-ANOVA omnibus):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('F + GG dfs match hand R (' + EXP.rmF + ')',
          labels.some(l => l.includes(EXP.rmF)), 'labels=' + JSON.stringify(labels));
    check('GG-corrected p matches (' + EXP.rmP + ')',
          labels.some(l => l.includes(EXP.rmP)), 'labels=' + JSON.stringify(labels));
    check('label carries partial eta-squared (' + EXP.rmEta + ')',
          labels.some(l => l.includes(EXP.rmEta)), 'labels=' + JSON.stringify(labels));
    check('label names Greenhouse-Geisser',
          labels.some(l => l.includes('Greenhouse-Geisser')),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page);
    check('readout names the RM-ANOVA',
          !!p.readout && p.readout.includes('One-way repeated-measures ANOVA'),
          'readout=' + JSON.stringify(p.readout));
    check('readout shows eps = ' + EXP.rmEps,
          !!p.readout && p.readout.includes('Greenhouse-Geisser eps = ' + EXP.rmEps),
          'readout=' + JSON.stringify(p.readout));
    check('readout shows n subjects / k occasions',
          !!p.readout && p.readout.includes('n = 12 subjects, k = 3 occasions'),
          'readout=' + JSON.stringify(p.readout));
    check('effect forced to partial eta-squared',
          p.effectDisabled === true && p.effectText === 'Partial eta-squared (\u03b7\u00b2p)',
          'text=' + JSON.stringify(p.effectText));
    await ctx.close();
}

// ---- Case K: mixed RM keeps the omnibus gated ------------------------
{
    const { ctx, page, errs } = await openPage('k_rm_mixed.html');
    console.log('case K (mixed RM omnibus gated):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const p = await openPanel(page);
    check('mixed RM hides every omnibus option',
          !p.testOptions.includes('rmAnova') && !p.testOptions.includes('anovaX') &&
          !p.testOptions.includes('anovaGroup'), JSON.stringify(p.testOptions));
    check('paired options still offered', p.testOptions.includes('pairedT'),
          JSON.stringify(p.testOptions));
    await ctx.close();
}

// ---- Case K2: mixed (split-plot) ANOVA in the Sigma Omnibus tab -------
// (Jul 10 2026, Torry). UNBALANCED fixture: Type III SS_occ diverges
// from aov's sequential table and GG eps sits well below 1 - expecteds
// from the independent sum-coded model-comparison reference in
// stats-probe.R.
{
    const { ctx, page, errs } = await openPage('mx_rm_omni.html');
    console.log('case K2 (Sigma mixed ANOVA, unbalanced + GG):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-st-tab]')]
            .find(x => /omnibus/i.test(x.textContent || ''));
        if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(450);
    const mx = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        const rows = [...(pane || document).querySelectorAll('tr')]
            .filter(r => r.cells && r.cells.length >= 5 && !r.querySelector('th'))
            .map(r => [...r.cells].map(c => c.textContent.trim()));
        return { rows, foot: pane ? pane.textContent : '' };
    });
    check('three effect rows (between, within, interaction)',
          mx.rows.length === 3, JSON.stringify(mx.rows.map(r => r[0])));
    const rGrp = mx.rows.find(r => /^Main effect of gg/i.test(r[0]));
    const rOcc = mx.rows.find(r => /^Main effect of Occasions/i.test(r[0]));
    const rInt = mx.rows.find(r => /^Interaction Occasions/i.test(r[0]));
    check('between row matches R (' + EXP.mxGrpF + ')',
          !!rGrp && rGrp[1] === EXP.mxGrpF && rGrp[2] === EXP.mxGrpDf &&
          rGrp[3] === EXP.mxGrpP && rGrp[4] === EXP.mxGrpEta, JSON.stringify(rGrp));
    check('within row matches R Type III + GG (' + EXP.mxOccF + ')',
          !!rOcc && rOcc[1] === EXP.mxOccF && rOcc[2] === EXP.mxOccDf &&
          rOcc[3] === EXP.mxOccP && rOcc[4] === EXP.mxOccEta, JSON.stringify(rOcc));
    check('interaction row matches R (' + EXP.mxIntF + ')',
          !!rInt && rInt[1] === EXP.mxIntF && rInt[3] === EXP.mxIntP &&
          rInt[4] === EXP.mxIntEta, JSON.stringify(rInt));
    check('foot names the mixed model + GG eps (' + EXP.mxEps + ')',
          /Mixed \(split-plot\) ANOVA/.test(mx.foot) &&
          mx.foot.includes('Greenhouse-Geisser-corrected (eps = ' + EXP.mxEps + ')'),
          mx.foot.slice(-240));
    await ctx.close();
}

// ---- Case K3: Sigma mixed-RM test menu follows comparison scope -------
{
    const { ctx, page, errs } = await openPage('k_rm_mixed.html');
    console.log('case K3 (Sigma mixed RM test scoping):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const readControls = () => page.evaluate(() => {
        const scope = document.querySelector('[data-cmp-scope]');
        const test = document.querySelector('[data-cmp-test]');
        return {
            scope: scope ? scope.value : null,
            test: test ? test.value : null,
            tests: test ? Array.from(test.options).map(o => o.value) : []
        };
    });
    const chooseScope = async value => {
        await page.evaluate(v => {
            const s = document.querySelector('[data-cmp-scope]');
            s.value = v;
            s.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await page.waitForTimeout(400);
        return readControls();
    };
    const chooseTest = async value => {
        await page.evaluate(v => {
            const t = document.querySelector('[data-cmp-test]');
            t.value = v;
            t.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
        await page.waitForTimeout(400);
    };
    const both = await readControls();
    check('Both permits only row-wise Auto', both.scope === 'both' &&
          JSON.stringify(both.tests) === JSON.stringify(['auto']), JSON.stringify(both));
    const independent = await chooseScope('withinX');
    check('between-group scope offers only independent tests',
          independent.tests.includes('welch') && independent.tests.includes('studentT') &&
          independent.tests.includes('mannWhitneyU') &&
          !independent.tests.includes('pairedT') &&
          !independent.tests.includes('wilcoxonSignedRank'), JSON.stringify(independent));
    await chooseTest('welch');
    const paired = await chooseScope('withinG');
    check('within-subject scope resets incompatible Welch to Auto',
          paired.test === 'auto', JSON.stringify(paired));
    check('within-subject scope offers only paired tests',
          paired.tests.includes('pairedT') && paired.tests.includes('wilcoxonSignedRank') &&
          !paired.tests.includes('welch') && !paired.tests.includes('studentT') &&
          !paired.tests.includes('mannWhitneyU'), JSON.stringify(paired));
    await chooseTest('pairedT');
    const mixedAgain = await chooseScope('both');
    check('returning to Both resets forced paired test to Auto',
          mixedAgain.test === 'auto' &&
          JSON.stringify(mixedAgain.tests) === JSON.stringify(['auto']),
          JSON.stringify(mixedAgain));
    await ctx.close();
}

// ---- Case L: starnote lint -------------------------------------------
{
    const { ctx, page, errs } = await openPage('l_starnote.html');
    console.log('case L (asterisk-key lint):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const txt = await openLint(page);
    check('starnote fires', txt.includes('does not define the asterisks'), 'missing');
    check('suggests the key', txt.includes('* p < .05, ** p < .01, *** p < .001'), 'missing');
    await ctx.close();
}

// ---- Case M: medmean lint ---------------------------------------------
{
    const { ctx, page, errs } = await openPage('m_medmean.html');
    console.log('case M (median/mean mismatch lint):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const txt = await openLint(page);
    check('medmean fires', txt.includes('Bracket compares means on a median chart'), 'missing');
    check('suggests Mann-Whitney', txt.includes('Mann-Whitney'), 'missing');
    await ctx.close();
}

// ---- Case N: Dunnett matches mvtnorm::pmvt ---------------------------
{
    const { ctx, page, errs } = await openPage('n_dunnett.html');
    console.log('case N (Dunnett vs control):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('Ctrl-A adjusted p = pmvt (' + EXP.dunA + ')',
          labels.includes(EXP.dunA), 'labels=' + JSON.stringify(labels));
    check('Ctrl-B adjusted p = pmvt (' + EXP.dunB + ')',
          labels.includes(EXP.dunB), 'labels=' + JSON.stringify(labels));
    check('Ctrl-C adjusted p = pmvt (' + EXP.dunC + ')',
          labels.includes(EXP.dunC), 'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout discloses Dunnett family',
          !!p.readout && p.readout.includes('(raw)') &&
          p.readout.includes('Dunnett, k=3'),
          'readout=' + JSON.stringify(p.readout));
    check('CG dropdown offers dunnett', p.corrOptions.includes('dunnett'),
          JSON.stringify(p.corrOptions));
    await ctx.close();
}

// ---- Case O: no shared control -> raw + disclosed --------------------
{
    const { ctx, page, errs } = await openPage('o_dunnett_violation.html');
    console.log('case O (Dunnett structure violation):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('A-B label keeps the raw Welch p (' + EXP.rawAB + ')',
          labels.includes(EXP.rawAB), 'labels=' + JSON.stringify(labels));
    check('Ctrl-C label keeps the raw Welch p (' + EXP.rawCC + ')',
          labels.includes(EXP.rawCC), 'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout explains the shared-control need',
          !!p.readout && p.readout.includes('ONE shared control'),
          'readout=' + JSON.stringify(p.readout));
    await ctx.close();
}

// ---- Case P: freq stats INCLUDE hidden bars --------------------------
{
    const { ctx, page, errs } = await openPage('p_freq_hidden_include.html');
    console.log('case P (freq hides = decluttering):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('bracket p UNCHANGED by the hidden bar (' + EXP.propIndZ + ')',
          labels.some(l => l.includes(EXP.propIndZ) && l.includes(EXP.propIndP)),
          'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout discloses full-data counts',
          !!p.readout && p.readout.includes('Counts INCLUDE bars hidden'),
          'readout=' + JSON.stringify(p.readout));
    const txt = await openLint(page);
    check('lint states the freq rule',
          txt.includes('INCLUDE the hidden bars'), 'missing');
    await ctx.close();
}

// ---- Case Q: CG brackets EXCLUDE hidden points -----------------------
{
    const { ctx, page, errs } = await openPage('q_cg_hidden_exclude.html');
    console.log('case Q (CG hides = excluding):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('bracket p matches R with the points excluded (' + EXP.exclP + ')',
          labels.includes(EXP.exclP), 'labels=' + JSON.stringify(labels));
    const p = await openPanel(page, 0);
    check('readout discloses the exclusion',
          !!p.readout && p.readout.includes('EXCLUDED from this'),
          'readout=' + JSON.stringify(p.readout));
    const txt = await openLint(page);
    check('lint states the cg rule',
          txt.includes('EXCLUDE the hidden data'), 'missing');
    await ctx.close();
}

// ==== Sigma stats panel — Phase 1 ======================================
async function openStats(page) {
    const has = await page.evaluate(() => {
        const b = document.querySelector('[aria-label="Statistics"]');
        if (!b) return false;
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    });
    await page.waitForTimeout(600);
    // Panes hidden by the tab system vanish from innerText — read their
    // textContent too so assertions cover every tab.
    const txt = await page.evaluate(() => {
        const panes = Array.from(document.querySelectorAll('[data-st-pane]'))
            .map(p => p.textContent).join('\n');
        return panes + '\n' + (document.body.innerText || '');
    });
    return { has, txt };
}
// No auto-check now: simulate the user ticking the significant pairs.
// Returns how many it newly ticked.
async function checkSignificant(page) {
    return page.evaluate(() => {
        let n = 0;
        document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').forEach(tr => {
            if (tr.querySelector('[data-cmp-sig]')) {
                const cb = tr.querySelector('[data-cmp-cb]');
                if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); n++; }
            }
        });
        return n;
    });
}
{
    const { ctx, page, errs } = await openPage('d_cg_tukey.html');
    console.log('case R1 (Sigma panel, Compare Groups):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    check('Sigma button exists', st.has, 'missing');
    check('descriptives card renders (full-data foot)', st.txt.includes('Full data:'), 'missing');
    // omnibus renders as a table now: "F(2, 33) = 6.60" splits into
    // F and df cells
    const cgFm = EXP.cgF.match(/F\(([^)]+)\) = ([\d.]+)/);
    check('omnibus F matches R aov (' + EXP.cgF + ')',
          st.txt.includes(cgFm[2]) && st.txt.includes(cgFm[1]), 'missing');
    await ctx.close();
}
{
    const { ctx, page } = await openPage('a_rm_auto.html');
    console.log('case R2 (Sigma panel, RM):');
    const st = await openStats(page);
    const rmFm = EXP.rmF2.match(/F\(([^)]+)\) = ([\d.]+)/);
    check('RM omnibus = paired t squared (' + EXP.rmF2 + ')',
          st.txt.includes('Main effect of Occasions') &&
          st.txt.includes(rmFm[2]) && st.txt.includes(rmFm[1]),
          'missing');
    await ctx.close();
}
{
    const { ctx, page } = await openPage('i_freq_prop_brackets.html');
    console.log('case R3 (Sigma panel, Frequencies):');
    const st = await openStats(page);
    const chiRow = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="chisq"]');
        const row = pane ? Array.from(pane.querySelectorAll('table tr')).slice(1)[0] : null;
        return row ? Array.from(row.cells).map(c => c.textContent.trim()) : [];
    });
    const chiM = EXP.fqChi.match(/\((\d+), N = (\d+)\) = ([\d.]+)/);
    check('chi-square row matches R (' + EXP.fqChi + ')',
          chiRow.includes(chiM[3]) && chiRow.includes(chiM[1]) && chiRow.includes(chiM[2]),
          JSON.stringify(chiRow));
    check('pairwise row present with prop z', st.txt.includes('Agree: F vs M'), 'missing');
    // The jamovi Pairwise table was retired (Jul 2026); the Sigma panel's
    // Pairwise tab is the sole home, so only the Copy-table action remains.
    check('copy-table action offered, Add-to-results retired',
          st.txt.includes('Copy table') &&
          !st.txt.includes('Add to results (Pairwise table)'), 'missing');
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('r_dist_stats.html');
    console.log('case R4 (Sigma panel, Distribution):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    check('skewed cell W matches R shapiro (' + EXP.dW + ')', st.txt.includes(EXP.dW), 'missing');
    check('normal cell W matches R (' + EXP.dWn + ')', st.txt.includes(EXP.dWn), 'missing');
    check('skewed verdict accurate', st.txt.includes('departure flagged, right-skewed'), 'missing');
    check('normal verdict conservative', st.txt.includes('no departure detected'), 'missing');
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('s_xy_stats.html');
    console.log('case R5 (Sigma panel, Scatter):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    check('Pearson r matches R (' + EXP.xyR + ')', st.txt.includes(EXP.xyR), 'missing');
    check('Fisher-z CI matches R (' + EXP.xyCi + ')', st.txt.includes(EXP.xyCi), 'missing');
    // The table is SCOPED to the Method select (Jul 10 2026, Torry): the
    // default Pearson view carries no Spearman column, and switching the
    // select swaps the stat pair in place (client-instant).
    const xyThs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-xystats] th'))
            .map(t => t.textContent.trim().toLowerCase()));
    check('default (Pearson) view omits the Spearman column',
          xyThs.some(h => h.includes('pearson')) &&
          xyThs.some(h => h.includes('95% ci')) &&
          !xyThs.some(h => h.includes('spearman')), JSON.stringify(xyThs));
    await page.evaluate(() => {
        const sel = document.querySelector('[data-st-act="xymethod"]');
        sel.value = 'spearman';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const xyThs2 = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-xystats] th'))
            .map(t => t.textContent.trim().toLowerCase()));
    const xyTxt2 = await page.evaluate(() =>
        (window.__gb2_statsBody && window.__gb2_statsBody.isConnected)
            ? window.__gb2_statsBody.innerText : document.body.innerText);
    check('Spearman view swaps the columns (rho in, CI out)',
          xyThs2.some(h => h.includes('spearman')) &&
          !xyThs2.some(h => h.includes('95% ci')) &&
          !xyThs2.some(h => h.includes('pearson')), JSON.stringify(xyThs2));
    check('Spearman rho matches R (' + EXP.xyRho + ')', xyTxt2.includes(EXP.xyRho), 'missing');
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('t_corr_stats.html');
    console.log('case R6 (Sigma panel, Correlation):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    const corrVal = EXP.corrStrong.replace(/^r = /, '');
    check('strongest pair named with R-matched r (' + EXP.corrStrong + ')',
          /strongest pair/i.test(st.txt) && st.txt.includes('v1') &&
          st.txt.includes(corrVal), 'missing');
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('u_likert_stats.html');
    console.log('case R7 (Sigma panel, Likert):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    const alRow = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="alpha"]');
        const row = pane ? Array.from(pane.querySelectorAll('table tr')).slice(1)[0] : null;
        return row ? Array.from(row.cells).map(c => c.textContent.trim()) : [];
    });
    check('Cronbach alpha matches hand R (' + EXP.lkAlpha + ')',
          st.txt.includes("Cronbach's") && alRow[0] === EXP.lkAlpha &&
          alRow[1] === '3' && alRow[2] === '60', JSON.stringify(alRow));
    check('alpha caveat present',
          /does not test unidimensionality or validity/i.test(st.txt) &&
          /tau-equivalence/i.test(st.txt), 'missing');
    await ctx.close();
}

// ==== Phase 2: Compare pairs + Place brackets =========================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case S1 (Compare pairs, CG):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    check('Compare pairs card renders', st.txt.includes('Compare pairs'), 'missing');
    check('raw A-B p matches R welch (' + EXP.cmpRawAB + ')',
          st.txt.includes(EXP.cmpRawAB), 'missing');
    check('raw B-C p matches R welch (' + EXP.cmpRawBC + ')',
          st.txt.includes(EXP.cmpRawBC), 'missing');
    const nChecked = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-cmp-cb]'))
            .filter(cb => cb.checked).length);
    check('no auto-check — all boxes start empty', nChecked === 0, 'checked=' + nChecked);
    const nTicked = await checkSignificant(page);
    check('user can tick the ' + EXP.cmpSig + ' significant pairs',
          nTicked === EXP.cmpSig, 'ticked=' + nTicked);
    await page.evaluate(() => {
        document.querySelector('[data-st-act="cmpplace"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    const placed = await page.evaluate(() => ({
        n: document.querySelectorAll('[data-role="bracket-text"]').length,
        labels: Array.from(document.querySelectorAll('[data-role="bracket-text"]'))
            .map(t => t.textContent),
        nan: Array.from(document.querySelectorAll('svg'))
            .some(s2 => s2.innerHTML.indexOf('NaN') >= 0)
    }));
    check('Place lays down the ticked brackets', placed.n === EXP.cmpSig,
          'n=' + placed.n + ' labels=' + JSON.stringify(placed.labels));
    check('placed labels are computed asterisks',
          placed.labels.every(l => ['*', '**', '***', 'n.s.'].indexOf(l) >= 0),
          JSON.stringify(placed.labels));
    check('no NaN in the svg after placement', !placed.nan, 'NaN found');
    await page.evaluate(() => {
        document.querySelector('[data-st-act="cmpclear"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    const afterClear = await page.evaluate(() =>
        document.querySelectorAll('[data-role="bracket-text"]').length);
    check('Clear removes the placed set', afterClear === 0, 'n=' + afterClear);
    await page.evaluate(() => {
        const sel = document.querySelector('[data-cmp-corr]');
        sel.value = 'holm';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    const holmTxt = await page.evaluate(() => document.body.innerText || '');
    check('Holm-adjusted column matches R p.adjust (' + EXP.cmpHolmAB + ')',
          holmTxt.includes(EXP.cmpHolmAB), 'missing');
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('a_rm_auto.html');
    console.log('case S2 (Compare pairs, RM):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    check('RM pair resolves paired in the table', st.txt.includes('paired t'), 'missing');
    const before = await page.evaluate(() =>
        document.querySelectorAll('[data-role="bracket-text"]').length);
    await checkSignificant(page);
    await page.evaluate(() => {
        document.querySelector('[data-st-act="cmpplace"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(800);
    const after = await page.evaluate(() =>
        document.querySelectorAll('[data-role="bracket-text"]').length);
    check('RM place adds the pair without touching the manual bracket',
          before === 1 && after === 2, 'before=' + before + ' after=' + after);
    await page.evaluate(() => {
        document.querySelector('[data-st-act="cmpclear"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    const cleared = await page.evaluate(() =>
        document.querySelectorAll('[data-role="bracket-text"]').length);
    check('RM clear keeps the manual bracket', cleared === 1, 'n=' + cleared);
    await ctx.close();
}

// ==== Place brackets ▾: bracket label styles ===========================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case S3 (bracket label styles):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const act = (sel) => page.evaluate(s2 => {
        document.querySelector(s2).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, sel);
    // menu closed by default; place uses the asterisks default
    const closed = await page.evaluate(() => {
        const m = document.querySelector('[data-cmp-stylemenu]');
        return m && m.style.display === 'none';
    });
    check('label-style menu starts closed', closed === true, 'menu open on load');
    await checkSignificant(page);
    await act('[data-st-act="cmpplace"]');
    await page.waitForTimeout(800);
    const t1 = await bracketLabels(page);
    check('default placement labels with asterisks',
          t1.length >= 1 && t1.every(t => /^[*]+$|n\.s\./.test(t.trim())),
          JSON.stringify(t1));
    // the split button's menu lists the four formats
    await act('[data-st-act="cmpstyle"]');
    await page.waitForTimeout(200);
    const menu = await page.evaluate(() => {
        const m = document.querySelector('[data-cmp-stylemenu]');
        return { open: !!(m && m.style.display !== 'none'),
                 n: m ? m.querySelectorAll('[data-cmp-style]').length : 0 };
    });
    check('the ▾ opens a four-format menu', menu.open && menu.n === 4, JSON.stringify(menu));
    // Full APA re-labels the PLACED brackets live
    await act('[data-cmp-style="apa"]');
    await page.waitForTimeout(800);
    const t2 = await bracketLabels(page);
    const menuGone = await page.evaluate(() => {
        const m = document.querySelector('[data-cmp-stylemenu]');
        return !m || m.style.display === 'none';
    });
    check('choosing Full APA re-labels placed brackets live (menu closes)',
          menuGone && t2.length === t1.length &&
          t2.every(t => /t\(/.test(t) && /p [=<]/.test(t)), JSON.stringify(t2));
    // new placements adopt the remembered style
    await act('[data-st-act="cmpclear"]');
    await page.waitForTimeout(600);
    await checkSignificant(page);
    await act('[data-st-act="cmpplace"]');
    await page.waitForTimeout(800);
    const t3 = await bracketLabels(page);
    check('new placements use the remembered style',
          t3.length >= 1 && t3.every(t => /t\(/.test(t) && /p [=<]/.test(t)),
          JSON.stringify(t3));
    await ctx.close();
}

// ==== Focus card ========================================================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case F1 (focus card):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const readCard = () => page.evaluate(() => {
        const c = document.querySelector('[data-role="st-focus-card"]');
        if (!c) return { present: false };
        const pin = document.querySelector('[data-link-pinned]');
        return { present: true,
                 // the title moved onto its own tagged line (Jul 10 2026:
                 // the header row holds the eyebrow + steppers only)
                 title: (c.querySelector('[data-st-ftitle]') || c.querySelector('span')).textContent,
                 pos: ((c.querySelector('[data-st-fpos]') || {}).textContent || '').replace(' of ', '/'),
                 sentence: (c.querySelector('[data-st-fsentence]') || {}).textContent || '',
                 prevOn: !c.querySelector('[data-st-act="ffprev"]').disabled,
                 nextOn: !c.querySelector('[data-st-act="ffnext"]').disabled,
                 inPane: (c.closest('[data-st-pane]') || {}).getAttribute
                     ? c.closest('[data-st-pane]').getAttribute('data-st-pane') : '',
                 pinTitle: pin ? pin.cells[1].textContent.trim() : '' };
    });
    // pin the first pair row -> card appears above the table
    await page.evaluate(() => {
        const row = document.querySelector('[data-st-pane="pairs"] tr[data-link]');
        row.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const c1 = await readCard();
    check('pinning a row raises the focus card with its content + APA sentence',
          c1.present && c1.inPane === 'pairs' && c1.pos === '1/3' &&
          c1.title === c1.pinTitle && /t\(/.test(c1.sentence) && /p [=<.]/.test(c1.sentence) &&
          !c1.prevOn && c1.nextOn, JSON.stringify(c1));
    // de-duplication: the displayed sentence is stats-only (no identity
    // prefix) and the chips row is absent when a sentence exists
    const dedup = await page.evaluate(() => {
        const c = document.querySelector('[data-role="st-focus-card"]');
        const sent = (c.querySelector('[data-st-fsentence]') || {}).textContent || '';
        return { noPrefix: !/ vs /.test(sent) && /^[a-zA-Z]+\(|^[UWz] /.test(sent),
                 noChips: !c.textContent.includes('Statistic') };
    });
    check('sentence displays stats-only; no duplicate chips row',
          dedup.noPrefix && dedup.noChips, JSON.stringify(dedup));
    // step forward -> pin moves, card follows, rings follow
    await page.evaluate(() => {
        document.querySelector('[data-st-act="ffnext"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const c2 = await readCard();
    const ring2 = await page.evaluate(() => {
        const g = document.querySelector('[data-role="stats-link-halo"]');
        return !!(g && g.getAttribute('data-st-state') === 'pin');
    });
    check('the stepper walks the pin (card + chart ring follow)',
          c2.present && c2.pos === '2/3' && c2.title === c2.pinTitle &&
          c2.prevOn && c2.nextOn && ring2, JSON.stringify(c2));
    // survives a tab round-trip (restore pass rebuilds it, sentence intact)
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="omnibus"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="pairs"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const c3 = await readCard();
    check('the card survives a tab round-trip with its sentence',
          c3.present && c3.pos === '2/3' && /t\(/.test(c3.sentence), JSON.stringify(c3));
    // whitespace unpin removes it
    await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="pairs"]');
        pane.querySelector('div').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const c4 = await readCard();
    check('unpinning removes the card', c4.present === false, JSON.stringify(c4));
    // descriptives: go to the desc tab (tab = mode), then cmd-click a bar
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="desc"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        const el = document.querySelector('[data-bar-cat="A"]:not([data-halo-for])');
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, metaKey: true, pointerId: 1, isPrimary: true }));
        }
    });
    await page.waitForTimeout(700);
    const c5 = await readCard();
    check('a pinned descriptives row gets a card too (values, no sentence)',
          c5.present && c5.inPane === 'desc' && c5.sentence === '' && c5.pos.length > 0,
          JSON.stringify(c5));
    await ctx.close();
}

// ==== Phase 3: on-graph stat box =======================================
async function sbClick(page, act) {
    await page.evaluate(a => {
        const b = document.querySelector('[data-st-act="' + a + '"]');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, act);
    await page.waitForTimeout(600);
    return page.evaluate(() => {
        const g = document.querySelector('[data-role="stat-box"]');
        return { n: document.querySelectorAll('[data-role="stat-box"]').length,
                 txt: g ? g.textContent : '' };
    });
}
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case T1 (CG omnibus: Show-on-chart removed):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    // "Show on chart" was removed from the omnibus tab per Torry, and the
    // Copy APA button followed in Aug 2026 (the colleague's pedagogy
    // comment: click-to-paste teaches nothing) - the omnibus card shows
    // its table + sentences with no copy affordance at all.
    const oq = await page.evaluate(() => ({
        sbomni: !!document.querySelector('[data-st-act="sbomni"]'),
        copyomni: !!document.querySelector('[data-st-act="copyomni"]')
    }));
    check('omnibus Show-on-chart button removed', oq.sbomni === false, 'sbomni still present');
    check('omnibus Copy APA button retired too', oq.copyomni === false, 'copyomni still present');
    await ctx.close();
}
{
    const { ctx, page } = await openPage('u_likert_stats.html');
    console.log('case T2 (stat box, likert alpha):');
    await openStats(page);
    // "Show on chart" is REMOVED from the Reliability tab (Jul 9 2026,
    // Torry), and the sentence Copy followed in Aug 2026 (the APA-copy
    // retirement) - the alpha table displays everything, nothing copies.
    // The alpha stat box survives for old saved charts: inject it and
    // check the LIVE-computed text.
    const btnsA = await page.evaluate(() => ({
        sbalpha: !!document.querySelector('[data-st-act="sbalpha"]'),
        copyalpha: !!document.querySelector('[data-st-act="copyalpha"]')
    }));
    check('reliability tab: no buttons remain',
          !btnsA.sbalpha && !btnsA.copyalpha, JSON.stringify(btnsA));
    await page.evaluate(() => {
        const d = window.gb2_undo.getData();
        if (!Array.isArray(d.annotations)) d.annotations = [];
        d.annotations.push({ id: 'sbA', kind: 'statBox', statContent: 'alpha',
                             x: 0, y: 0, fontSize: 11, color: '#333333', statPlate: true });
        const host = document.querySelector('.graphbuilder2-host');
        window.__gb2_lastRenderedHash = null;
        window.GraphBuilder2.render(host.id, d);
    });
    await page.waitForTimeout(600);
    const on = await page.evaluate(() => {
        const g = document.querySelector('[data-role="stat-box"]');
        return { n: document.querySelectorAll('[data-role="stat-box"]').length,
                 txt: g ? g.textContent : '' };
    });
    check('alpha box matches hand R (' + EXP.lkAlpha + ')',
          on.n === 1 && on.txt.includes(EXP.lkAlpha) && on.txt.includes('(3 items, n = 60)'),
          'txt=' + JSON.stringify(on.txt));
    await ctx.close();
}
{
    const { ctx, page } = await openPage('r_dist_stats.html');
    console.log('case T3 (stat box, dist + corr):');
    await openStats(page);
    // "Show on chart" + "Switch to the Q-Q plot" are REMOVED from the
    // Normality tab (Jul 9 2026, Torry) - only Copy table remains. The
    // normality stat box itself survives for old saved charts: inject
    // one as a persisted annotation and check its LIVE-computed text
    // still matches hand R.
    const btnsN = await page.evaluate(() => ({
        goqq: !!document.querySelector('[data-st-act="goqq"]'),
        sbnorm: !!document.querySelector('[data-st-act="sbnorm"]'),
        copynorm: !!document.querySelector('[data-st-act="copynorm"]')
    }));
    check('normality tab: only Copy table remains',
          !btnsN.goqq && !btnsN.sbnorm && btnsN.copynorm, JSON.stringify(btnsN));
    await page.evaluate(() => {
        const d = window.gb2_undo.getData();
        if (!Array.isArray(d.annotations)) d.annotations = [];
        d.annotations.push({ id: 'sbN', kind: 'statBox', statContent: 'normality',
                             x: 0, y: 0, fontSize: 11, color: '#333333', statPlate: true });
        const host = document.querySelector('.graphbuilder2-host');
        window.__gb2_lastRenderedHash = null;
        window.GraphBuilder2.render(host.id, d);
    });
    await page.waitForTimeout(600);
    const on = await page.evaluate(() => {
        const g = document.querySelector('[data-role="stat-box"]');
        return { n: document.querySelectorAll('[data-role="stat-box"]').length,
                 txt: g ? g.textContent : '' };
    });
    check('normality box carries both cells with R-matched W',
          on.n === 1 && on.txt.includes(EXP.dW) && on.txt.includes(EXP.dWn),
          'txt=' + JSON.stringify(on.txt));
    await ctx.close();
    const { ctx: ctx2, page: page2 } = await openPage('t_corr_stats.html');
    await openStats(page2);
    // "Show on chart" is REMOVED from the Matrix-summary card (Jul 9
    // 2026, Torry) - only Copy matrix remains. The corrSummary stat box
    // survives for old saved charts: inject it and check the text.
    const btnsC = await page2.evaluate(() => ({
        sbcorr: !!document.querySelector('[data-st-act="sbcorr"]'),
        copymat: !!document.querySelector('[data-st-act="copymat"]')
    }));
    check('matrix summary: only Copy matrix remains',
          !btnsC.sbcorr && btnsC.copymat, JSON.stringify(btnsC));
    await page2.evaluate(() => {
        const d = window.gb2_undo.getData();
        if (!Array.isArray(d.annotations)) d.annotations = [];
        d.annotations.push({ id: 'sbC', kind: 'statBox', statContent: 'corrSummary',
                             x: 0, y: 0, fontSize: 11, color: '#333333', statPlate: true });
        const host = document.querySelector('.graphbuilder2-host');
        window.__gb2_lastRenderedHash = null;
        window.GraphBuilder2.render(host.id, d);
    });
    await page2.waitForTimeout(600);
    const on2 = await page2.evaluate(() => {
        const g = document.querySelector('[data-role="stat-box"]');
        return { n: document.querySelectorAll('[data-role="stat-box"]').length,
                 txt: g ? g.textContent : '' };
    });
    check('corr summary box names the strongest pair',
          on2.n === 1 && on2.txt.includes('strongest: v1') && on2.txt.includes(EXP.corrStrong),
          'txt=' + JSON.stringify(on2.txt));
    await ctx2.close();
}

// ==== Tabs + table<->chart linking =====================================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case U1 (tabs + linking, CG):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const tabs = await page.evaluate(() => ({
        btns: Array.from(document.querySelectorAll('[data-st-tab]')).map(b => b.getAttribute('data-st-tab')),
        active: Array.from(document.querySelectorAll('[data-st-pane]'))
            .filter(p => p.style.display !== 'none').map(p => p.getAttribute('data-st-pane'))
    }));
    check('CG shows the three tabs', JSON.stringify(tabs.btns) === '["pairs","omnibus","desc"]',
          JSON.stringify(tabs.btns));
    check('Compare pairs opens first', JSON.stringify(tabs.active) === '["pairs"]',
          JSON.stringify(tabs.active));
    // table -> chart: hover a row -> thin dashed rings around the linked cells
    const halo = await page.evaluate(() => {
        const row = document.querySelector('tr[data-link]');
        row.dispatchEvent(new MouseEvent('mouseenter'));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const rings = g ? Array.from(g.querySelectorAll('[data-st-ring]')) : [];
        const cells = JSON.parse(row.getAttribute('data-link'));
        const covered = cells.every(([cat, grp]) => {
            const bar = Array.from(document.querySelectorAll('[data-bar-cat]'))
                .find(b => b.getAttribute('data-bar-cat') === cat &&
                           (b.getAttribute('data-bar-group') || '') === grp &&
                           !b.getAttribute('data-halo-for'));
            if (!bar) return false;
            const bb = bar.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
            return rings.some(r => {
                const rb = r.getBBox();
                return cx >= rb.x && cx <= rb.x + rb.width && cy >= rb.y && cy <= rb.y + rb.height;
            });
        });
        const thinDashed = rings.length > 0 && rings.every(r =>
            r.getAttribute('fill') === 'none' && r.getAttribute('stroke-dasharray') &&
            parseFloat(r.getAttribute('stroke-width')) < 1.5);
        const noMarch = !g || !g.querySelector('animate');
        const undimmed = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .every(b => b.style.opacity === '');
        const state = g ? g.getAttribute('data-st-state') : '';
        const n = rings.length;
        row.dispatchEvent(new MouseEvent('mouseleave'));
        const after = !!document.querySelector('[data-role="stats-link-halo"]');
        return { n, covered, thinDashed, noMarch, undimmed, state, after };
    });
    check('row hover: thin static dashed rings ring both bars (no motion, no fading)',
          halo.n === 2 && halo.covered && halo.thinDashed && halo.noMarch &&
          halo.undimmed && halo.state === 'hover', JSON.stringify(halo));
    check('leaving the row clears the rings', halo.after === false, 'ring remained');
    // chart -> table: hover a bar -> its rows outline
    const hot = await page.evaluate(() => {
        const bar = document.querySelector('[data-bar-cat="A"]');
        bar.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        const n = document.querySelectorAll('[data-link-hot]').length;
        const svgEl2 = bar.closest('svg');
        svgEl2.dispatchEvent(new MouseEvent('pointerleave'));
        const after = document.querySelectorAll('[data-link-hot]').length;
        return { n, after };
    });
    check('bar hover outlines every row mentioning it', hot.n >= 2, 'hot=' + hot.n);
    check('leaving the chart clears the outlines', hot.after === 0, 'hot=' + hot.after);
    // tab switch: descriptives pane becomes the visible one
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="desc"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const active2 = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-pane]'))
            .filter(p => p.style.display !== 'none').map(p => p.getAttribute('data-st-pane')));
    check('tab switch shows Descriptives', JSON.stringify(active2) === '["desc"]',
          JSON.stringify(active2));
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('i_freq_prop_brackets.html');
    console.log('case U2 (freq tabs + counts):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    const tabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-tab]')).map(b => b.getAttribute('data-st-tab')));
    check('freq shows chisq/pairwise/counts tabs',
          JSON.stringify(tabs) === '["chisq","pairwise","counts"]', JSON.stringify(tabs));
    check('counts tab carries the raw cells', st.txt.includes('% of panel') &&
          st.txt.includes('40') && st.txt.includes('full-data rule'), 'missing');
    // pairwise row -> adjacent dodged bars share ONE merged ring
    const halo = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[data-link]'));
        const row = rows[0];
        row.dispatchEvent(new MouseEvent('mouseenter'));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const rings = g ? Array.from(g.querySelectorAll('[data-st-ring]')) : [];
        const cells = JSON.parse(row.getAttribute('data-link'));
        const covered = cells.every(([cat, grp]) => {
            const bar = Array.from(document.querySelectorAll('[data-bar-cat]'))
                .find(b => b.getAttribute('data-bar-cat') === cat &&
                           (b.getAttribute('data-bar-group') || '') === grp &&
                           !b.getAttribute('data-halo-for'));
            if (!bar) return false;
            const bb = bar.getBBox(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
            return rings.some(r => {
                const rb = r.getBBox();
                return cx >= rb.x && cx <= rb.x + rb.width && cy >= rb.y && cy <= rb.y + rb.height;
            });
        });
        const n = rings.length;
        row.dispatchEvent(new MouseEvent('mouseleave'));
        return { n, covered };
    });
    check('freq pairwise row: adjacent pair shares ONE merged ring covering both bars',
          halo.n === 1 && halo.covered, JSON.stringify(halo));
    await ctx.close();
}
{
    const { ctx, page } = await openPage('r_dist_stats.html');
    console.log('case U3 (dist tabs):');
    const st = await openStats(page);
    const tabs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-tab]')).map(b => b.getAttribute('data-st-tab')));
    check('dist histogram shows normality/desc/frequency-table tabs',
          JSON.stringify(tabs) === '["normality","desc","bins"]', JSON.stringify(tabs));
    check('both panes carry their tables', st.txt.includes('Shapiro-Wilk') &&
          st.txt.includes('Kurtosis'), 'missing');
    // the Descriptives tab is now the ONLY home of the per-cell moments
    // (the jamovi Summary table is retired): full column set, values
    // matching R's spec formulas for the "norm" cell
    const desc = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="desc"]');
        const heads = Array.from(pane.querySelectorAll('th')).map(h => h.textContent.trim());
        const row = Array.from(pane.querySelectorAll('table tr')).slice(1)
            .find(r => r.cells[0].textContent.trim() === 'norm');
        return { heads: heads.join(','),
                 cells: row ? Array.from(row.cells).map(c => c.textContent.trim()) : [] };
    });
    check('descriptives carry the full retired-Summary column set',
          desc.heads === 'Cell,N,Mean,Median,SD,SE,Min,Max,Skew,Kurtosis',
          desc.heads);
    const expDesc = [EXP.dMean, EXP.dMed, EXP.dSd, EXP.dSe, EXP.dMin,
                     EXP.dMax, EXP.dSkew, EXP.dKurt];
    check('descriptives values match R (mean/median/sd/se/min/max/skew/kurt)',
          desc.cells.length === 10 && desc.cells[1] === '80' &&
          expDesc.every((v, i) => desc.cells[i + 2] === v),
          JSON.stringify({ got: desc.cells, want: expDesc }));
    // frequency table: low-to-high default, windowed, sortable
    // (open the tab first — hidden panes measure 0 for scroll metrics)
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="bins"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const binHeads = `(pane) => {
        const cells = Array.from(pane.querySelectorAll('th'));
        return cells.map(h => {
            const c = h.cloneNode(true);
            c.querySelectorAll('button').forEach(b => b.remove());
            return c.textContent.trim();
        });
    }`;
    const bins = await page.evaluate(hf => {
        const headsOf = eval(hf);
        const pane = document.querySelector('[data-st-pane="bins"]');
        if (!pane) return { pane: false };
        const heads = headsOf(pane);
        const ci = heads.indexOf('Count'), cu = heads.indexOf('Cumulative %'),
              ii = heads.indexOf('Interval');
        const rows = Array.from(pane.querySelectorAll('table tr')).slice(1);
        let sum = 0;
        rows.forEach(r => { sum += parseInt(r.cells[ci].textContent, 10) || 0; });
        const wrap = pane.querySelector('[data-st-scroll]');
        return { pane: true, n: rows.length, sum,
                 asc: parseFloat(rows[0].cells[ii].textContent) <
                      parseFloat(rows[1].cells[ii].textContent),
                 lastCum: rows[rows.length - 1].cells[cu].textContent.trim(),
                 windowed: !!wrap && wrap.scrollHeight > wrap.clientHeight + 2 &&
                           wrap.clientHeight <= 330,
                 sticky: getComputedStyle(pane.querySelector('th')).position === 'sticky',
                 foot: pane.textContent.includes('mirror the chart') };
    }, binHeads);
    check('frequency table: low-to-high default, windowed w/ sticky header, sums to N',
          bins.pane && bins.n >= 5 && bins.asc && bins.lastCum === '100.0' &&
          bins.sum > 0 && bins.windowed && bins.sticky && bins.foot,
          JSON.stringify(bins));
    // sort toggles: interval flips to high-to-low; count double-click = desc
    const sortChk = await page.evaluate(hf => new Promise(res => {
        const headsOf = eval(hf);
        const click = k => document.querySelector('[data-bins-sort="' + k + '"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        click('interval');
        setTimeout(() => {
            const pane = document.querySelector('[data-st-pane="bins"]');
            const heads = headsOf(pane);
            const ii = heads.indexOf('Interval'), cu = heads.indexOf('Cumulative %'),
                  ci = heads.indexOf('Count');
            const rows = Array.from(pane.querySelectorAll('table tr')).slice(1);
            const desc1 = parseFloat(rows[0].cells[ii].textContent) >
                          parseFloat(rows[1].cells[ii].textContent);
            const topCum = rows[0].cells[cu].textContent.trim();
            click('count');
            setTimeout(() => {
                click('count');
                setTimeout(() => {
                    const pane2 = document.querySelector('[data-st-pane="bins"]');
                    const rows2 = Array.from(pane2.querySelectorAll('table tr')).slice(1);
                    res({ desc1, topCum,
                          countDesc: (parseInt(rows2[0].cells[ci].textContent, 10) || 0) >=
                                     (parseInt(rows2[1].cells[ci].textContent, 10) || 0) });
                }, 250);
            }, 250);
        }, 250);
    }), binHeads);
    check('interval toggle flips high-to-low (cum 100 tops), count toggles asc/desc',
          sortChk.desc1 && sortChk.topCum === '100.0' && sortChk.countDesc,
          JSON.stringify(sortChk));
    // Copy table: a pasteable TSV of the table AS DISPLAYED
    const tsv = await page.evaluate(() => {
        const btn = document.querySelector('[data-st-act="copybins"]');
        const txt = (btn && btn.__gb2ApaFn) ? btn.__gb2ApaFn() : '';
        const lines = txt.split('\n');
        return { n: lines.length, head: lines[0] || '',
                 tabs: lines.length > 1 ? lines[1].split('\t').length : 0,
                 noAddBtn: !document.querySelector('[data-st-act="addbins"]') };
    });
    check('Copy table builds a pasteable TSV (and Add-to-results is gone)',
          tsv.n >= 6 && /Interval\tCount\t%\tCumulative %$/.test(tsv.head) &&
          tsv.tabs >= 4 && tsv.noAddBtn, JSON.stringify(tsv));
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('u4_dot.html');
    console.log('case U4 (dot chart: marker rings):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const st = await page.evaluate(() => {
        const row = document.querySelector('[data-st-pane="pairs"] tr[data-link]');
        row.dispatchEvent(new MouseEvent('mouseenter'));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const rings = g ? Array.from(g.querySelectorAll('[data-st-ring]')) : [];
        const circlesN = rings.filter(r => r.tagName === 'circle').length;
        const cells = JSON.parse(row.getAttribute('data-link'));
        // every linked marker's center must sit inside some ring circle
        const covered = cells.every(([cat, grp]) => {
            const mk = Array.from(document.querySelectorAll('[data-role="line-marker"]'))
                .find(m => {
                    const holder = m.closest('[data-bar-cat]');
                    return holder && holder.getAttribute('data-bar-cat') === cat &&
                           (holder.getAttribute('data-bar-group') || '') === grp;
                });
            if (!mk) return false;
            const b = mk.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
            return rings.some(r => {
                if (r.tagName !== 'circle') return false;
                const dx = cx - parseFloat(r.getAttribute('cx'));
                const dy = cy - parseFloat(r.getAttribute('cy'));
                return Math.sqrt(dx * dx + dy * dy) <= parseFloat(r.getAttribute('r')) + 0.5;
            });
        });
        row.dispatchEvent(new MouseEvent('mouseleave'));
        return { nRings: rings.length, circlesN, covered };
    });
    check('dot-chart rings are CIRCLES around the markers, covering both',
          st.nRings > 0 && st.circlesN === st.nRings && st.covered, JSON.stringify(st));
    const pin = await page.evaluate(() => {
        const row = document.querySelector('[data-st-pane="pairs"] tr[data-link]');
        row.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const marching = !!(g && g.querySelector('circle[data-st-ring] animate'));
        row.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return marching;
    });
    check('pinned dot ring marches', pin === true, 'no animate on pinned circle');
    await ctx.close();
}

// ==== Two-way omnibus (Type III) + effects + SEM =======================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case V1 (two-way ANOVA + effects + SEM):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const st = await openStats(page);
    // the omnibus renders as a TABLE: read the row cells rather than
    // the retired sentence strings
    const omniRow = (name) => page.evaluate(nm => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        const row = Array.from(pane.querySelectorAll('table tr')).slice(1)
            .find(r => r.cells[0].textContent.indexOf(nm) === 0);
        return row ? Array.from(row.cells).map(c => c.textContent.trim()) : [];
    }, name);
    const fdf = (str) => { const m = str.match(/F\(([^)]+)\) = ([\d.]+)/);
                           return { df: m[1], F: m[2] }; };
    const rA = await omniRow('Main effect of x'), eA = fdf(EXP.twA);
    check('main effect A matches R Type III (' + EXP.twA + ')',
          rA[1] === eA.F && rA[2] === eA.df, JSON.stringify(rA));
    const rB = await omniRow('Main effect of g'), eB = fdf(EXP.twB);
    check('main effect B matches R Type III (' + EXP.twB + ')',
          rB[1] === eB.F && rB[2] === eB.df, JSON.stringify(rB));
    const rAB = await omniRow('Interaction x × g'), eAB = fdf(EXP.twAB);
    check('INTERACTION matches R Type III (' + EXP.twAB + ')',
          rAB[1] === eAB.F && rAB[2] === eAB.df, JSON.stringify(rAB));
    const hdr = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        return Array.from(pane.querySelectorAll('th')).map(h => h.textContent.trim());
    });
    check('default eta² on the interaction (' + EXP.etaAB + ')',
          hdr[4] === 'η²' && rAB[4] === EXP.etaAB,
          JSON.stringify({ hdr, rAB }));
    async function pickEff(v) {
        await page.evaluate(val => {
            const sel = document.querySelector('[data-st-act="omnieff"]');
            sel.value = val;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }, v);
        await page.waitForTimeout(500);
    }
    await pickEff('omega');
    const rO = await omniRow('Interaction x × g');
    check('omega² matches R (' + EXP.omegaAB + ')',
          rO[4] === EXP.omegaAB, JSON.stringify(rO));
    await pickEff('etaP');
    const rP = await omniRow('Interaction x × g');
    check('partial eta² matches R (' + EXP.etaPAB + ')',
          rP[4] === EXP.etaPAB, JSON.stringify(rP));
    const tEtaP = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-st-pane]'))
            .map(p => p.textContent).join('\n'));
    check('descriptives carry SEM (' + EXP.semAF + ')',
          tEtaP.includes('SE') && tEtaP.includes(EXP.semAF), 'missing');
    await ctx.close();
}

// ==== Click-to-pin linking =============================================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case W1 (click-to-pin):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const pin1 = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-link]');
        rows[0].cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        return { halo: !!g,
                 pinState: g ? g.getAttribute('data-st-state') === 'pin' : false,
                 marching: !!(g && g.querySelector('[data-st-ring] animate')),
                 heavier: !!(g && parseFloat(g.querySelector('[data-st-ring]')
                     .getAttribute('stroke-width')) > 1.5),
                 pinned: document.querySelectorAll('[data-link-pinned]').length };
    });
    check('row click pins: marching-ants ring (animated, heavier dash)',
          pin1.halo && pin1.pinState && pin1.marching && pin1.heavier && pin1.pinned === 1,
          JSON.stringify(pin1));
    const persist = await page.evaluate(() => {
        const row = document.querySelector('tr[data-link]');
        row.dispatchEvent(new MouseEvent('mouseleave'));
        return !!document.querySelector('[data-role="stats-link-halo"]');
    });
    check('pin survives leaving the row', persist === true, 'halo gone');
    const hoverMix = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-link]');
        rows[1].dispatchEvent(new MouseEvent('mouseenter'));
        // hover preview = static thin ring, no animation
        const gH = document.querySelector('[data-role="stats-link-halo"]');
        const hoverNow = !!(gH && gH.getAttribute('data-st-state') === 'hover' &&
            !gH.querySelector('animate'));
        rows[1].dispatchEvent(new MouseEvent('mouseleave'));
        const gP = document.querySelector('[data-role="stats-link-halo"]');
        const pinBack = !!(gP && gP.getAttribute('data-st-state') === 'pin' &&
            gP.querySelector('animate'));
        return { hoverNow, pinBack };
    });
    check('hovering another row previews a static ring, then the marching pin returns',
          hoverMix.hoverNow && hoverMix.pinBack, JSON.stringify(hoverMix));
    const moved = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-link]');
        rows[1].cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const pinnedRows = document.querySelectorAll('[data-link-pinned]');
        return { n: pinnedRows.length,
                 isSecond: pinnedRows.length === 1 && pinnedRows[0] === rows[1] };
    });
    check('clicking another row moves the pin', moved.n === 1 && moved.isSecond,
          JSON.stringify(moved));
    const unpin = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-link]');
        rows[1].cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        rows[1].dispatchEvent(new MouseEvent('mouseleave'));
        return { pinned: document.querySelectorAll('[data-link-pinned]').length,
                 halo: !!document.querySelector('[data-role="stats-link-halo"]') };
    });
    check('re-click unpins and leave clears', unpin.pinned === 0 && unpin.halo === false,
          JSON.stringify(unpin));
    const cbStill = await page.evaluate(() => {
        const cb = document.querySelector('[data-cmp-cb]');
        const before = cb.checked;
        cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { toggled: cb.checked !== before,
                 pinned: document.querySelectorAll('[data-link-pinned]').length };
    });
    check('checkbox clicks never pin', cbStill.pinned === 0, JSON.stringify(cbStill));
    await ctx.close();
}

// ==== Row chrome polish (tints, not boxes) =============================
{
    const { ctx, page, errs } = await openPage('v_cmp_place.html');
    console.log('case W2 (row tint states):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const st = await page.evaluate(() => {
        const rows = document.querySelectorAll('tr[data-link]');
        const r0 = rows[0];
        const out = { cursor: r0.style.cursor, title: r0.title,
                      baseBg: r0.style.background };
        r0.dispatchEvent(new MouseEvent('mouseenter'));
        out.hoverBg = r0.style.background;
        r0.dispatchEvent(new MouseEvent('mouseleave'));
        out.afterBg = r0.style.background;
        r0.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        out.pinShadow = r0.style.boxShadow;
        out.pinBg = r0.style.background;
        out.noOutline = !r0.style.outline;
        r0.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        r0.dispatchEvent(new MouseEvent('mouseleave'));
        out.clearedShadow = r0.style.boxShadow;
        return out;
    });
    check('rows read as clickable (cursor + hint)',
          st.cursor === 'pointer' && st.title.indexOf('pin') >= 0, JSON.stringify(st));
    check('hover tints the row and leave restores the base shade',
          st.hoverBg.length > 0 && st.hoverBg !== st.baseBg &&
          st.afterBg === st.baseBg, JSON.stringify(st));
    check('pin = soft fill + left accent, no boxy outline',
          st.pinShadow.indexOf('inset') >= 0 && st.pinBg.length > 0 && st.noOutline,
          JSON.stringify(st));
    check('unpin clears the accent', st.clearedShadow === '', JSON.stringify(st));
    // bar hover -> tint (not outline) on matching rows
    const hot = await page.evaluate(() => {
        const bar = document.querySelector('[data-bar-cat="A"]');
        bar.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        const hotRows = Array.from(document.querySelectorAll('[data-link-hot]'));
        return { n: hotRows.length,
                 tinted: hotRows.every(r => r.style.background.length > 0),
                 noOutline: hotRows.every(r => !r.style.outline) };
    });
    check('bar hover tints matching rows without outlines',
          hot.n >= 2 && hot.tinted && hot.noOutline, JSON.stringify(hot));
    await ctx.close();
}

// ==== Compare-pairs scoping + sections + sort ==========================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case X1 (scoped families, 3x2 grouped):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const st1 = await page.evaluate(() => ({
        rows: document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').length,
        headers: Array.from(document.querySelectorAll('[data-st-pane="pairs"] td[colspan]'))
            .map(td => td.textContent),
        summary: (((document.querySelector('[data-cmp-tally]')||{}).textContent||'').match(/\d+ of \d+ significant at/) || [''])[0],
        hasScope: !!document.querySelector('[data-cmp-scope]')
    }));
    check('default scope lists 9 of 15 (diagonals dropped)', st1.rows === 9,
          'rows=' + st1.rows);
    // significance = green chip on the deciding p cell, not a row wash
    const chip = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="pairs"]');
        const chips = Array.from(pane.querySelectorAll('[data-cmp-sig]'));
        const sigN = parseInt((((document.querySelector('[data-cmp-tally]') || {}).textContent || '')
            .match(/(\d+) of \d+ significant at/) || [0, 0])[1], 10);
        // with Correct = None the chip sits in the raw-p column (5th td)
        const inPCol = chips.every(c => {
            const td = c.closest('td'), tr = c.closest('tr');
            return td && tr && Array.prototype.indexOf.call(tr.cells, td) === 4;
        });
        const noRowWash = !pane.querySelector('tr[style*="f4f8ee"]');
        return { nChips: chips.length, sigN, inPCol, noRowWash };
    });
    check('green chips mark exactly the significant p values (no row wash)',
          chip.nChips === chip.sigN && chip.nChips > 0 && chip.inPCol && chip.noRowWash,
          JSON.stringify(chip));
    check('section headers name the families',
          st1.headers.some(h => h.indexOf('Within A') >= 0) &&
          st1.headers.some(h => h.indexOf('Across') >= 0),
          JSON.stringify(st1.headers));
    check('summary line counts significance', /^\d+ of 9 /.test(st1.summary), st1.summary);
    // The footnote that disclosed the dropped diagonals was removed per
    // Torry; the Compare control (default "Both" -> "Every pair") is how a
    // user restores them, and the 9-of-15 row count above proves the drop.
    check('Compare control offers Every pair (to restore diagonals)', st1.hasScope, JSON.stringify(st1));
    async function setSel(attr, v) {
        await page.evaluate(([a, val]) => {
            const sel = document.querySelector('[' + a + ']');
            sel.value = val;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }, [attr, v]);
        await page.waitForTimeout(500);
    }
    await setSel('data-cmp-scope', 'all');
    const nAll = await page.evaluate(() => document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').length);
    check('Every pair restores all 15', nAll === 15, 'rows=' + nAll);
    await setSel('data-cmp-scope', 'withinX');
    const nWx = await page.evaluate(() => document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').length);
    check('group-within-category scope lists 3', nWx === 3, 'rows=' + nWx);
    await setSel('data-cmp-scope', 'all');
    // sort now lives in the column headers: two small toggles
    const hdrBtns = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[data-cmp-sorthdr]'));
        const chartOn = document.querySelector('[data-cmp-sorthdr="chart"]');
        return { keys: btns.map(b => b.getAttribute('data-cmp-sorthdr')).sort().join(','),
                 activeIsChart: chartOn && chartOn.getAttribute('aria-pressed') === 'true',
                 inHeaders: btns.every(b => b.closest('th') !== null) };
    });
    check('header sort toggles exist (chart + p), chart active by default',
          hdrBtns.keys === 'chart,p' && hdrBtns.activeIsChart && hdrBtns.inHeaders,
          JSON.stringify(hdrBtns));
    await page.evaluate(() => {
        document.querySelector('[data-cmp-sorthdr="p"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const pNowOn = await page.evaluate(() =>
        document.querySelector('[data-cmp-sorthdr="p"]').getAttribute('aria-pressed'));
    check('clicking the p toggle activates it', pNowOn === 'true', 'aria-pressed=' + pNowOn);
    const sorted = await page.evaluate(() => {
        // walk the "Across" section: p column (5th td) must be non-decreasing
        const rows = Array.from(document.querySelectorAll('[data-st-pane="pairs"] table tr'));
        let inAcross = false; const ps = [];
        for (const r of rows) {
            const cs = r.cells;
            if (cs.length === 1 && cs[0].hasAttribute('colspan')) {
                inAcross = cs[0].textContent.indexOf('Across') >= 0;
                continue;
            }
            if (inAcross && r.hasAttribute('data-link')) {
                const t = cs[4].textContent.replace('<', '').trim();
                ps.push(parseFloat(t) || 0.0005);
            }
        }
        return { ps, ok: ps.every((v, i) => i === 0 || v >= ps[i - 1]) };
    });
    check('by-p sorting orders within the section', sorted.ps.length === 6 && sorted.ok,
          JSON.stringify(sorted));
    await ctx.close();
}
{
    const { ctx, page } = await openPage('v_cmp_place.html');
    console.log('case X2 (ungrouped stays flat):');
    await openStats(page);
    const st = await page.evaluate(() => ({
        rows: document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').length,
        scope: !!document.querySelector('[data-cmp-scope]'),
        headers: document.querySelectorAll('[data-st-pane="pairs"] td[colspan]').length
    }));
    check('one factor: 3 rows, no Compare control, no headers',
          st.rows === 3 && !st.scope && st.headers === 0, JSON.stringify(st));
    await ctx.close();
}

// ==== Collapsible sections =============================================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case X3 (collapsible sections):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const hdrs = await page.evaluate(() => {
        const hs = Array.from(document.querySelectorAll('[data-st-pane="pairs"] [data-cmp-fold]'));
        return { n: hs.length,
                 chev: hs.every(h => !!h.querySelector('[data-cmp-chev]')),
                 summary: hs.every(h => / of \d+ significant/.test(h.textContent)) };
    });
    check('section headers carry chevrons + per-section tallies',
          hdrs.n >= 3 && hdrs.chev && hdrs.summary, JSON.stringify(hdrs));
    // fold "Within B": its rows hide, global tally + footnote disclose
    const fold = await page.evaluate(() => {
        const hdr = Array.from(document.querySelectorAll('[data-cmp-fold]'))
            .find(h => h.textContent.indexOf('WITHIN B') >= 0 ||
                       h.textContent.indexOf('Within B') >= 0);
        const key = hdr.getAttribute('data-cmp-fold');
        hdr.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return key;
    });
    await page.waitForTimeout(400);
    const folded = await page.evaluate(k => {
        const rows = Array.from(document.querySelectorAll('tr[data-cmp-sec="' + k + '"]'));
        const pane = document.querySelector('[data-st-pane="pairs"]');
        return { n: rows.length,
                 hidden: rows.every(r => r.style.display === 'none'),
                 tally: (((document.querySelector('[data-cmp-tally]') || {}).textContent || '').match(/(\d+ of \d+) significant at/) || [])[1],
                 stillPinnedRows: document.querySelectorAll('[data-link-pinned]').length };
    }, fold);
    // (The "Folded sections still count" disclosure lived in the verbose
    // compare-pairs footnote, which was removed per Torry; the invariant that
    // matters -- the global tally still reflects the FULL pair set -- stays.)
    check('folding hides the rows and keeps the global tally',
          folded.n >= 1 && folded.hidden && folded.tally === '5 of 9',
          JSON.stringify(folded));
    // a new pin inside the folded section auto-expands it (plain clicks,
    // sticky mode: B:F then B:M = Within B)
    const plainClick2 = (sel) => page.evaluate(s2 => {
        const el = document.querySelector(s2);
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, pointerId: 1, isPrimary: true }));
        }
    }, sel);
    await plainClick2('[data-bar-cat="B"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(250);
    await plainClick2('[data-bar-cat="B"][data-bar-group="M"]:not([data-halo-for])');
    await page.waitForTimeout(500);
    const autoEx = await page.evaluate(k => {
        const rows = Array.from(document.querySelectorAll('tr[data-cmp-sec="' + k + '"]'));
        const pin = document.querySelector('[data-link-pinned]');
        return { visible: rows.length > 0 && rows.every(r => r.style.display !== 'none'),
                 pinInSec: !!(pin && pin.getAttribute('data-cmp-sec') === k) };
    }, fold);
    check('a new pin inside a folded section auto-expands it',
          autoEx.visible && autoEx.pinInSec, JSON.stringify(autoEx));
    // fold state survives a re-render (sort toggle)
    await page.evaluate(() => {
        const hdr = Array.from(document.querySelectorAll('[data-cmp-fold]'))
            .find(h => /WITHIN A|Within A/.test(h.textContent));
        hdr.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        document.querySelector('[data-cmp-sorthdr="p"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const persist = await page.evaluate(() => {
        const hdr = Array.from(document.querySelectorAll('[data-cmp-fold]'))
            .find(h => /WITHIN A|Within A/.test(h.textContent));
        const k = hdr.getAttribute('data-cmp-fold');
        const rows = Array.from(document.querySelectorAll('tr[data-cmp-sec="' + k + '"]'));
        return rows.length > 0 && rows.every(r => r.style.display === 'none');
    });
    check('fold state survives a panel re-render', persist === true, 'unfolded');
    await ctx.close();
}

// ==== Panel width + click-off unpin + controls band ====================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case Y1 (width + unpin + controls):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    // width: no table may be horizontally clipped in the pairs pane
    const wfit = await page.evaluate(() => {
        const tbls = Array.from(document.querySelectorAll('[data-st-pane="pairs"] table'));
        return tbls.every(t => t.clientWidth >= t.scrollWidth - 1);
    });
    check('panel grows so tables fit unclipped', wfit === true, 'table clipped');
    const noNote = await page.evaluate(() => !document.querySelector('[data-role="st-clip-note"]'));
    check('no clip note when the table fits', noNote === true, 'false clip note shown');
    // controls band: glued label+select units inside one container
    const band = await page.evaluate(() => {
        const sel = document.querySelector('[data-cmp-scope]');
        const unit = sel.parentElement;
        const bandEl = unit.parentElement;
        const tops = Array.from(bandEl.children).map(c => c.offsetTop);
        return { glued: unit.style.whiteSpace === 'nowrap',
                 units: bandEl.querySelectorAll('select').length,
                 // centered children of differing heights get slightly
                 // different offsetTops even on ONE flex row
                 oneRow: Math.max(...tops) - Math.min(...tops) < 12,
                 noOrderSel: !document.querySelector('[data-cmp-sort]'),
                 hdrBtns: document.querySelectorAll('[data-cmp-sorthdr]').length };
    });
    check('band = four glued dropdowns (Compare/Test/Correct/Alpha) on one row; sort moved to headers',
          band.glued && band.units === 4 && band.oneRow &&
          band.noOrderSel && band.hdrBtns === 2,
          JSON.stringify(band));
    // click-off in panel whitespace unpins
    const off = await page.evaluate(() => {
        const row = document.querySelector('[data-st-pane="pairs"] tr[data-link]');
        row.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const pinned = document.querySelectorAll('[data-link-pinned]').length;
        // click the summary line (panel whitespace, not a row/control)
        const pane = document.querySelector('[data-st-pane="pairs"]');
        const summary = pane.querySelector('div');
        summary.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { pinned,
                 after: document.querySelectorAll('[data-link-pinned]').length,
                 halo: !!document.querySelector('[data-role="stats-link-halo"]') };
    });
    check('click-off in whitespace unpins and clears the halo',
          off.pinned === 1 && off.after === 0 && off.halo === false,
          JSON.stringify(off));
    // width returns to chart when the panel switches away
    const shrunk = await page.evaluate(() => new Promise(res => {
        // outermost ancestor with an inline pixel width = inspectorPanel
        let el = document.querySelector('[data-st-pane="pairs"]'), before = null;
        while (el) {
            if (el.style && /px$/.test(el.style.width || '')) before = el;
            el = el.parentElement;
        }
        const w1 = parseFloat(before.style.width);
        document.querySelector('[aria-label="Statistics"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));   // toggle closed
        requestAnimationFrame(() => requestAnimationFrame(() =>
            res({ w1, w2: parseFloat(before.style.width) })));
    }));
    check('closing the panel returns to chart width', shrunk.w2 <= shrunk.w1,
          JSON.stringify(shrunk));
    await ctx.close();
}

// ==== Clip note fires in a narrow results column =======================
// Viewport was 560px until Jul 29 2026, which sat exactly ON the note's
// threshold: the note fires at scrollWidth > clientWidth + 2 (the +2 keeps a
// 1-2px rounding artifact from nagging the user about a table that is not
// visibly clipped), and at 560px this fixture overflowed by EXACTLY 2, so the
// case failed reproducibly while the product was behaving correctly. Measured
// on this fixture: 560px -> 2px overflow, 500px -> 62px, 460px -> 102px.
// 460px is used so the premise is unambiguous - the column genuinely cannot
// fit the table - rather than loosening a product tolerance that exists for a
// good reason. Verified against a bundle with the Jul 2026 category-axis work
// disarmed: the 2px measurement is identical, so this was never about that.
{
    const ctx = await browser.newContext({ viewport: { width: 460, height: 1100 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, 'w_twoway.html'));
    await page.waitForTimeout(1200);
    console.log('case Y2 (narrow column -> clip note):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const note = await page.evaluate(() => {
        const n = document.querySelector('[data-role="st-clip-note"]');
        return { present: !!n, txt: n ? n.textContent : '' };
    });
    check('clip note appears when the panel exceeds the column',
          note.present && note.txt.indexOf('drag the divider') >= 0,
          JSON.stringify(note));
    await ctx.close();
}

// ==== Dist sticky mode + histogram-bin linking =========================
{
    const { ctx, page, errs } = await openPage('r_dist_stats.html');
    console.log('case U6 (dist sticky + bin linking):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    // plain-click a non-empty bin (sticky mode: stats is open)
    const picked = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('[data-role="dist-hist-bar"]'))
            .find(b => parseFloat(b.getAttribute('data-bin-val')) > 0 &&
                       !b.getAttribute('data-halo-for'));
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, pointerId: 1, isPrimary: true }));
        }
        return { bin: el.getAttribute('data-bin'),
                 grp: el.getAttribute('data-bar-group') || '' };
    });
    await page.waitForTimeout(900);
    const s1 = await page.evaluate(() => {
        const act = Array.from(document.querySelectorAll('[data-st-pane]'))
            .filter(p2 => p2.style.display !== 'none')
            .map(p2 => p2.getAttribute('data-st-pane'));
        const pin = document.querySelector('[data-link-pinned]');
        const g = document.querySelector('[data-role="stats-link-halo"]');
        return { act: act.join(','), pin: pin ? pin.getAttribute('data-link') : '',
                 histPanel: !!document.querySelector('[data-bs-btn]'),
                 card: !!document.querySelector('[data-role="st-focus-card"]'),
                 ring: !!(g && g.getAttribute('data-st-state') === 'pin') };
    });
    check('clicking a bin pins its interval row on the Frequency tab (no edit panel)',
          s1.act === 'bins' && s1.pin.includes('bin:' + picked.bin) &&
          !s1.histPanel && s1.card && s1.ring, JSON.stringify({ s1, picked }));
    // interval-row hover halos the bin on the chart
    const hov = await page.evaluate(() => {
        // pick an UNPINNED interval that actually has data: an empty
        // bin draws no rect, so there is nothing to halo (by design)
        const rows = Array.from(document.querySelectorAll('[data-st-pane="bins"] tr[data-link]'));
        const heads = Array.from(document.querySelectorAll('[data-st-pane="bins"] th')).map(h => {
            const c = h.cloneNode(true);
            c.querySelectorAll('button').forEach(b => b.remove());
            return c.textContent.trim();
        });
        const ci = heads.indexOf('Count');
        const row = rows.find(r => !r.hasAttribute('data-link-pinned') &&
            (parseInt(r.cells[ci].textContent, 10) || 0) > 0);
        row.dispatchEvent(new MouseEvent('mouseenter'));
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const st = g ? g.getAttribute('data-st-state') : '';
        row.dispatchEvent(new MouseEvent('mouseleave'));
        return st;
    });
    check('hovering an interval row halos its bin', hov === 'hover', 'state=' + hov);
    // bin hover marks its interval row hot
    const hot = await page.evaluate(() => {
        const bin = Array.from(document.querySelectorAll('[data-role="dist-hist-bar"]'))
            .find(b => parseFloat(b.getAttribute('data-bin-val')) > 0 &&
                       !b.getAttribute('data-halo-for'));
        bin.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        return document.querySelectorAll('[data-link-hot]').length;
    });
    check('hovering a bin highlights its interval row', hot >= 1, 'hot=' + hot);
    await ctx.close();
}

// ==== Sticky-only modules: clicks never exit stats =====================
{
    const { ctx, page, errs } = await openPage('s_xy_stats.html');
    console.log('case U7 (scatter sticky-only):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await page.evaluate(() => {
        const pt = document.querySelector('[data-role="xy-point"]') ||
                   document.querySelector('svg[data-role="gb2-chart-svg"]');
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            pt.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, pointerId: 1, isPrimary: true }));
        }
    });
    await page.waitForTimeout(500);
    const st7 = await page.evaluate(() => {
        const panel = document.body.textContent;
        return { statsAlive: panel.indexOf('Correlation + fit') >= 0,
                 pointPanel: !!document.querySelector('[data-field="p-color-swatch"]') };
    });
    check('a point click keeps the scatter stats panel up',
          st7.statsAlive && !st7.pointPanel, JSON.stringify(st7));
    await ctx.close();
}

// ==== Windowed pin centering ===========================================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case Y3 (windowed pin centering):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await page.evaluate(() => {
        const sel = document.querySelector('[data-cmp-scope]');
        sel.value = 'all';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    const w0 = await page.evaluate(() => {
        const sc = document.querySelector('[data-st-pane="pairs"] [data-st-scroll]');
        return { windowed: sc.scrollHeight > sc.clientHeight + 2, top0: sc.scrollTop,
                 shadow: sc.style.boxShadow.length > 0 };
    });
    check('the every-pair table is windowed with a more-content shadow',
          w0.windowed && w0.top0 === 0 && w0.shadow, JSON.stringify(w0));
    // sticky-mode plain clicks pin a DEEP row -> the window scrolls, not the page
    const pc = (cat, grp) => page.evaluate(([c, g]) => {
        const el = document.querySelector(
            '[data-bar-cat="' + c + '"][data-bar-group="' + g + '"]:not([data-halo-for])');
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, pointerId: 1, isPrimary: true }));
        }
    }, [cat, grp]);
    await pc('B', 'M');
    await page.waitForTimeout(250);
    await pc('C', 'M');
    await page.waitForTimeout(1000);
    const cen = await page.evaluate(() => {
        const sc = document.querySelector('[data-st-pane="pairs"] [data-st-scroll]');
        const row = document.querySelector('[data-link-pinned]');
        const rr = row.getBoundingClientRect(), cr = sc.getBoundingClientRect();
        return { scrolled: sc.scrollTop > 0,
                 inside: rr.top >= cr.top - 2 && rr.bottom <= cr.bottom + 2 };
    });
    check('pinning from the chart scrolls the row into the window (not the page)',
          cen.scrolled && cen.inside, JSON.stringify(cen));
    await ctx.close();
}

// ==== Cmd/Ctrl+click compare gesture ===================================
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case Z1 (cmd-click compare):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const cellSel = (cat, grp) =>
        `[data-bar-cat="${cat}"][data-bar-group="${grp}"]:not([data-halo-for])`;
    // REAL pointer sequence (pointerdown/up/click): the bar's pointerup
    // opens its style panel and STEALS the selection before the click
    // handler runs — bare synthetic clicks masked that in the harness
    // while every real mouse click hit it in jamovi.
    const cmdClick = (cat, grp) => page.evaluate(sel => {
        const el = document.querySelector(sel);
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, metaKey: true, pointerId: 1, isPrimary: true }));
        }
    }, cellSel(cat, grp));
    const readState = () => page.evaluate(() => {
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const act = Array.from(document.querySelectorAll('[data-st-pane]'))
            .filter(p => p.style.display !== 'none')
            .map(p => p.getAttribute('data-st-pane')).join(',');
        const row = document.querySelector('[data-link-pinned]');
        const key = c => c[0] + '::' + (c[1] || '');
        const lc = row ? JSON.parse(row.getAttribute('data-link')) : null;
        return { ring: !!g, state: g ? g.getAttribute('data-st-state') : '',
                 act, pinnedN: document.querySelectorAll('[data-link-pinned]').length,
                 pinCells: lc ? lc.map(key).sort().join('|') : '',
                 marching: !!(g && g.querySelector('animate')) };
    });
    const clickTab = (t) => page.evaluate(tk => {
        document.querySelector('[data-st-tab="' + tk + '"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, t);
    // 1. cold cmd-click -> Descriptives opens with that bar's row pinned
    await cmdClick('A', 'F');
    await page.waitForTimeout(600);
    const s1 = await readState();
    check('cold cmd-click opens Descriptives with that bar pinned (ants ring)',
          s1.act === 'desc' && s1.pinnedN === 1 && s1.pinCells === 'A::F' &&
          s1.ring && s1.state === 'pin' && s1.marching, JSON.stringify(s1));
    // 2. re-click the same cell disarms and unpins
    await cmdClick('A', 'F');
    await page.waitForTimeout(200);
    const s2 = await readState();
    check('re-clicking the cell disarms, releases the pin, and stats stays up',
          !s2.ring && s2.pinnedN === 0 && s2.act === 'desc', JSON.stringify(s2));
    // 3. on Descriptives the pin just MOVES — no jump to pairs
    await cmdClick('A', 'F');
    await page.waitForTimeout(400);
    await cmdClick('B', 'F');
    await page.waitForTimeout(400);
    const s3 = await readState();
    check('second click on Descriptives moves the pin (stays, no compare jump)',
          s3.act === 'desc' && s3.pinnedN === 1 && s3.pinCells === 'B::F',
          JSON.stringify(s3));
    // 4. clicking the pairs tab carries the armed cell into compare mode
    await clickTab('pairs');
    await page.waitForTimeout(300);
    await cmdClick('A', 'F');
    await page.waitForTimeout(600);
    const s4 = await readState();
    check('pairs tab + second bar pins the comparison (armed cell carried over)',
          s4.act === 'pairs' && s4.pinnedN === 1 && s4.pinCells === 'A::F|B::F' &&
          s4.marching, JSON.stringify(s4));
    // 5. on pairs: arm -> mixed pair widens scope and pins
    await cmdClick('A', 'F');
    await page.waitForTimeout(200);
    const s5a = await readState();
    check('on pairs the first click arms lightly (no desc detour)',
          s5a.act === 'pairs' && s5a.state === 'hover' && s5a.pinnedN === 0,
          JSON.stringify(s5a));
    await cmdClick('B', 'M');
    await page.waitForTimeout(700);
    const s5 = await readState();
    const scope5 = await page.evaluate(() => {
        const sc = document.querySelector('[data-cmp-scope]');
        return sc ? sc.value : '';
    });
    check('a scoped-out mixed pair widens Compare to Every pair and pins',
          s5.pinCells === 'A::F|B::M' && scope5 === 'all', JSON.stringify({ s5, scope5 }));
    // 6. back on Descriptives: repeated inspect clicks keep staying
    await clickTab('desc');
    await page.waitForTimeout(300);
    await cmdClick('C', 'M');
    await page.waitForTimeout(400);
    const s6a = await readState();
    await cmdClick('B', 'M');
    await page.waitForTimeout(400);
    const s6b = await readState();
    check('on Descriptives every click moves the single pin (never yanks)',
          s6a.act === 'desc' && s6a.pinCells === 'C::M' &&
          s6b.act === 'desc' && s6b.pinCells === 'B::M', JSON.stringify({ s6a, s6b }));
    // 5. picker handoff: a docked picker must vanish when the gesture
    //    opens stats, and the deferred dock must never resurrect it.
    //    (Close stats first — with it open, plain clicks belong to
    //    sticky stats mode and never open a style panel.)
    const fullClick = (cat, grp, meta) => page.evaluate(([sel, m]) => {
        const el = document.querySelector(sel);
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, metaKey: m, pointerId: 1, isPrimary: true }));
        }
    }, [cellSel(cat, grp), meta]);
    await page.evaluate(() => {
        document.querySelector('[aria-label="Statistics"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await fullClick('C', 'M', false);
    await page.waitForTimeout(500);
    const dock = await page.evaluate(() => {
        const p = document.querySelector('[data-role="color-picker"]');
        return !!(p && p.offsetParent !== null && p.style.display !== 'none');
    });
    check('plain click still docks the picker on the style panel', dock === true, 'no picker');
    await fullClick('C', 'F', true);
    await page.waitForTimeout(700);
    const handoff = await page.evaluate(() => {
        const p = document.querySelector('[data-role="color-picker"]');
        return { stats: !!document.querySelector('[data-st-pane]'),
                 picker: !!(p && p.offsetParent !== null && p.style.display !== 'none') };
    });
    check('cmd-click handoff: stats opens and the picker disappears',
          handoff.stats && !handoff.picker, JSON.stringify(handoff));
    await ctx.close();
}

// ==== Sticky stats mode: plain clicks while the panel is up ============
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case Z2 (sticky stats mode):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const plainClick = (sel) => page.evaluate(s2 => {
        const el = document.querySelector(s2);
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new (type === 'click' ? MouseEvent : PointerEvent)(type,
                { bubbles: true, pointerId: 1, isPrimary: true }));
        }
    }, sel);
    const state = () => page.evaluate(() => {
        const g = document.querySelector('[data-role="stats-link-halo"]');
        const card = document.querySelector('[data-role="st-focus-card"]');
        return { statsUp: !!document.querySelector('[data-st-pane]'),
                 ring: g ? g.getAttribute('data-st-state') : '',
                 pinned: document.querySelectorAll('[data-link-pinned]').length,
                 stylePanel: !!document.querySelector('[data-bs-btn]'),
                 card: card ? (card.hasAttribute('data-st-armed') ? 'armed' : 'pinned') : '' };
    });
    // 1. plain click on a bar (pairs tab): arms + ARMED card, stats stays
    await plainClick('[data-bar-cat="A"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(300);
    const p1 = await state();
    check('plain click arms on pairs — armed prompt card, no style panel',
          p1.statsUp && p1.ring === 'hover' && p1.pinned === 0 && !p1.stylePanel &&
          p1.card === 'armed', JSON.stringify(p1));
    // 2. plain click a second bar: pair pins, card morphs to the real one
    await plainClick('[data-bar-cat="B"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(400);
    const p2 = await state();
    check('plain second click pins the comparison (card morphs, never empties)',
          p2.pinned === 1 && p2.ring === 'pin' && p2.card === 'pinned',
          JSON.stringify(p2));
    // 3. plain click a third bar: resets to a fresh arm
    await plainClick('[data-bar-cat="C"][data-bar-group="M"]:not([data-halo-for])');
    await page.waitForTimeout(300);
    const p3 = await state();
    check('a third click resets to a fresh arm', p3.pinned === 0 && p3.ring === 'hover',
          JSON.stringify(p3));
    // 4. open-space click clears the selection (and card) but KEEPS the panel
    await plainClick('svg[data-role="gb2-chart-svg"]');
    await page.waitForTimeout(300);
    const p4 = await state();
    check('open-space click clears the selection but keeps the stats panel',
          p4.statsUp && p4.ring === '' && p4.pinned === 0 && !p4.stylePanel &&
          p4.card === '', JSON.stringify(p4));
    // 4b. no stuck marquee: an empty-space press in stats mode must not
    //     arm the annotation marquee (its bubble-phase end handler is
    //     silenced by the stats pointerup consumer — Torry's stuck-box)
    const marq = await page.evaluate(() => {
        const sv = document.querySelector('svg[data-role="gb2-chart-svg"]');
        sv.dispatchEvent(new PointerEvent('pointerdown',
            { bubbles: true, pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 }));
        sv.dispatchEvent(new PointerEvent('pointerup',
            { bubbles: true, pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 }));
        sv.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
        // post-release movement is what grew the stranded box
        sv.dispatchEvent(new PointerEvent('pointermove',
            { bubbles: true, pointerId: 1, isPrimary: true, clientX: 260, clientY: 240 }));
        const m = document.querySelector('[data-role="marquee"]');
        return { visible: !!(m && m.style.display !== 'none' &&
                             parseFloat(m.getAttribute('width') || 0) > 2) };
    });
    check('no stuck marquee after an empty-space click in stats mode',
          marq.visible === false, JSON.stringify(marq));
    // 5. descriptives tab: plain click = single-select with card
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="desc"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await plainClick('[data-bar-cat="A"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(400);
    const p5 = await page.evaluate(() => {
        const card = document.querySelector('[data-role="st-focus-card"]');
        return { pinned: document.querySelectorAll('[data-link-pinned]').length,
                 card: !!card,
                 inDesc: !!(card && card.closest('[data-st-pane="desc"]')) };
    });
    check('on Descriptives a plain click pins that bar with its card',
          p5.pinned === 1 && p5.card && p5.inDesc, JSON.stringify(p5));
    // 5b. clicking the NEXT bar must not rebuild the pane (the blink):
    //     a token on the pane element survives only if no re-render ran
    await page.evaluate(() => {
        document.querySelector('[data-st-pane="desc"]').__probeToken = 42;
    });
    await plainClick('[data-bar-cat="B"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(400);
    const p5b = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="desc"]');
        const card = document.querySelector('[data-role="st-focus-card"]');
        const pin = document.querySelector('[data-link-pinned]');
        const lc = pin ? JSON.parse(pin.getAttribute('data-link')) : null;
        return { token: pane.__probeToken === 42, card: !!card,
                 pinCells: lc ? lc.map(c => c[0] + '::' + (c[1] || '')).join('|') : '' };
    });
    check('moving to the next bar swaps the card in place — no panel rebuild (no blink)',
          p5b.token && p5b.card && p5b.pinCells === 'B::F', JSON.stringify(p5b));
    // 6. close stats -> plain clicks are classic click-to-edit again
    await page.evaluate(() => {
        document.querySelector('[aria-label="Statistics"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    await plainClick('[data-bar-cat="A"][data-bar-group="F"]:not([data-halo-for])');
    await page.waitForTimeout(500);
    const p6 = await state();
    check('with stats closed, a plain click opens the style panel (classic)',
          !p6.statsUp && p6.stylePanel && p6.pinned === 0, JSON.stringify(p6));
    await ctx.close();
}

// ==== Regression cases for the Jul 2026 Sigma-panel fixes =============
// Each locks in a fix whose missing probe let the original bug ship.
async function stTabClick(page, re) {
    const clicked = await page.evaluate((re) => {
        const t = Array.from(document.querySelectorAll('[data-st-tab]'))
            .find(x => new RegExp(re, 'i').test(x.textContent));
        if (t) { t.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
        return false;
    }, re);
    await page.waitForTimeout(300);
    return clicked;
}
// Click a copy button; a label flip proves the wire ran AND buildText
// returned non-empty (_stWireCopy returns BEFORE the swap on empty text).
async function copyFlips(page, actKey) {
    return page.evaluate((k) => {
        const b = document.querySelector('[data-st-act="' + k + '"]');
        if (!b) return { has: false };
        const before = b.textContent;
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { has: true, before, after: b.textContent };
    }, actKey);
}

// case AA (Aug 2026: the chisq Copy APA is RETIRED with every other APA
// copy button - the colleague's pedagogy comment - while the Copy table
// TSV stays and still wires)
{
    const { ctx, page, errs } = await openPage('i_freq_prop_brackets.html');
    console.log('case AA (freq chisq: APA copy retired, table copy works):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const gone = await page.evaluate(() =>
        !!document.querySelector('[data-st-act="copychisq"]'));
    check('Copy APA button retired', gone === false, 'copychisq still present');
    const r = await copyFlips(page, 'copychtbl');
    check('Copy table stays and its click produces content (label flips)',
          r.has && r.after !== r.before && /copied|failed/i.test(r.after),
          JSON.stringify(r));
    await ctx.close();
}

// case BB (F4: pie shows the Pairwise tab with same-sample z rows)
{
    const { ctx, page, errs } = await openPage('z_freq_pie.html');
    console.log('case BB (pie Pairwise tab restored):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const r = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="pairwise"]');
        return { present: !!pane,
                 rows: pane ? pane.querySelectorAll('table tr').length : 0,
                 sameSample: pane ? /same-sample/i.test(pane.textContent) : false,
                 noTwoProp: pane ? !/two-proportion/i.test(pane.textContent) : false };
    });
    check('Pairwise pane present on pie', r.present, JSON.stringify(r));
    check('Pairwise has data rows', r.rows >= 2, JSON.stringify(r));
    check('foot names same-sample z (not two-proportion)',
          r.sameSample && r.noTwoProp, JSON.stringify(r));
    await ctx.close();
}

// case CC (F2: Descriptives report FULL data despite hidden points)
{
    const { ctx, page, errs } = await openPage('q_cg_hidden_exclude.html');
    console.log('case CC (descriptives full-data under hidden points):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await stTabClick(page, 'descript');
    const r = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="desc"]');
        const rows = pane ? Array.from(pane.querySelectorAll('table tr')).map(tr =>
            Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim())) : [];
        return { aRow: rows.find(x => x[0] && x[0].indexOf('A') === 0) || null };
    });
    check('cat A row present', !!r.aRow, JSON.stringify(r));
    check('N is full (' + EXP.f2An + '), not hidden-filtered',
          r.aRow && r.aRow[1] === String(EXP.f2An), JSON.stringify(r.aRow));
    check('Mean is full-data (' + EXP.f2AMean + ')',
          r.aRow && r.aRow[2] === EXP.f2AMean, JSON.stringify(r.aRow));
    await ctx.close();
}

// case DD (F6: tally must not claim "-adjusted" when it did not apply)
{
    const { ctx, page, errs } = await openPage('d_cg_tukey.html');
    console.log('case DD (rank+Tukey tally honesty):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await page.evaluate(() => {
        const t = document.querySelector('[data-cmp-test]');
        if (t) { t.value = 'mannWhitneyU'; t.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(400);
    const setC = await page.evaluate(() => {
        const c = document.querySelector('[data-cmp-corr]');
        if (!c) return false;
        const ok = Array.from(c.options).some(o => o.value === 'tukey');
        if (ok) { c.value = 'tukey'; c.dispatchEvent(new Event('change', { bubbles: true })); }
        return ok;
    });
    await page.waitForTimeout(400);
    const pill = await page.evaluate(() => {
        const p = document.querySelector('[data-cmp-tally]');
        return p ? p.textContent : null;
    });
    check('Tukey offered on CG', setC, 'no tukey option');
    check('tally says the correction does not apply',
          !!pill && /does not apply/i.test(pill), 'pill=' + JSON.stringify(pill));
    check('tally does NOT falsely claim "tukey-adjusted"',
          !!pill && !/tukey-adjusted/i.test(pill), 'pill=' + JSON.stringify(pill));
    await ctx.close();
}

// case EE (F7: scatter Sigma drops the hidden group + discloses it)
{
    const { ctx, page, errs } = await openPage('z_xy_hidden.html');
    console.log('case EE (scatter hidden-group drop + note):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const r = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('table tr td:first-child'))
            .map(td => td.textContent.trim());
        const body = document.querySelector('[data-role="inspector-panel"]') || document.body;
        return { cells,
                 hasP: cells.some(c => /(^|\b)P(\b|$)/.test(c)),
                 hasQ: cells.some(c => /(^|\b)Q(\b|$)/.test(c)),
                 note: /left out of this table/i.test(body.textContent || '') };
    });
    check('a visible-group row (P) present', r.hasP, JSON.stringify(r.cells));
    check('hidden group Q has NO row', !r.hasQ, JSON.stringify(r.cells));
    check('hidden-group disclosure note present', r.note, 'no note');
    await ctx.close();
}

// case FF (omnibus one-way fallback when a factor collapses to 1 level)
{
    const { ctx, page, errs } = await openPage('z_omni_collapse.html');
    console.log('case FF (omnibus one-way fallback):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await stTabClick(page, 'omnibus');
    const txt = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        return pane ? pane.textContent : (document.body.textContent || '');
    });
    check('falls back to one-way (not the replicates refusal)',
          /one-way: only one/i.test(txt) && !/not enough data per cell/i.test(txt),
          txt.slice(0, 200));
    check('reports a Main effect F', /Main effect of[\s\S]*F\(/i.test(txt), txt.slice(0, 200));
    await ctx.close();
}

// case GG (Copy-table parity: every table tab's copy button is wired)
{
    const parity = [
        ['d_cg_tukey.html', 'descript', 'copycgdesc', 'cg Descriptives'],
        ['r_dist_stats.html', 'descript', 'copydistdesc', 'dist Descriptives'],
        ['i_freq_prop_brackets.html', 'pairwise', 'copypw', 'freq Pairwise'],
        ['i_freq_prop_brackets.html', 'counts', 'copycnt', 'freq Counts'],
        ['u_likert_stats.html', 'item means', 'copymeans', 'likert Item means'],
    ];
    console.log('case GG (copy-table parity):');
    for (const [file, tabRe, actKey, label] of parity) {
        const { ctx, page, errs } = await openPage(file);
        check(label + ': no page errors', errs.length === 0, errs.join(' | '));
        await openStats(page);
        await stTabClick(page, tabRe);
        const r = await copyFlips(page, actKey);
        check(label + ': Copy button wired (label flips)',
              r.has && r.after !== r.before && /copied|failed/i.test(r.after),
              JSON.stringify(r));
        await ctx.close();
    }
}

// case HH (#1: RM Descriptives SE = Cousineau-Morey, not raw)
{
    const { ctx, page, errs } = await openPage('hh_rm_cmse.html');
    console.log('case HH (RM Descriptives CM SE):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await stTabClick(page, 'descript');
    const r = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="desc"]');
        const rows = pane ? Array.from(pane.querySelectorAll('table tr')).map(tr =>
            Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim())) : [];
        const se = {};
        for (const row of rows) if (['t1', 't2', 't3'].includes(row[0])) se[row[0]] = row[5];
        return { se, cm: /Cousineau-Morey within-subject value/i.test(pane ? pane.textContent : '') };
    });
    check('SE(t1) = CM ' + EXP.cmse1, r.se.t1 === EXP.cmse1, JSON.stringify(r.se));
    check('SE(t2) = CM ' + EXP.cmse2, r.se.t2 === EXP.cmse2, JSON.stringify(r.se));
    check('SE(t3) = CM ' + EXP.cmse3, r.se.t3 === EXP.cmse3, JSON.stringify(r.se));
    check('foot names the Cousineau-Morey correction', r.cm, 'no CM note');
    await ctx.close();
}

// case II (#2: box-plot Compare-pairs note about mean-based tests)
{
    const { ctx, page, errs } = await openPage('ii_box.html');
    console.log('case II (box pairs mean-note):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    // The box family LANDS on Descriptives (Aug 2 2026): the panel opens
    // on what the chart shows; the mean tests stay one tab away.
    const landing = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('[data-st-tab]'));
        const on = btns.find(b => (b.getAttribute('style') || '')
            .includes('font-weight:600') || b.getAttribute('aria-selected')
            === 'true');
        const pane = document.querySelector('[data-st-pane="desc"]');
        return { paneShown: !!pane && pane.style.display !== 'none' };
    });
    check('the box plot lands on Descriptives, not the mean tests',
          landing.paneShown, JSON.stringify(landing));
    const txt = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="pairs"]');
        return p ? p.textContent : '';
    });
    check('pairs note distinguishes mean tests from Mann-Whitney ranks',
          /these t tests compare MEANS/i.test(txt) &&
          /Switching to Mann-Whitney U would not test medians either/i.test(txt),
          txt.slice(-240));
    await ctx.close();
}

// case JJ (#3: chi-square small-expected-count caveat)
{
    const { ctx, page, errs } = await openPage('jj_sparse.html');
    console.log('case JJ (chisq small-expected caveat):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const txt = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="chisq"]');
        return p ? p.textContent : '';
    });
    check('caveat fires on a small expected count',
          /smallest expected count/i.test(txt) && /unreliable/i.test(txt), txt.slice(0, 240));
    await ctx.close();
}

// case KK (#6: three-way factorial omnibus — facet is a factor)
{
    const { ctx, page, errs } = await openPage('kk_threeway.html');
    console.log('case KK (three-way omnibus):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await stTabClick(page, 'omnibus');
    const txt = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="omnibus"]');
        return p ? p.textContent : '';
    });
    check('all three main effects present',
          /Main effect of A/.test(txt) && /Main effect of B/.test(txt) && /Main effect of C/.test(txt),
          txt.slice(0, 300));
    check('three-way interaction present', /A × B × C/.test(txt), txt.slice(0, 300));
    const T = { A: EXP.kkA, B: EXP.kkB, C: EXP.kkC, AB: EXP.kkAB, AC: EXP.kkAC, BC: EXP.kkBC, ABC: EXP.kkABC };
    for (const k of Object.keys(T)) check('F_' + k + ' matches R (' + T[k] + ')', txt.includes(T[k]), 'want ' + T[k]);
    await ctx.close();
}

// case LL (#8: Shapiro n-aware Q-Q nudges)
{
    const { ctx, page, errs } = await openPage('ll_shapiro.html');
    console.log('case LL (Shapiro n-aware nudges):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await stTabClick(page, 'normality');
    const txt = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="normality"]');
        return p ? p.textContent : '';
    });
    check('large-n flagged nudge points at the Q-Q plot',
          /n is large, so even a tiny departure/i.test(txt), txt.slice(0, 400));
    check('small-n low-power nudge points at the Q-Q plot',
          /n is small, so the test has low power/i.test(txt), txt.slice(0, 400));
    await ctx.close();
}

// case MM (#7: configurable significance alpha drives the displays)
{
    const { ctx, page, errs } = await openPage('d_cg_tukey.html');
    console.log('case MM (configurable alpha):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const has = await page.evaluate(() => !!document.querySelector('[data-cmp-alpha]'));
    check('alpha control present in the band', has, 'missing');
    const before = await page.evaluate(() => (document.querySelector('[data-cmp-tally]') || {}).textContent || '');
    check('tally reads "significant at .05" by default', /significant at \.05/.test(before), before);
    await page.evaluate(() => {
        const s = document.querySelector('[data-cmp-alpha]');
        if (s) { s.value = '0.01'; s.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (document.querySelector('[data-cmp-tally]') || {}).textContent || '');
    check('tally follows alpha to .01', /significant at \.01/.test(after) && !/significant at \.05/.test(after), after);
    await ctx.close();
}

// case NN (term pop-out clicks): the pop-out lives at body level OUTSIDE
// the inspector panel, so a click on it used to bubble to the document
// outside-click handler and tear the whole stats panel down (Torry, Jul
// 2026). Now a pop-out click dismisses the pop-out only. Clicks carry
// detail:1 + real coords so the outside-click handler's phantom-click
// guard (detail 0 at 0,0) does not mask the behavior under test.
{
    const { ctx, page, errs } = await openPage('d_cg_tukey.html');
    console.log('case NN (term pop-out click keeps the panel):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const statsUp = () => page.evaluate(() =>
        document.querySelectorAll('[data-st-pane]').length > 0);
    const popDisp = () => page.evaluate(() => {
        const p = document.querySelector('[data-role="gb2-stterm-pop"]');
        return p ? p.style.display : 'absent';
    });
    const clickAt = (sel) => page.evaluate(s => {
        const el = document.querySelector(s);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, detail: 1,
            clientX: Math.max(1, r.left + r.width / 2),
            clientY: Math.max(1, r.top + r.height / 2)
        }));
        return true;
    }, sel);
    await clickAt('.gb2-stterm');
    await page.waitForTimeout(200);
    check('term click opens the pop-out', (await popDisp()) === 'block',
          'display=' + await popDisp());
    await clickAt('[data-role="gb2-stterm-pop"]');
    await page.waitForTimeout(400);
    check('pop-out click closes the pop-out', (await popDisp()) === 'none',
          'display=' + await popDisp());
    check('stats panel survives the pop-out click', await statsUp(), 'panel gone');
    await clickAt('.gb2-stterm');
    await page.waitForTimeout(200);
    await clickAt('[data-st-pane]');
    await page.waitForTimeout(400);
    check('panel click still closes the pop-out', (await popDisp()) === 'none');
    check('stats panel survives a panel click', await statsUp(), 'panel gone');
    await ctx.close();
}

// case OO (per-row omnibus Effect popovers, Torry Jul 2026): main
// effects and interactions carry their OWN term entries plus an
// "In this table" sentence naming this row's factors and p; the
// column header keeps the generic "Effect (the ANOVA term)".
{
    const { ctx, page, errs } = await openPage('w_twoway.html');
    console.log('case OO (omnibus effect-cell popovers):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    await page.evaluate(() => {
        document.querySelector('[data-st-tab="omnibus"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(400);
    const cells = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        return Array.from(pane.querySelectorAll('td .gb2-stterm')).map(el => ({
            key: el.getAttribute('data-stterm'),
            here: el.getAttribute('data-sthere') || '',
            label: el.textContent
        })).filter(c => c.key === 'mainEffect' || c.key === 'interactionEffect');
    });
    check('two mainEffect cells + one interactionEffect cell',
          cells.filter(c => c.key === 'mainEffect').length === 2 &&
          cells.filter(c => c.key === 'interactionEffect').length === 1,
          JSON.stringify(cells.map(c => c.key)));
    const meX = cells.find(c => c.key === 'mainEffect' && /of x$/.test(c.label));
    check('main-effect here-text names the averaged-over factor',
          !!meX && /averaging over g/.test(meX.here) && / p [=<] /.test(meX.here),
          meX && meX.here);
    const inr = cells.find(c => c.key === 'interactionEffect');
    check('interaction here-text asks the it-depends question',
          !!inr && /does the effect of x change across the levels of g/.test(inr.here),
          inr && inr.here);
    check('header keeps the generic Effect term', await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        return !!pane.querySelector('th [data-stterm="omnibusEffect"]');
    }), 'missing');
    // Click the interaction cell -> its own popover, with the In-this-table box.
    await page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="omnibus"]');
        const el = Array.from(pane.querySelectorAll('td .gb2-stterm'))
            .find(x => x.getAttribute('data-stterm') === 'interactionEffect');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, detail: 1,
            clientX: Math.max(1, r.left + 2), clientY: Math.max(1, r.top + 2)
        }));
    });
    await page.waitForTimeout(250);
    const pop = await page.evaluate(() => {
        const p = document.querySelector('[data-role="gb2-stterm-pop"]');
        return { disp: p ? p.style.display : 'absent', txt: p ? p.textContent : '' };
    });
    check('interaction cell opens the Interaction popover',
          pop.disp === 'block' && /^Interaction/.test(pop.txt), pop.txt.slice(0, 80));
    check('popover carries the In-this-table context',
          /In this table/i.test(pop.txt) && /does the effect of x change/.test(pop.txt),
          pop.txt.slice(0, 200));
    await ctx.close();
}

// case PP (popover header coverage, Jul 2026): corr "Pair" and likert
// "Item"/"Items" headers carry term popovers; the dist bins-table sort
// toggles stay UNWRAPPED on purpose (a click there must keep sorting -
// the stterm capture handler would eat it).
{
    const hdrs = async (file, sel) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto('file://' + path.join(OUT, file));
        await page.waitForTimeout(800);
        await page.evaluate(() => {
            document.querySelector('[aria-label="Statistics"]')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const r = await page.evaluate(s => {
            const root = s ? document.querySelector(s) : document.body;
            return Array.from(root.querySelectorAll('th')).map(th => ({
                t: (th.textContent || '').trim(),
                wrapped: !!th.querySelector('.gb2-stterm')
            }));
        }, sel);
        await ctx.close();
        return r;
    };
    console.log('case PP (popover header coverage):');
    // th textContent is RAW (the uppercase look is a CSS transform),
    // so match the source-case labels.
    const corrH = await hdrs('t_corr_stats.html', null);
    check('corr "Pair" header is a term', corrH.some(h => /^pair$/i.test(h.t) && h.wrapped),
          JSON.stringify(corrH));
    const lkH = await hdrs('u_likert_stats.html', null);
    check('likert "Item" and "Items" headers are terms',
          lkH.some(h => /^item$/i.test(h.t) && h.wrapped) &&
          lkH.some(h => /^items$/i.test(h.t) && h.wrapped),
          JSON.stringify(lkH));
    const binH = await hdrs('r_dist_stats.html', '[data-st-pane="bins"]');
    check('bins sort toggles stay unwrapped (click must sort)',
          binH.filter(h => /^(interval|count|%)/i.test(h.t)).every(h => !h.wrapped),
          JSON.stringify(binH));
}

// case RR (per-row "In this table" context + pop-out a11y, Jul 2026):
// scatter/freq/dist/likert value cells carry data-sthere sentences built
// from their own row; the pop-out mirrors expanded state on its trigger,
// announces through the live region, and Escape closes it as its OWN
// layer (the stats panel survives).
{
    const sthere = async (file, sel) => {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto('file://' + path.join(OUT, file));
        await page.waitForTimeout(800);
        await page.evaluate(() => {
            document.querySelector('[aria-label="Statistics"]')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        const v = await page.evaluate(s => {
            const el = document.querySelector(s);
            return el ? (el.getAttribute('data-sthere') || '') : null;
        }, sel);
        await ctx.close();
        return v;
    };
    console.log('case RR (value-cell context + pop-out a11y):');
    const xyR = await sthere('s_xy_stats.html', '.gb2-stcellterm[data-stterm="pearsonR"]');
    check('scatter r cell carries row context',
          !!xyR && /straight-line relationship/.test(xyR), String(xyR));
    const fqDp = await sthere('h_freq_chisq_hover.html',
        '[data-st-pane="pairwise"] .gb2-stcellterm[data-stterm="deltaP"]');
    check('freq delta-p cell names both proportions',
          !!fqDp && /percentage points/.test(fqDp), String(fqDp));
    const fqAdj = await sthere('h_freq_chisq_hover.html',
        '[data-st-pane="pairwise"] .gb2-stcellterm[data-stterm="pAdj"]');
    check('freq Holm cell states its family size',
          !!fqAdj && /Holm adjustment for the \d+ comparison/.test(fqAdj), String(fqAdj));
    const dW = await sthere('r_dist_stats.html',
        '[data-st-pane="normality"] .gb2-stcellterm[data-stterm="shapiroW"]');
    check('dist W cell carries row context',
          !!dW && /normal curve/.test(dW), String(dW));
    const lkA = await sthere('u_likert_stats.html',
        '[data-st-pane="alpha"] .gb2-stcellterm[data-stterm="cronbachAlpha"]');
    check('likert alpha cell reads its own value',
          !!lkA && /Here alpha = /.test(lkA), String(lkA));
    // a11y: open a term, expect live-region announcement + aria state;
    // Escape closes the pop-out as its own layer, keeping the panel.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(OUT, 's_xy_stats.html'));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        document.querySelector('[aria-label="Statistics"]')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const el = document.querySelector('.gb2-stcellterm[data-stterm="pearsonR"]');
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, detail: 1,
            clientX: Math.max(1, r.left + 2), clientY: Math.max(1, r.top + 2)
        }));
    });
    await page.waitForTimeout(400);
    const a11y = await page.evaluate(() => {
        const el = document.querySelector('.gb2-stcellterm[data-stterm="pearsonR"]');
        const lv = document.querySelector('div[data-role="gb2-a11y-live"]');
        return {
            expanded: el.getAttribute('aria-expanded'),
            desc: el.getAttribute('aria-describedby'),
            live: lv ? lv.textContent : ''
        };
    });
    check('term click sets aria-expanded + describedby',
          a11y.expanded === 'true' && a11y.desc === 'gb2-stterm-pop', JSON.stringify(a11y));
    check('live region announces the definition',
          /Pearson r/.test(a11y.live) && /In this table/.test(a11y.live),
          a11y.live.slice(0, 140));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => {
        const el = document.querySelector('.gb2-stcellterm[data-stterm="pearsonR"]');
        const p = document.querySelector('[data-role="gb2-stterm-pop"]');
        return {
            expanded: el.getAttribute('aria-expanded'),
            disp: p ? p.style.display : 'absent',
            // scatter is a bare single-section module (no data-st-pane):
            // its stats card carries data-st-xystats instead.
            panelUp: !!document.querySelector('[data-st-xystats]')
        };
    });
    check('Escape closes the pop-out only (panel survives, aria resets)',
          after.expanded === 'false' && after.disp === 'none' && after.panelUp,
          JSON.stringify(after));
    await ctx.close();
}

// case P1 (jamovi parity, Jul 2026): a Median chart suppresses SE/SD/CI
// error bars (the mean-model formulas describe the mean, so no bar may
// draw around a median) and the Sigma Descriptives foot discloses it.
{
    const { ctx, page, errs } = await openPage('nn1_median.html');
    console.log('case P1 (median chart suppresses error bars):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const nBars = await page.evaluate(() =>
        document.querySelectorAll('[data-role="error-bar"]').length);
    check('no error bars drawn under Summary = Median', nBars === 0,
          'found ' + nBars);
    await openStats(page);
    const descTxt = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="desc"]');
        return p ? (p.textContent || '') : '';
    });
    check('Descriptives foot discloses the median rule',
          descTxt.includes('while Summary is Median'),
          descTxt.slice(0, 240));
    await ctx.close();
}

// case P2 (jamovi parity): Mann-Whitney displays U = min(U1, U2) — what
// jamovi prints; R's W is the first group's U — and jamovi's signed
// rank-biserial 1 - 2*U1/(n1*n2), whose sign runs opposite to d when
// the left group scores higher.
{
    const { ctx, page, errs } = await openPage('nn2_mw.html');
    console.log('case P2 (MW U-min + jamovi rank-biserial sign):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('label shows jamovi min-U (' + EXP.mwU + ')',
          labels.some(l => l.includes(EXP.mwU + ',')),
          'labels=' + JSON.stringify(labels));
    check('label does NOT show the raw W (' + EXP.mwUraw + ')',
          !labels.some(l => l.includes(EXP.mwUraw + ',')),
          'labels=' + JSON.stringify(labels));
    check('label carries the jamovi-signed rank-biserial (' + EXP.mwR + ')',
          labels.some(l => l.includes(EXP.mwR)),
          'labels=' + JSON.stringify(labels));
    await ctx.close();
}

// case P3 (jamovi parity): the d beside a WELCH bracket uses jamovi's
// average-variance denominator sqrt((v1+v2)/2), not the pooled SD
// (the fixture's unequal n + unequal spread split the two at 2 dp).
{
    const { ctx, page, errs } = await openPage('nn3_welchd.html');
    console.log('case P3 (Welch d = average-variance, jamovi):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    const labels = await bracketLabels(page);
    check('label carries the jamovi Welch d (' + EXP.welchD + ')',
          labels.some(l => l.includes(EXP.welchD)),
          'labels=' + JSON.stringify(labels));
    check('label is NOT the pooled d (' + EXP.welchDpooled + ')',
          !labels.some(l => l.includes(EXP.welchDpooled)),
          'labels=' + JSON.stringify(labels));
    await ctx.close();
}

// case P4 (jamovi parity): small-n tie-free Spearman p in the matrix is
// R's DEFAULT cor.test p (exact — jamovi's corrmatrix passes no exact
// argument, and Scatter already used the default), not the exact=FALSE
// approximation the module used to force.
{
    const { ctx, page, errs } = await openPage('nn4_corr_exact.html');
    console.log('case P4 (corr Spearman exact p):');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await openStats(page);
    const pRow = await page.evaluate(() => {
        const pane = document.querySelector('[data-st-corrpairs]');
        if (!pane) return null;
        const row = pane.querySelectorAll('table tr')[1];
        return row ? Array.from(row.cells).map(c => c.textContent.trim()) : null;
    });
    check('All-pairs p equals R default cor.test (' + EXP.spexP + ')',
          !!pRow && pRow[2] === EXP.spexP, JSON.stringify(pRow));
    await ctx.close();
}

// ---- Case DEF: the SHIPPED default correction ------------------------
// Aug 2026 (Torry): a panel that lists every pair with no adjustment is
// the least defensible default in the app, so Compare Groups now
// defaults to Tukey - exact for the all-pairs family it enumerates -
// and the families where Tukey has no pooled basis (repeated measures,
// proportions) default to Holm, which always applies. Pinned here
// because every other Compare-pairs case STATES its correction.
{
    const { ctx, page, errs } = await openPage('v_cmp_default.html');
    console.log('case DEF (shipped default correction):');
    await openStats(page);
    const cg = await page.evaluate(() => {
        const sel = document.querySelector('[data-cmp-corr]');
        return sel ? sel.value : null;
    });
    // The shipped default is "none" again (Aug 20 2026): defaulting to
    // Tukey made the ROW incoherent in a new way - the Test control
    // resolves to Welch while a pooled correction forces the pooled
    // statistic, so the displayed t stopped matching the named test.
    // Pinned here either way, so the default is never accidental.
    check('Compare Groups ships no correction by default', cg === 'none',
          'select=' + JSON.stringify(cg));
    // A default is NOT a deliberate pick: the bracket panel's rule that
    // keeps a chosen pooled correction visible must not fire on it, or
    // the test gate is disabled everywhere (this is what caught it).
    check('no page errors', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
}
{
    const { ctx, page, errs } = await openPage('a_rm_auto.html');
    console.log('case DEF2 (repeated measures default):');
    await openStats(page);
    const rm = await page.evaluate(() => {
        const sel = document.querySelector('[data-cmp-corr]');
        return sel ? sel.value : null;
    });
    check('Repeated Measures ships no correction by default',
          rm === 'none', 'select=' + JSON.stringify(rm));
    check('no page errors', errs.length === 0, JSON.stringify(errs));
    await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'ALL PROBES PASS' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
