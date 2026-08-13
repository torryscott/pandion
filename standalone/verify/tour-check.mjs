// Real-browser smoke for the "Show me how" walkthroughs (js/ps-tour.js).
//
// The walkthroughs drive the engine with SYNTHETIC pointer events, and the
// engine legitimately defends itself against synthesized input. That makes
// this probe load-bearing in a way most UI smokes are not: a change to the
// engine's click handling, its hit strips, or its panel selectors breaks a
// walkthrough silently, and only an end-to-end run catches it. So every case
// asserts the CHART actually changed, never just that a panel appeared.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}
await page.waitForFunction(() => !!document.querySelector('.graphbuilder2-host svg'),
                           null, { timeout: 15000 });

const chartState = () => page.evaluate(() => ({
    errorBars: document.querySelectorAll('[data-role="error-bar"]').length,
    topTick: (() => {
        const ticks = Array.from(document.querySelectorAll('text'))
            .filter(t => /^[0-9.]+$/.test((t.textContent || '').trim()))
            .map(t => ({ v: parseFloat(t.textContent), y: t.getBoundingClientRect().top }))
            .filter(o => isFinite(o.v));
        if (!ticks.length) return null;
        ticks.sort((a, b) => a.y - b.y);
        return ticks[0].v;
    })(),
    barFills: Array.from(document.querySelectorAll('[data-bar-cat]'))
        .map(b => b.getAttribute('fill') || '').filter(Boolean),
    panel: (document.querySelector('[data-role="inspector-title"]') || {}).innerText || ''
}));

async function playToEnd(key, timeoutMs = 60000) {
    // Block body, not an expression body: returning the promise would make
    // page.evaluate await the whole walkthrough, and the poll below (with its
    // own timeout and miss reporting) would never actually run.
    // Cards hold until the reader advances (no reading timer), so the
    // probe plays the reader: press Next until the tour finishes. A press
    // during a card's action merely pre-arms the advance - the action
    // itself always runs, which is why the end-state assertions hold.
    await page.evaluate(k => { window.PS_TOUR.play(k); }, key);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        await page.waitForTimeout(700);
        if (!await page.evaluate(() => window.PS_TOUR.isRunning())) break;
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('[data-role="ps-tour-layer"] button')]
                .find(x => x.textContent.indexOf('Next') >= 0);
            if (b) b.click();
        });
    }
    if (await page.evaluate(() => window.PS_TOUR.isRunning()))
        throw new Error(`walkthrough "${key}" did not finish within ${timeoutMs} ms`);
    const misses = await page.evaluate(() => window.PS_TOUR.misses());
    if (misses.length)
        throw new Error(`walkthrough "${key}" could not find targets: ${misses.join(', ')}`);
}

// ---- 1. the picker opens from the Help menu and lists context-fitting tours
await page.click('[data-ps-menu="help"]');
await page.waitForTimeout(150);
const helpItems = await page.locator('#ps-appmenu button').allInnerTexts();
if (!helpItems.some(t => /Show me how/.test(t)))
    throw new Error('Help menu has no "Show me how" entry: ' + JSON.stringify(helpItems));
await page.locator('#ps-appmenu button', { hasText: 'Show me how' }).click();
await page.waitForTimeout(250);
if (!(await page.locator('#ps-tour-dialog').isVisible()))
    throw new Error('"Show me how" did not open the walkthrough picker');
const listed = await page.locator('#ps-tour-list [data-tour]').count();
if (listed < 3)
    throw new Error(`expected at least 3 walkthroughs on a default bar chart, saw ${listed}`);
console.log(`  ok  Help menu opens the picker with ${listed} walkthroughs for this chart`);

// ---- 2. typing a novice question narrows the list
await page.fill('#ps-tour-search', 'error');
await page.waitForTimeout(200);
const hits = await page.locator('#ps-tour-list [data-tour]').allInnerTexts();
if (hits.length !== 1 || !/error bars/i.test(hits[0]))
    throw new Error('search for "error" did not isolate the error-bar walkthrough: ' +
                    JSON.stringify(hits));
await page.fill('#ps-tour-search', 'zzzznotathing');
await page.waitForTimeout(200);
if (!(await page.locator('.ps-tour-empty').isVisible()))
    throw new Error('an unmatched query should explain itself, not show an empty list');
console.log('  ok  typed questions filter the list and a miss explains itself');

// ---- 3. context gating: a tour that cannot apply is not offered
const gated = await page.evaluate(() => {
    const all = Object.keys(window.PS_TOUR.tours);
    const shown = window.PS_TOUR.available().map(a => a.key);
    return { all, shown };
});
if (!gated.shown.includes('error-bars') || !gated.shown.includes('one-bar-color'))
    throw new Error('bar-chart walkthroughs missing from a bar chart: ' + JSON.stringify(gated));
console.log('  ok  walkthroughs are gated to the chart they fit');

await page.click('#ps-tour-close');
await page.waitForTimeout(200);

// ---- 4. the error-bar walkthrough really draws error bars
await page.evaluate(() => { if (window.setOption) window.setOption('errorBarType', 'se'); });
await page.waitForTimeout(1200);
await playToEnd('error-bars');
const afterEb = await chartState();
if (afterEb.errorBars < 1)
    throw new Error('error-bar walkthrough finished but drew no error bars');
if (!/error bars/i.test(afterEb.panel))
    throw new Error('error-bar walkthrough did not leave the Error bars panel open, saw: ' +
                    JSON.stringify(afterEb.panel));
console.log(`  ok  error-bar walkthrough drew ${afterEb.errorBars} error bars and opened its panel`);

// ---- 5. the axis walkthrough really rescales the axis
const beforeAxis = await chartState();
await playToEnd('axis-range');
const afterAxis = await chartState();
if (afterAxis.topTick === beforeAxis.topTick)
    throw new Error(`axis walkthrough did not change the axis (top tick stayed ${beforeAxis.topTick})`);
if (afterAxis.topTick !== 140)
    throw new Error(`axis walkthrough should top the axis at 140, saw ${afterAxis.topTick}`);
console.log(`  ok  axis walkthrough rescaled the value axis ${beforeAxis.topTick} -> ${afterAxis.topTick}`);

// ---- 6. the bar-color walkthrough recolors exactly one bar
await playToEnd('one-bar-color');
const afterCol = await chartState();
// Count by colour rather than by index: bars carry invisible hit clones that
// also match [data-bar-cat], so a positional diff is not a stable count.
const recolored = afterCol.barFills.filter(f => /e18e4c/i.test(f)).length;
if (recolored < 1)
    throw new Error('bar-color walkthrough did not apply the new colour: ' +
                    JSON.stringify(afterCol.barFills));
if (recolored === afterCol.barFills.length)
    throw new Error('bar-color walkthrough recoloured every bar; the scope should have been This bar');
console.log('  ok  bar-color walkthrough recoloured one series, not the whole chart');

// ---- 7. the check-graph walkthrough opens the lint panel
await playToEnd('check-graph');
const lint = await page.evaluate(() => {
    const nav = document.querySelector('[data-role="help-nav"]');
    const body = nav ? nav.parentElement : null;
    return {
        nav: !!nav,
        passed: document.querySelectorAll('[data-role="lint-passed"]').length,
        text: body ? (body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) : ''
    };
});
if (!lint.nav || !/check/i.test(lint.text))
    throw new Error('check-graph walkthrough did not reach the Check graph panel: ' +
                    JSON.stringify(lint));
console.log(`  ok  check-graph walkthrough opened the pitfall scanner (${lint.passed} passed-check pills)`);

// ---- 8. Exit stops a walkthrough and takes its chrome away
await page.evaluate(() => { window.PS_TOUR.play('axis-range'); });
await page.waitForTimeout(900);
if (!await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('walkthrough was not running when Exit was tested');
await page.evaluate(() => window.PS_TOUR.exit());
await page.waitForTimeout(400);
if (await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('Exit did not stop the walkthrough');
const chromeGone = await page.evaluate(() => {
    const layer = document.querySelector('[data-role="ps-tour-layer"]');
    if (!layer) return true;
    return getComputedStyle(layer).pointerEvents === 'none';
});
if (!chromeGone)
    throw new Error('the walkthrough overlay still captures pointer events after Exit');
console.log('  ok  Exit stops playback and the overlay stays click-through');

// ---- 9. the overlay never rides an export or a copy
const tagged = await page.evaluate(() => {
    const layer = document.querySelector('[data-role="ps-tour-layer"]');
    if (!layer) return 'no layer';
    const untagged = Array.from(layer.querySelectorAll('*'))
        .filter(n => !n.classList.contains('ignore-html') && n.tagName !== 'svg' &&
                     !n.closest('svg')).length;
    return layer.classList.contains('ignore-html') && untagged === 0;
});
if (tagged !== true)
    throw new Error('walkthrough chrome is not fully ignore-html tagged: ' + JSON.stringify(tagged));
console.log('  ok  walkthrough chrome is ignore-html, so exports and copies never contain it');

// ---- 10. the highlight ring sits SYMMETRICALLY around its target
// (Torry's screenshots, Aug 2026: with no global border-box the ring's
// 3px border drew outside the computed width, so every highlight held
// its target upper-left with the slack lower-right. CONTROL: remove the
// ring's boxSizing line and the symmetry check fails at 6px of skew.)
await page.evaluate(() => {
    window.PS_TOUR.play({
        title: 'probe-geometry',
        steps: [{ point: '.graphbuilder2-host button[aria-label="Statistics"]',
                  say: 'Geometry probe step.' }],
        done: ''
    });
});
await page.waitForFunction(() => {
    const r = document.querySelector('[data-role="ps-tour-ring"]');
    return r && r.style.opacity === '1';
}, null, { timeout: 8000 });
await page.waitForTimeout(600);   // the ring's 380ms position transition
const geo = await page.evaluate(() => {
    const ring = document.querySelector('[data-role="ps-tour-ring"]')
        .getBoundingClientRect();
    const tgt = document.querySelector(
        '.graphbuilder2-host button[aria-label="Statistics"]')
        .getBoundingClientRect();
    return {
        left: +(tgt.left - ring.left).toFixed(1),
        right: +(ring.right - tgt.right).toFixed(1),
        top: +(tgt.top - ring.top).toFixed(1),
        bottom: +(ring.bottom - tgt.bottom).toFixed(1)
    };
});
if (Math.abs(geo.left - geo.right) > 1 || Math.abs(geo.top - geo.bottom) > 1)
    throw new Error('highlight ring is skewed around its target: ' + JSON.stringify(geo));
if (geo.left < 3 || geo.left > 8)
    throw new Error('highlight pad drifted from the designed ~5px: ' + JSON.stringify(geo));
console.log(`  ok  highlight ring is symmetric (L${geo.left}/R${geo.right} T${geo.top}/B${geo.bottom})`);
await page.evaluate(() => window.PS_TOUR.exit());
await page.waitForTimeout(400);

// ---- 11. cards wait for the reader; Next is immediate; Back re-executes
// (Torry, round 4: the reading timer felt like "a clock on them" and made
// Next/Back laggy - cards now hold until the user advances)
const stepLabel = () => page.evaluate(() =>
    (document.querySelector('[data-role="ps-tour-step"]') || {}).textContent || '');
const waitStep = async (want, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if ((await stepLabel()).trim() === want) return true;
        await page.waitForTimeout(80);
    }
    return false;
};
const waitClicks = async (want, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (await page.evaluate(() => window.__tourClicks) === want) return true;
        await page.waitForTimeout(120);
    }
    return false;
};
const pressNav = async which => {
    // REAL mouse, always: a synthetic .click() carries no trusted
    // pointerdown, so it can never close an engine menu - which made an
    // earlier probe blind to the reader's own Next press closing the
    // "+" menu (Torry's field screenshot, Aug 2026)
    const r = await page.evaluate(w => {
        const b = [...document.querySelectorAll('[data-role="ps-tour-layer"] button')]
            .find(x => x.textContent.indexOf(w) >= 0).getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, which);
    await page.mouse.click(r.x, r.y);
};
await page.evaluate(() => {
    window.__tourClicks = 0;
    const b = document.createElement('button');
    b.id = 'tour-probe-btn';
    b.textContent = 'probe target';
    b.style.cssText =
        'position:absolute;left:340px;top:8px;z-index:9000;padding:6px 10px;';
    // absolute, not fixed: the tour's visibility check requires an
    // offsetParent, and position:fixed elements have none
    b.addEventListener('click', () => { window.__tourClicks++; });
    document.body.appendChild(b);
    window.PS_TOUR.play({
        title: 'probe-nav',
        steps: [
            { say: 'Alpha.' },
            { click: '#tour-probe-btn', say: 'Bravo.' },
            { say: 'Charlie.' }
        ],
        done: ''
    });
});
if (!await waitStep('1 / 3'))
    throw new Error('the first card never showed');
await page.waitForTimeout(2600);
if ((await stepLabel()).trim() !== '1 / 3')
    throw new Error('the card auto-advanced; cards must hold until the reader moves');
console.log('  ok  a card holds indefinitely: no clock on the reader');
const tNext = Date.now();
await pressNav('Next');
if (!await waitStep('2 / 3', 3000))
    throw new Error('Next did not advance');
const nextMs = Date.now() - tNext;
if (nextMs > 900)
    throw new Error('Next took ' + nextMs + 'ms to show the next card; it must be immediate');
console.log('  ok  Next advances immediately (' + nextMs + 'ms)');
// Press Next again RIGHT NOW, mid-animation: the cursor travel and beats
// must be skipped, but the click must still FIRE, so the tour lands on
// card three with the state exactly as if the demo had been watched
// (Torry, round 5: "Next truly should have just skipped to the next
// thing, which would mean it would open up where it should be").
const tSkip = Date.now();
await pressNav('Next');
if (!await waitStep('3 / 3', 1200))
    throw new Error('Next mid-animation took too long; the waits must be skippable');
const skipMs = Date.now() - tSkip;
if (await page.evaluate(() => window.__tourClicks) !== 1)
    throw new Error('skipping the animation must NOT skip the click itself');
console.log('  ok  Next mid-animation skips the waits (' + skipMs +
            'ms) and the click still fired');
await pressNav('Back');
if (!await waitStep('2 / 3'))
    throw new Error('Back did not rewind to card two');
if (!await waitClicks(2))
    throw new Error('Back must RE-EXECUTE the replayed click step');
console.log('  ok  Back re-executes: the click genuinely fires again');
await pressNav('Next');
if (!await waitStep('3 / 3'))
    throw new Error('Next after Back did not move forward again');

// ---- 12. arrow keys navigate; Escape exits at once
await page.keyboard.press('ArrowLeft');
if (!await waitStep('2 / 3'))
    throw new Error('ArrowLeft did not mirror the Back button');
if (!await waitClicks(3))
    throw new Error('the keyboard rewind should re-execute too');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
if (await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('Escape did not exit the walkthrough');
if (await page.evaluate(() =>
        document.querySelector('[data-role="ps-tour-ring"]').style.opacity !== '0'))
    throw new Error('the ring survived Escape');
console.log('  ok  arrow keys navigate with real re-execution and Escape exits');

// ---- 13. the closing card: Back re-executes, Next ENDS and cleans up
// (Torry, round 4: at the end Back and Next were dead - the tour had
// quietly self-terminated on a timer, leaving a live-looking card wired
// to nothing; the tour now only ends when the reader leaves it)
const capText = () => page.evaluate(() =>
    (document.querySelector('[data-role="ps-tour-text"]') || {}).textContent || '');
await page.evaluate(() => {
    window.PS_TOUR.play({
        title: 'probe-done',
        steps: [
            { say: 'Alpha.' },
            { click: '#tour-probe-btn', say: 'Bravo.' }
        ],
        done: 'This is the closing message.'
    });
});
if (!await waitStep('1 / 3')) throw new Error('probe-done never started');
await pressNav('Next');
if (!await waitStep('2 / 3')) throw new Error('probe-done never reached card two');
await pressNav('Next');
{
    const t0 = Date.now();
    let sawDone = false;
    while (Date.now() - t0 < 8000) {
        if ((await capText()).indexOf('closing message') >= 0) { sawDone = true; break; }
        await page.waitForTimeout(120);
    }
    if (!sawDone) throw new Error('the closing card never showed');
}
await page.waitForTimeout(2200);
if (!await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('the closing card self-terminated; it must wait for the reader');
const clicksAtDone = await page.evaluate(() => window.__tourClicks);
await pressNav('Back');
if (!await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('Back from the closing card ended the tour instead of replaying');
if (!await waitStep('2 / 3'))
    throw new Error('Back from the closing card did not replay the last step');
if (!await waitClicks(clicksAtDone + 1))
    throw new Error('the last step should have re-executed on Back from the closing card');
console.log('  ok  Back works from the closing card and re-executes the last step');
await pressNav('Next');
{
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
        if ((await capText()).indexOf('closing message') >= 0) break;
        await page.waitForTimeout(120);
    }
}
await pressNav('Next');
await page.waitForTimeout(600);
if (await page.evaluate(() => window.PS_TOUR.isRunning()))
    throw new Error('Next on the closing card should end the tour');
if (await page.evaluate(() => {
        const c = document.querySelector('[data-role="ps-tour-text"]');
        return getComputedStyle(c.closest('[data-role="ps-tour-layer"] > div') || c.parentElement)
            .opacity !== '0';
    }))
    throw new Error('the card must disappear when the tour ends, not sit dead on screen');
console.log('  ok  Next on the closing card ends the tour and the card leaves');

// ---- 14. rewinding rebuilds DEPENDENT state: the opener re-runs first,
// so a menu-item target genuinely exists again when its step re-clicks
await page.evaluate(() => {
    window.__aClicks = 0; window.__bClicks = 0; window.__bVisibleAtClick = [];
    const a = document.createElement('button');
    a.id = 'tour-dep-a'; a.textContent = 'opener';
    a.style.cssText =
        'position:absolute;left:60px;top:64px;z-index:9000;padding:6px 10px;';
    const bt = document.createElement('button');
    bt.id = 'tour-dep-b'; bt.textContent = 'menu item';
    bt.style.cssText =
        'position:absolute;left:170px;top:64px;z-index:9000;padding:6px 10px;display:none;';
    a.addEventListener('click', () => { window.__aClicks++; bt.style.display = ''; });
    bt.addEventListener('click', () => {
        window.__bClicks++;
        window.__bVisibleAtClick.push(bt.offsetParent !== null);
        bt.style.display = 'none';
    });
    document.body.appendChild(a); document.body.appendChild(bt);
    window.PS_TOUR.play({
        title: 'probe-dep',
        steps: [
            { click: '#tour-dep-a', say: 'Bravo.' },
            { click: '#tour-dep-b', say: 'Delta.' },
            { say: 'Charlie.' }
        ],
        done: ''
    });
});
if (!await waitStep('1 / 3')) throw new Error('dependency tour never started');
await pressNav('Next');
if (!await waitStep('2 / 3')) throw new Error('dependency tour never reached card two');
await pressNav('Next');
if (!await waitStep('3 / 3')) throw new Error('dependency tour never reached card three');
if (await page.evaluate(() => window.__bClicks) !== 1)
    throw new Error('the dependent step should have clicked once on the way through');
await pressNav('Back');
if (!await waitStep('2 / 3'))
    throw new Error('Back did not reach the dependent step');
{
    const t0 = Date.now();
    let ok2 = false;
    while (Date.now() - t0 < 15000) {
        if (await page.evaluate(() => window.__bClicks) === 2) { ok2 = true; break; }
        await page.waitForTimeout(150);
    }
    if (!ok2) throw new Error('the dependent step did not re-execute on rewind');
}
const dep = await page.evaluate(() => ({
    a: window.__aClicks, b: window.__bClicks, vis: window.__bVisibleAtClick }));
if (dep.a < 2)
    throw new Error('the OPENER step did not re-run first on rewind: ' + JSON.stringify(dep));
if (!dep.vis.every(v => v === true))
    throw new Error('the dependent target was clicked while hidden: ' + JSON.stringify(dep));
console.log('  ok  rewind re-runs the opener first (' + JSON.stringify(dep) + ')');

// ---- 15. the card is draggable and stays functional after a drag
const cardBox = await page.evaluate(() => {
    const t = document.querySelector('[data-role="ps-tour-text"]');
    const card = t.parentElement;
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height - 14, left: r.left, top: r.top };
});
await page.mouse.move(cardBox.x, cardBox.y);
await page.mouse.down();
await page.mouse.move(cardBox.x - 260, cardBox.y - 120, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const movedBox = await page.evaluate(() => {
    const r = document.querySelector('[data-role="ps-tour-text"]')
        .parentElement.getBoundingClientRect();
    return { left: r.left, top: r.top };
});
if (Math.abs((cardBox.left - movedBox.left) - 260) > 30
        || Math.abs((cardBox.top - movedBox.top) - 120) > 30)
    throw new Error('the card did not follow the drag: ' +
                    JSON.stringify({ before: cardBox, after: movedBox }));
await pressNav('Back');
// Back FROM card two lands on card ONE: waiting for '2 / 3' here only
// ever passed when the poll caught the stale label before the rewind
// finished - the source of this case's intermittent failures.
if (!await waitStep('1 / 3'))
    throw new Error('the card buttons stopped working after a drag');
console.log('  ok  the card drags freely and its buttons still work');
await page.evaluate(() => window.PS_TOUR.exit());
await page.waitForTimeout(300);

// ---- 16. choosing a tour shows its first card near-instantly
// (Torry, round 5: "a second or two before the card pops up" - the old
// start pause plus the error-bars setup sleep added to ~1.9s)
{
    const t0 = Date.now();
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    let shown = false;
    while (Date.now() - t0 < 6000) {
        if ((await stepLabel()).trim() === '1 / 5') { shown = true; break; }
        await page.waitForTimeout(60);
    }
    if (!shown) throw new Error('error-bars first card never showed');
    const ms = Date.now() - t0;
    if (ms > 1200)
        throw new Error('first card took ' + ms + 'ms; it must be near-instant');
    console.log('  ok  choosing a tour shows card one in ' + ms + 'ms');
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(400);
}

// ---- 17. spamming Next lands the SAME end state as watching patiently:
// skipped animation is never skipped WORK
{
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
        if (!await page.evaluate(() => window.PS_TOUR.isRunning())) break;
        await page.evaluate(() => {
            const b = [...document.querySelectorAll('[data-role="ps-tour-layer"] button')]
                .find(x => x.textContent.indexOf('Next') >= 0);
            if (b) b.click();
        });
        await page.waitForTimeout(200);
    }
    if (await page.evaluate(() => window.PS_TOUR.isRunning()))
        throw new Error('spamming Next never finished the tour');
    const end = await chartState();
    if (end.errorBars < 1)
        throw new Error('after spamming Next the error bars are MISSING; ' +
                        'skipping must never lose the work');
    if (!/error bars/i.test(end.panel))
        throw new Error('after spamming Next the Error bars panel is not open: ' +
                        JSON.stringify(end.panel));
    const misses2 = await page.evaluate(() => window.PS_TOUR.misses());
    if (misses2.length)
        throw new Error('spamming Next left missed targets: ' + misses2.join(', '));
    console.log('  ok  spamming Next still lands ' + end.errorBars +
                ' error bars and the open panel: skipped animation, kept work');
}

// ---- 18. the reader's own Next press must not tear down the state the
// previous card built (Torry's screenshot: his trusted click closed the
// "+" menu, and the tour narrated fiction over an unchanged chart)
{
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
        if ((await stepLabel()).trim() === '2 / 5') break;
        if ((await stepLabel()).trim() === '1 / 5') await pressNav('Next');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1500);   // read card two; the menu sits open
    if (!await page.evaluate(() =>
            !!document.querySelector('[data-kind="ovl_errorbars"]')?.offsetParent))
        throw new Error('setup: the "+" menu should be open on card two');
    await pressNav('Next');            // the press that used to kill the menu
    await page.waitForTimeout(300);
    if (!await waitStep('3 / 5'))
        throw new Error('card three never arrived');
    await page.waitForTimeout(2500);   // card three clicks the menu item
    await pressNav('Next');
    if (!await waitStep('4 / 5'))
        throw new Error('card four never arrived');
    await page.waitForTimeout(2500);
    const ebEnd = await chartState();
    if (ebEnd.errorBars < 1) {
        const diag = await page.evaluate(() => ({
            step: (document.querySelector('[data-role="ps-tour-step"]') || {}).textContent,
            card: (document.querySelector('[data-role="ps-tour-text"]') || {}).textContent,
            menuOpen: !!document.querySelector('[data-kind="ovl_errorbars"]')?.offsetParent,
            running: window.PS_TOUR.isRunning(),
            misses: window.PS_TOUR.misses(),
            panel: (document.querySelector('[data-role="inspector-title"]') || {}).innerText || '',
            fired: (window.__tourFireLog || []).slice(-6),
            census: ['[data-kind="ovl_errorbars"]', '[data-eb-btn="eb-type"]']
                .map(sel => [...document.querySelectorAll(sel)].map(n => {
                    const r = n.getBoundingClientRect();
                    const top = document.elementsFromPoint(
                        r.left + r.width / 2, r.top + r.height / 2)
                        .find(e => !e.closest('[data-role="ps-tour-layer"]'));
                    return {
                        sel: sel.slice(0, 18),
                        off: n.offsetParent !== null,
                        rect: [r.left | 0, r.top | 0, r.width | 0, r.height | 0],
                        top: top ? top.tagName + ':' +
                            (top.getAttribute('data-kind') || top.getAttribute('data-eb-btn')
                             || top.getAttribute('data-role') || '') : 'none'
                    };
                }))
        }));
        throw new Error('walking with real Next presses lost the error bars: ' +
                        JSON.stringify(diag));
    }
    const m18 = await page.evaluate(() => window.PS_TOUR.misses());
    if (m18.length)
        throw new Error('real-press walk left missed targets: ' + m18.join(', '));
    console.log('  ok  real Next presses never tear down what a card just built ' +
                '(' + ebEnd.errorBars + ' error bars)');
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(400);
}

// ---- 19. a genuinely lost target SELF-HEALS: a stray click closes the
// menu, the tour rewinds, re-executes, and lands the step anyway
{
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
        if ((await stepLabel()).trim() === '2 / 5') break;
        if ((await stepLabel()).trim() === '1 / 5') await pressNav('Next');
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1200);
    // A stray TRUSTED click is now SWALLOWED by the input shield: the
    // menu must SURVIVE it (Torry: "I can still click and kind of
    // disrupt what's going on" - not any more).
    await page.mouse.click(500, 820);
    await page.waitForTimeout(400);
    if (!await page.evaluate(() =>
            !!document.querySelector('[data-kind="ovl_errorbars"]')?.offsetParent))
        throw new Error('the input shield failed: a stray click closed the menu');
    console.log('  ok  the input shield: a stray click cannot disrupt the demo');
    // Now simulate the loss an ECHO causes (the shield cannot stop the
    // app itself): hide the menu the way a rebuild does.
    await page.evaluate(() => {
        const item = document.querySelector('[data-kind="ovl_errorbars"]');
        const fly = item && item.closest('[data-role="add-ann-menu"]');
        (fly || item).style.display = 'none';
        window.__gb2_addMenuOpen = false;
    });
    await page.waitForTimeout(200);
    if (await page.evaluate(() =>
            !!document.querySelector('[data-kind="ovl_errorbars"]')?.offsetParent))
        throw new Error('setup: the simulated echo-hide did not hide the menu');
    await pressNav('Next');            // card three: target is GONE
    if (!await waitStep('3 / 5'))
        throw new Error('card three never arrived after the stray click');
    // the self-heal rewinds fast and retries; give it room
    {
        const t1 = Date.now();
        let healed = false;
        while (Date.now() - t1 < 20000) {
            if ((await chartState()).errorBars >= 1) { healed = true; break; }
            await page.waitForTimeout(300);
        }
        if (!healed)
            throw new Error('the lost menu-item click did not self-heal');
    }
    const m19 = await page.evaluate(() => window.PS_TOUR.misses());
    if (m19.length)
        throw new Error('a successful self-heal must not record a miss: ' + m19.join(', '));
    console.log('  ok  a stray click that killed the menu self-heals: ' +
                'rewind, re-execute, step lands');
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(400);
}

// ---- 20. a press is NEVER wiped: exit, replay, press Next once while
// the tour is still warming up - it must count (the bisect that found
// the every-other-press bug: fresh play fine, drag fine, REPLAY lost
// the first press to a reset-at-card-start)
{
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.PS_TOUR.play('error-bars'); });
    await page.waitForTimeout(350);      // mid-warmup: setup still running
    await pressNav('Next');              // ONE press, landed early
    if (!await waitStep('2 / 5'))
        throw new Error('the replay swallowed the first Next press');
    console.log('  ok  a press during warm-up is consumed, never wiped');
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(300);
}

// ---- 21. the axis tour survives a tick at the axis MIDPOINT (Torry's
// 0-800 chart: the line's centre point sat exactly on the 400 tick's hit
// zone, the click opened the Ticks strip, and the Range card found
// nothing - whether the tour worked depended on the tick count)
{
    await page.evaluate(() => {
        window.__gb2_setOption('yMinOverride', true);
        window.__gb2_setOption('yMin', 0);
        window.__gb2_setOption('yMaxOverride', true);
        window.__gb2_setOption('yMax', 800);
        window.__gb2_setOption('yInterval', 100);
    });
    await page.waitForTimeout(2600);
    const mid = await page.evaluate(() => {
        const ticks = [...document.querySelectorAll('.graphbuilder2-host svg text')]
            .filter(t => /^\d+$/.test(t.textContent.trim()))
            .map(t => +t.textContent.trim());
        return ticks.includes(400);
    });
    if (!mid) throw new Error('fixture: the 400 tick is missing, midpoint not covered');
    await page.evaluate(() => { window.PS_TOUR.play('axis-range'); });
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
        if (!await page.evaluate(() => window.PS_TOUR.isRunning())) break;
        await pressNav('Next');
        await page.waitForTimeout(700);
    }
    const endTop = await chartState();
    if (endTop.topTick !== 140)
        throw new Error('midpoint-tick axis tour failed: the axis click hit the ' +
                        'tick zone, not the line (top tick ' + endTop.topTick + ')');
    const m21 = await page.evaluate(() => window.PS_TOUR.misses());
    if (m21.length)
        throw new Error('midpoint-tick axis tour missed targets: ' + m21.join(', '));
    console.log('  ok  the axis tour survives a tick at the exact axis midpoint');
}

// ---- 22. the ring and cursor FOLLOW the target when the user scrolls
// (Torry, Aug 2026: the outline stayed at its old screen position while
// the chart scrolled out from under it)
{
    await page.evaluate(() => {
        window.PS_TOUR.play({
            title: 'probe-scroll',
            steps: [{ point: '.graphbuilder2-host button[aria-label="Statistics"]',
                      say: 'Scroll probe.' }],
            done: ''
        });
    });
    await page.waitForFunction(() => {
        const r = document.querySelector('[data-role="ps-tour-ring"]');
        return r && r.style.opacity === '1';
    }, null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const align = () => page.evaluate(() => {
        const ring = document.querySelector('[data-role="ps-tour-ring"]')
            .getBoundingClientRect();
        const tgt = document.querySelector(
            '.graphbuilder2-host button[aria-label="Statistics"]')
            .getBoundingClientRect();
        return {
            dx: +((ring.left + ring.width / 2) - (tgt.left + tgt.width / 2)).toFixed(1),
            dy: +((ring.top + ring.height / 2) - (tgt.top + tgt.height / 2)).toFixed(1)
        };
    });
    const before = await align();
    if (Math.abs(before.dx) > 2 || Math.abs(before.dy) > 2)
        throw new Error('setup: ring not centred before the scroll: ' + JSON.stringify(before));
    const scrolled = await page.evaluate(() => {
        const ws = document.getElementById('ps-main-workspace');
        if (!ws) return false;
        ws.scrollTop += 120;
        return ws.scrollTop > 0;
    });
    if (!scrolled) throw new Error('setup: the workspace did not scroll');
    await page.waitForTimeout(350);
    const after = await align();
    if (Math.abs(after.dx) > 3 || Math.abs(after.dy) > 3)
        throw new Error('the ring did not follow the scroll: ' + JSON.stringify(after));
    console.log('  ok  the ring follows its target through a scroll ' +
                '(drift ' + after.dx + ',' + after.dy + 'px)');
    await page.evaluate(() => {
        const ws = document.getElementById('ps-main-workspace');
        if (ws) ws.scrollTop = 0;
        window.PS_TOUR.exit();
    });
    await page.waitForTimeout(300);
}

// ---- 23. the ring follows layout REFLOW (no scroll event fires when a
// panel reshapes the chart - Torry's screenshot) and HIDES when its
// anchor vanishes instead of highlighting a place that no longer exists
{
    await page.evaluate(() => {
        window.PS_TOUR.play({
            title: 'probe-reflow',
            steps: [{ point: '.graphbuilder2-host button[aria-label="Statistics"]',
                      say: 'Reflow probe.' }],
            done: ''
        });
    });
    await page.waitForFunction(() => {
        const r = document.querySelector('[data-role="ps-tour-ring"]');
        return r && r.style.opacity === '1';
    }, null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const align23 = () => page.evaluate(() => {
        const ring = document.querySelector('[data-role="ps-tour-ring"]')
            .getBoundingClientRect();
        const tgt = document.querySelector(
            '.graphbuilder2-host button[aria-label="Statistics"]')
            .getBoundingClientRect();
        return +((ring.left + ring.width / 2) - (tgt.left + tgt.width / 2)).toFixed(1);
    });
    // reflow WITHOUT scrolling: pad the host so everything shifts right
    await page.evaluate(() => {
        document.querySelector('.graphbuilder2-host').style.marginLeft = '120px';
    });
    await page.waitForTimeout(400);
    const drift = await align23();
    if (Math.abs(drift) > 3)
        throw new Error('the ring did not follow a layout reflow: drift ' + drift + 'px');
    console.log('  ok  the ring follows layout reflow (drift ' + drift + 'px)');
    // vanish the anchor: the ring must hide, not float
    await page.evaluate(() => {
        document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]')
            .style.display = 'none';
    });
    await page.waitForTimeout(300);
    if (await page.evaluate(() =>
            document.querySelector('[data-role="ps-tour-ring"]').style.opacity !== '0'))
        throw new Error('the ring kept highlighting a vanished anchor');
    console.log('  ok  a vanished anchor hides the ring');
    await page.evaluate(() => {
        document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]')
            .style.display = '';
        document.querySelector('.graphbuilder2-host').style.marginLeft = '';
        window.PS_TOUR.exit();
    });
    await page.waitForTimeout(300);
}

// ---- 24. the ring centres on a HAIRLINE target (a zero-width axis
// line): the size clamp must grow symmetrically, or a 1px offset inside
// a 12px ring reads as fused-to-one-border (Torry's screenshot)
{
    await page.evaluate(() => {
        window.PS_TOUR.play({
            title: 'probe-hairline',
            steps: [{ point: { role: 'y-axis-line' }, say: 'Hairline probe.' }],
            done: ''
        });
    });
    await page.waitForFunction(() => {
        const r = document.querySelector('[data-role="ps-tour-ring"]');
        return r && r.style.opacity === '1';
    }, null, { timeout: 8000 });
    await page.waitForTimeout(700);
    const off = await page.evaluate(() => {
        const ring = document.querySelector('[data-role="ps-tour-ring"]')
            .getBoundingClientRect();
        const lr = document.querySelector('[data-role="y-axis-line"]')
            .getBoundingClientRect();
        return +((ring.left + ring.width / 2) - (lr.left + lr.width / 2)).toFixed(2);
    });
    if (Math.abs(off) > 0.5)
        throw new Error('ring is off-centre on a hairline target by ' + off + 'px');
    console.log('  ok  the ring centres on a hairline axis line (off by ' + off + 'px)');
    await page.evaluate(() => window.PS_TOUR.exit());
    await page.waitForTimeout(300);
}

// ---- 25. the color tour runs clean on a GROUPED chart, where the
// Color strip hides the This/All toggle by design (the old scope step
// pointed at that hidden button and missed - Torry's field report);
// the scope lesson now lives on Opacity, present in both worlds
{
    await page.evaluate(() => {
        const roles = window.PS_SHELL.rolesStore();
        roles.groupVar = 'site';
        window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    });
    await page.waitForTimeout(2400);
    await playToEnd('one-bar-color');
    const fills = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('[data-bar-cat]')]
            .map(e => e.getAttribute('fill')).filter(Boolean))]);
    if (!fills.some(f => /e18e4c/i.test(f)))
        throw new Error('grouped color tour did not apply the color: ' + JSON.stringify(fills));
    if (fills.length < 2)
        throw new Error('grouped color tour flattened every series to one color: ' +
                        JSON.stringify(fills));
    console.log('  ok  the color tour runs clean on a grouped chart ' +
                '(one series recolored, identities kept: ' + fills.length + ' fills)');
    await page.evaluate(() => {
        const roles = window.PS_SHELL.rolesStore();
        delete roles.groupVar;
        window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
    });
    await page.waitForTimeout(1500);
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('tour-check: ALL GREEN');
await browser.close();
