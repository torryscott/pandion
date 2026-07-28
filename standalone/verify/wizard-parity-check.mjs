// Punch list t3-50: Help Me Choose shipped without the wizard's teaching tip
// and without a way onward.
//
// The graph-type glyphs were added earlier (startChip draws a real thumbnail
// per chart type), so what was left is the part that teaches and the part that
// stops the wizard dead-ending:
//
//   * the "Color grouping or panels?" tip, which the jamovi wizard was
//     extended to carry because it is the single most common confusion:
//     grouping puts the levels in ONE chart sharing one pair of axes, which is
//     what makes a comparison exact, while panels draw a small chart each and
//     compare patterns rather than values.
//   * a closing pointer at the chart's own "Which graph?" and "Check graph"
//     panels. The jamovi wizard can only NAME them, because a results iframe
//     cannot launch anything; the shell can open them, so it does.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

const openWizard = () => page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.showHelpMeChoose();
    await s(600);
});

console.log('case 1: the question route teaches grouping versus panels');
await openWizard();
const q = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // The wizard's real navigation, by data-hmc-go, not by guessing at button
    // text. Compare Groups has room for three categoricals, so the tip applies.
    document.querySelector('[data-hmc-go="compare"]').click();
    await s(400);
    document.querySelector('[data-hmc-go="compare-spread"]').click();
    await s(600);
    const card = document.querySelector('#ps-help-choose .ps-hmc-result');
    return { reached: !!card,
             label: card ? (card.querySelector('h3') || {}).textContent : null,
             tip: card ? !!card.querySelector('.ps-hmc-tip') : false,
             tipText: card && card.querySelector('.ps-hmc-tip')
                 ? card.querySelector('.ps-hmc-tip').innerText : '',
             next: card
                 ? Array.from(card.querySelectorAll('.ps-hmc-nextlink'))
                     .map(b => b.textContent.trim()) : [] };
});
ok(q.reached, `setup: the question route reaches a recommendation (${q.label})`);
ok(q.tip, 'it carries the grouping-versus-panels tip');
ok(/Group By/.test(q.tipText) && /Panels/.test(q.tipText),
   'naming both slots by the names the app uses');
ok(/exact/.test(q.tipText) && /patterns/.test(q.tipText),
   `and stating the DIFFERENCE rather than just listing them ` +
   `("${q.tipText.replace(/\n/g, ' ').slice(0, 120)}")`);

console.log('case 2: and it does not dead-end');
ok(q.next.length === 2 && /Which graph/i.test(q.next[0]),
   `the card points at the chart's own teaching panels ` +
   `(${JSON.stringify(q.next)})`);

console.log('case 3: the pointer actually opens them');
const opened = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const b = Array.from(document.querySelectorAll('.ps-hmc-nextlink'))
        .filter(x => /Which graph/i.test(x.textContent))[0];
    b.click();
    await s(2200);
    return {
        wizardClosed: getComputedStyle(
            document.getElementById('ps-help-choose')).display === 'none',
        tabs: Array.from(document.querySelectorAll(
            '.graphbuilder2-host [data-helpnav]')).map(t =>
            t.getAttribute('data-helpnav'))
    };
});
ok(opened.wizardClosed, 'the wizard steps out of the way');
ok(opened.tabs.indexOf('graphChooser') !== -1,
   `and the engine's own help panel is open on it, which the jamovi wizard ` +
   `cannot do from a sandboxed results iframe (${JSON.stringify(opened.tabs)})`);

console.log('case 4: the data route only claims it when it applies');
const d = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    async function run(vars) {
        window.PS_SHELL.showHelpMeChoose();
        await s(500);
        const root = document.getElementById('ps-help-choose');
        root.querySelector('[data-hmc-mode="variables"]').click();
        await s(450);
        for (const v of vars) {
            const chip = root.querySelector('[data-hmc-variable="' + v + '"]');
            if (chip) chip.click();
            await s(250);
        }
        await s(700);
        const card = root.querySelector('.ps-hmc-result');
        const out = { has: card ? !!card.querySelector('.ps-hmc-tip') : null,
                      next: card
                          ? card.querySelectorAll('.ps-hmc-nextlink').length : 0,
                      label: card ? (card.querySelector('h3')||{}).textContent : null };
        document.getElementById('ps-help-choose-close').click();
        await s(400);
        return out;
    }
    // One categorical: nothing to put in a second slot, so no tip.
    const one = await run(['condition', 'score']);
    // Two categoricals: the tip is exactly the decision facing the user.
    const two = await run(['condition', 'site', 'score']);
    return { one, two };
});
ok(d.one.has === false,
   `with ONE categorical there is nothing to decide, so no tip is shown ` +
   `(${d.one.label})`);
ok(d.two.has === true,
   `with TWO there is, so it appears (${d.two.label})`);
ok(d.one.next === 2 && d.two.next === 2,
   `while the closing pointer is on both, because the wizard should never ` +
   `dead-end (${d.one.next}, ${d.two.next})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('WIZARD PARITY CHECK PASS');
await browser.close();
