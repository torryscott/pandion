// likert: item means, their intervals, alpha and reverse scoring use the
// responses' own numbers when the responses are numbers. They used positions
// 1..k among the values that occur, so items coded 0 to 4 printed every mean
// one too high and a level nobody chose compressed the scale.
//   jamovi Descriptives on the items as coded:
//     l_num_0to4: 2.03, 1.90, 1.98, 1.82, 1.83; q1 95% CI [1.78, 2.28]; alpha .661
//     l_num_gap (1, 2, 4, 5 occur): 3.05, 3.07, 3.18, 3.45, 2.72; q1 [2.74, 3.36]; alpha .660
//   R, q5 reverse-scored on the 0 to 4 scale (4 - x): mean 2.17 [1.91, 2.42], alpha .327
export default async function ({ open, stats, choose, pane, rowOf, aria, lint, press, ok }) {
    const meansOf = p => ['q1', 'q2', 'q3', 'q4', 'q5'].map(q => { const r = rowOf(p, new RegExp('^' + q + '\\b')); return r[r.length - 2]; });

    let page = await open('l_num_0to4');
    await stats(page, 'means');
    let p = await pane(page);
    ok(meansOf(p).join(' ') === '2.03 1.90 1.98 1.82 1.83', 'items coded 0 to 4: means on the items\' own numbers', meansOf(p));
    ok(rowOf(p, /^q1\b/).includes('[1.78, 2.28]'), 'q1 interval [1.78, 2.28]', rowOf(p, /^q1\b/));
    ok(/items' own codes \(0 to 4\)/.test(p.notes) && !/1.5 coding/.test(p.notes), 'the footnote names the coding used', p.notes.slice(0, 200));
    await stats(page, 'alpha');
    ok(rowOf(await pane(page), /^\.\d\d/).includes('.66'), 'alpha .66, unchanged by a shift of the codes');
    await page.close();

    page = await open('l_num_gap');
    await stats(page, 'means');
    p = await pane(page);
    ok(meansOf(p).join(' ') === '3.05 3.07 3.18 3.45 2.72', 'a level nobody chose no longer compresses the scale', meansOf(p));
    ok(rowOf(p, /^q1\b/).includes('[2.74, 3.36]'), 'q1 interval [2.74, 3.36]');
    await stats(page, 'alpha');
    ok(rowOf(await pane(page), /^\.\d\d/).includes('.66'), 'alpha .66 on the codes 1, 2, 4, 5 (it was .68 on positions 1 to 4)');
    await page.close();

    // reverse scoring reflects around the two ends of the scale: 0 and 4
    page = await open('l_num_0to4', { chartSpec: JSON.stringify({ likertReverseItems: ['q5'] }) });
    await stats(page, 'means');
    p = await pane(page);
    const q5 = rowOf(p, /^q5\b/);
    ok(q5.includes('2.17') && q5.includes('[1.91, 2.42]'), 'q5 reverse-scored: 4 - x gives 2.17 [1.91, 2.42]', q5);
    ok(/reflected around 0 and 4/.test(p.notes), 'and the footnote says what it reflects around');
    await stats(page, 'alpha');
    ok(rowOf(await pane(page), /^\.\d\d/).includes('.33'), 'alpha with q5 reversed: .33 (R: .327)');
    await page.close();

    // text responses have no numbers of their own: positions 1..k, as before
    page = await open('l_text');
    await stats(page, 'means');
    p = await pane(page);
    ok(meansOf(p).join(' ') === '3.03 2.90 2.98 2.82 2.83', 'text responses keep the 1 to k coding', meansOf(p));
    ok(/coding/.test(p.notes) && !/own codes/.test(p.notes), 'and their footnote still says so');
    await page.close();

    // the means chart places each dot by the item's own number
    page = await open('l_num_0to4', { graphType: 'likertmeans' });
    const geo = await page.evaluate(() => {
        const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
        const ticks = {};
        svg.querySelectorAll('text').forEach(t => {
            const s = (t.textContent || '').trim();
            if (/^[0-4]$/.test(s)) { const r = t.getBoundingClientRect(); ticks[s] = r.x + r.width / 2; }
        });
        const dot = [...svg.querySelectorAll('[data-role="likert-dot"]')].find(d => d.getAttribute('data-item') === 'q1')
            || svg.querySelector('[data-role="likert-dot"]');
        const r = dot ? dot.getBoundingClientRect() : null;
        return { ticks, dot: r ? r.x + r.width / 2 : null };
    });
    ok(geo.dot !== null && geo.ticks['2'] !== undefined && geo.ticks['3'] !== undefined, 'the means chart drew its axis and dots', geo);
    const frac = (geo.dot - geo.ticks['2']) / (geo.ticks['3'] - geo.ticks['2']);
    ok(Math.abs(frac - 0.033) < 0.06, 'the q1 dot sits just right of the tick labelled 2 (its mean is 2.03)', { frac, geo });
    await page.close();
}
