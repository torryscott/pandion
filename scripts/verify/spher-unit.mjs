// The sphericity check is pure arithmetic, so it is unit-testable on its
// own: the chi-square upper tail behind Mauchly's p, and Mauchly's W, its p
// and the two epsilons from the shared repeated-measures routine.
//
// Reference values come from R (jamovi 2.7.32's own R 4.5): pchisq() for the
// tail, and for the table base R's mauchly.test() plus the car formulas
// jamovi's Repeated Measures ANOVA prints (Greenhouse-Geisser from the
// contrast-space error cross-product, Huynh-Feldt on the between-subjects
// error df, capped at 1). The datasets are the sph_* fixtures of the
// statistical-judgment check, where the same numbers are read off the
// Omnibus tab at display precision.
//
// Reads the SOURCE bundle on purpose (the catstride-unit idiom): method
// names are found by text. The end-to-end behaviour runs on the built page
// in standalone/verify/stats-judgment-check.mjs (case sphericity).
import { readFileSync } from 'node:fs';

const SRC = process.env.GB2_SRC || 'inst/widget/graphbuilder2.js';
const src = readFileSync(SRC, 'utf8');
function method(name) {
    const at = src.indexOf('\n        ' + name + ': function');
    if (at < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', at), depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (!depth) return src.slice(at + 1, j + 1).trim(); }
    }
    throw new Error('unbalanced: ' + name);
}
const core = new Function('return {' +
    ['mean', '_logGamma', 'chiSqSurvival', '_repeatedAnovaMoments'].map(method).join(',\n') + '};')();

let fails = 0, checks = 0;
function near(got, want, tol, what) {
    checks++;
    const okv = Number.isFinite(got) && Math.abs(got - want) <= tol * Math.abs(want) + 1e-300;
    if (!okv) { fails++; console.log('  FAIL ' + what + ': got ' + got + ' want ' + want); }
    return okv;
}

// 1. chi-square upper tail against pchisq(x, df, lower.tail = FALSE)
const GRID = [[0.01,1,9.2034432544594202e-01],[0.5,1,4.7950012218695348e-01],[1,1,3.1731050786291415e-01],[2,1,1.5729920705028447e-01],[3.8399999999999999,1,5.0043521248705224e-02],[5.9900000000000002,1,1.438720237400716e-02],[10,1,1.5654022580025519e-03],[25,1,5.7330314375838793e-07],[60,1,9.4857375710738494e-15],[150,1,1.733643245717827e-34],[400,1,5.5072482372124689e-89],[0.01,2,9.9501247919268221e-01],[0.5,2,7.7880078307140488e-01],[1,2,6.0653065971263342e-01],[2,2,3.6787944117144233e-01],[3.8399999999999999,2,1.4660696213035015e-01],[5.9900000000000002,2,5.003662708658628e-02],[10,2,6.737946999085467e-03],[25,2,3.7266531720786709e-06],[60,2,9.3576229688401748e-14],[150,2,2.6786369618080778e-33],[400,2,1.3838965267367376e-87],[0.01,5,9.9999946997299571e-01],[0.5,5,9.921232932326296e-01],[1,5,9.6256577324729642e-01],[2,5,8.4914503608460967e-01],[3.8399999999999999,5,5.7267445983208876e-01],[5.9900000000000002,5,3.0719317852086803e-01],[10,5,7.5235246146512197e-02],[25,5,1.3933379118562616e-04],[60,5,1.2154569777183041e-11],[150,5,1.3351378873003131e-30],[400,5,2.9666446590828852e-84],[0.01,6,9.9999997924463579e-01],[0.5,6,9.9783850331023749e-01],[1,6,9.8561232203302929e-01],[2,6,9.1969860292860584e-01],[3.8399999999999999,6,6.983182820192837e-01],[5.9900000000000002,6,4.243112231520903e-01],[10,6,1.2465201948308116e-01],[25,6,3.414545968917083e-04],[60,6,4.5010166480121245e-11],[150,6,7.7372428641826348e-30],[400,6,2.7956093736608839e-83],[0.01,9,9.9999999999915912e-01],[0.5,9,9.9996956625883882e-01],[1,9,9.9943750269783249e-01],[2,9,9.914676066288135e-01],[3.8399999999999999,9,9.2162405617649346e-01],[5.9900000000000002,9,7.4091871827825961e-01],[10,9,3.5048521232336138e-01],[25,9,2.9711804859176216e-03],[60,9,1.3406780483959611e-09],[150,9,8.8196299548054152e-28],[400,9,1.3699125019662656e-80],[0.01,13,1e+00],[0.5,13,9.999999474506911e-01],[1,13,9.999961652652648e-01],[2,13,9.9977374991534396e-01],[3.8399999999999999,13,9.9277727855804321e-01],[5.9900000000000002,13,9.4651614474185297e-01],[10,13,6.9393436798074892e-01],[25,13,2.3083728033730089e-02],[60,13,5.2534798527057154e-08],[150,13,2.0612383484335523e-25],[400,13,2.2366449596323236e-77],[0.01,14,1e+00],[0.5,14,9.9999999026547814e-01],[1,14,9.9999899762039712e-01],[2,14,9.9991675885071196e-01],[3.8399999999999999,14,9.9635414291884172e-01],[5.9900000000000002,14,9.667428819579813e-01],[10,14,7.6218346297293871e-01],[25,14,3.4567393577248834e-02],[60,14,1.1731942002346964e-07],[150,14,7.1883723059635472e-25],[400,14,1.2679754825669758e-76],[0.01,18,9.9999999999999989e-01],[0.5,18,9.9999999999160372e-01],[1,18,9.9999999656450966e-01],[2,18,9.9999887479740202e-01],[3.8399999999999999,18,9.998235426810711e-01],[5.9900000000000002,18,9.9623734703444689e-01],[10,18,9.3190636527815141e-01],[25,18,1.2491619694467052e-01],[60,18,2.0460759042705716e-06],[150,18,7.4322642885268064e-23],[400,18,9.1507901535952392e-74],[0.01,30,1e+00],[0.5,30,1e+00],[1,30,1e+00],[2,30,9.9999999999970002e-01],[3.8399999999999999,30,9.9999999773936454e-01],[5.9900000000000002,30,9.9999934314721139e-01],[10,30,9.9977374632382321e-01],[25,30,7.2503188418059983e-01],[60,30,9.2068239614866631e-04],[150,30,6.7069525239379602e-18],[400,30,2.7954938576564883e-66]];
for (const [x, df, want] of GRID) near(core.chiSqSurvival(x, df), want, 2e-8, 'chiSqSurvival(' + x + ', ' + df + ')');
if (core.chiSqSurvival(0, 3) !== 1 || core.chiSqSurvival(-1, 3) !== 1 || core.chiSqSurvival(Infinity, 3) !== 0 ||
    !Number.isNaN(core.chiSqSurvival(1, 0))) { fails++; console.log('  FAIL chiSqSurvival edge values'); }
checks++;

// 2. Mauchly's W, its p and both epsilons on the fixtures
const FX = JSON.parse(readFileSync(new URL('../../standalone/verify/stats-judgment-fixtures.json', import.meta.url), 'utf8'));
const REF = {"sph_k3":{"W":0.77661959210605747,"p":2.2548888397828763e-02,"gg":0.81740723780382951,"hf":0.8566958171888861},"sph_k4":{"W":0.015994975592748598,"p":9.3636205943086609e-25,"gg":0.36892793332345131,"hf":0.37262725847721695},"sph_mixed":{"W":0.78584326208251343,"p":3.0364843034675286e-02,"gg":0.82361689291869433,"hf":0.86524621601914031},"sph_flat":{"W":0.95740903481790085,"p":5.2055044529861638e-01,"gg":0.95914892167206312,"hf":1}};
for (const id of Object.keys(REF)) {
    const fx = FX.find(f => f.id === id);
    if (!fx) { fails++; console.log('  FAIL no fixture ' + id); continue; }
    const cols = fx.roles.measures.map(mn => fx.header.indexOf(mn));
    const gi = fx.roles.betweenVar ? fx.header.indexOf(fx.roles.betweenVar) : -1;
    const levels = gi < 0 ? null : [...new Set(fx.rows.map(r => r[gi]))];
    const rows = fx.rows.map(r => cols.map(c => r[c]));
    const groups = gi < 0 ? undefined : fx.rows.map(r => levels.indexOf(r[gi]));
    const m = core._repeatedAnovaMoments(rows, groups), sp = m.spher, want = REF[id];
    if (!sp) { fails++; console.log('  FAIL no sphericity check returned for ' + id); continue; }
    near(sp.W, want.W, 1e-9, id + ' W');
    // a p near 1e-24 rests on log(W) of a tiny determinant: hold it to 2%
    near(sp.p, want.p, want.p < 1e-12 ? 2e-2 : 1e-7, id + ' Mauchly p');
    near(sp.gg, want.gg, 1e-9, id + ' Greenhouse-Geisser epsilon');
    near(sp.hf, want.hf, 1e-9, id + ' Huynh-Feldt epsilon');
    near(m.eps, want.gg, 1e-9, id + ' eps (the existing output) is still the Greenhouse-Geisser epsilon');
}

// 3. two conditions: no check, and eps stays exactly 1
{
    const fx = FX.find(f => f.id === 'sph_two');
    const cols = fx.roles.measures.map(mn => fx.header.indexOf(mn));
    const m = core._repeatedAnovaMoments(fx.rows.map(r => cols.map(c => r[c])));
    checks++;
    if (m.spher !== null || m.eps !== 1) { fails++; console.log('  FAIL two conditions: spher ' + JSON.stringify(m.spher) + ' eps ' + m.eps); }
}

// 4. fewer error df than contrasts: W and p are not defined (jamovi prints
//    NaN there), the epsilons stay finite and ordered
{
    const rows = [[1, 2, 4, 3], [2, 2, 5, 7], [3, 5, 4, 9]];
    const sp = core._repeatedAnovaMoments(rows).spher;
    checks++;
    if (!sp || !Number.isNaN(sp.W) || !Number.isNaN(sp.p) || !(sp.gg >= 1 / 3 && sp.gg <= 1) || !(sp.hf >= sp.gg && sp.hf <= 1)) {
        fails++; console.log('  FAIL n = 3, k = 4: ' + JSON.stringify(sp));
    }
}

// 5. the control: the comparison itself must reject a value that is off
{
    const before = fails;
    const quiet = console.log; console.log = () => {};
    near(REF.sph_k3.gg * (1 + 1e-6), REF.sph_k3.gg, 1e-9, 'control');
    console.log = quiet;
    checks--;
    if (fails !== before + 1) { fails = before + 1; console.log('  FAIL control: an epsilon off by one part in a million passed'); }
    else fails = before;
}

if (fails) { console.log('SPHERICITY UNIT: ' + fails + ' FAILED of ' + checks); process.exit(1); }
console.log('SPHERICITY UNIT: PASS (' + checks + ' checks: chi-square tail, Mauchly, both epsilons, edges)');
