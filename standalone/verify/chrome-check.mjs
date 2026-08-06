// Punch list 42a-g: the application-chrome polish cluster.
//
//   42a  user-select: none covered the app bar, status bar, tabs, grid and two
//        drag handles, so dragging across the inspector, navigator, workspace
//        title or a role card painted a browser text selection over application
//        chrome. It also broke a real gesture: copy-as-image bails on a
//        non-empty getSelection(), so a stray highlight silently disabled it.
//   42b  40 rules said cursor: pointer against 6 that said default, so the
//        cursor turned into a hand crossing from the File menu onto the command
//        bar. Desktop applications use the arrow on their own controls.
//   42c  tooltips were native title=: OS delay, OS font, unstylable, and never
//        shown on keyboard focus.
//   42d  the only scrollbar rule in the file HID the engine toolbar's, so the
//        technique was understood and never generalised.
//   42e  six italic sites on empty and missing states, and kbd as plain
//        monospace with no key cap.
//   42f  the marketing site's 1080px column and four dead .ps-head rules still
//        opened the stylesheet.
//   42g  under Windows High Contrast the three-pane structure disappeared,
//        since the panes are distinguished only by background plus a hairline.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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

const here = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(path.resolve(here, '..', 'index.html'), 'utf8');
const shellSrc = fs.readFileSync(path.resolve(here, '..', 'js', 'ps-shell.js'), 'utf8');

console.log('case 1: the dead page CSS is gone (42f)');
ok(!/\.ps-head \{/.test(src) && !/max-width: 1080px/.test(src),
   'the 1080px content column and the four .ps-head rules are deleted');

console.log('case 2: nothing in the app uses a native tooltip (42c)');
// "Builds" means SETS one, not mentions one. The shell has to keep matching
// the ENGINE's own native title in a selector - the engine is not ours to
// change, and rewriting that selector during the migration silently unhooked
// the export button until correctness-check caught it - so a bracketed
// [title="..."] is exempt and everything else is not.
const setsTitle = [...shellSrc.matchAll(/(?<![-\w[])title=\\?"/g)].length;
ok(setsTitle === 0,
   `the shell builds no native title attribute (${setsTitle}); the only ` +
   `title= left is the SELECTOR that matches the engine's own export button`);
ok(/\[title="Export plot"\]/.test(shellSrc),
   'and that selector is intact, so the engine button still opens the exporter');
const stray = [...src.matchAll(/\stitle="/g)].length;
ok(stray === 0, `and none survive in the markup (${stray})`);
ok(/\.title = /.test(shellSrc) === true &&
   [...shellSrc.matchAll(/(?<!document)\.title = /g)].length === 0,
   'the only .title assignment left is the document title');

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(here, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(900);
}

console.log('case 3: the tooltip is the app\'s own, and reaches the keyboard');
const box = await page.locator('#ps-load').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(700);
const tipped = await page.evaluate(() => {
    const t = document.getElementById('ps-tip');
    const r = t.getBoundingClientRect();
    return { open: t.getAttribute('data-open') === '1', text: t.textContent,
             onScreen: r.width > 0 && r.height > 0,
             role: t.getAttribute('role'),
             described: (document.getElementById('ps-load') || {})
                 .getAttribute('aria-describedby') };
});
ok(tipped.open && tipped.onScreen,
   `hovering a control shows the shell's tooltip ("${tipped.text}")`);
ok(tipped.role === 'tooltip' && tipped.described === 'ps-tip',
   `announced to assistive tech as well (role ${tipped.role}, ` +
   `aria-describedby ${tipped.described})`);
const styled = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('ps-tip'));
    return { font: cs.fontFamily, size: cs.fontSize, bg: cs.backgroundColor };
});
ok(/system|-apple|Segoe|Roboto|Helvetica|Arial/i.test(styled.font),
   `drawn in the app's own font rather than the OS default (${styled.font.slice(0, 40)})`);

// The half the native tooltip never did at all.
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
const kb = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-tip').removeAttribute('data-open');
    document.getElementById('ps-load').focus();
    await sleep(150);
    const t = document.getElementById('ps-tip');
    return { open: t.getAttribute('data-open') === '1', text: t.textContent };
});
ok(kb.open && kb.text,
   `keyboard focus shows it immediately, which the native tooltip never did ` +
   `("${kb.text}")`);
await page.evaluate(() => document.getElementById('ps-load').blur());
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.getElementById('ps-tip').getAttribute('data-open') !== '1'),
   'and it goes away with the focus');

console.log('case 4: app chrome is chrome, data is text (42a)');
const sel = await page.evaluate(() => {
    const g = s => {
        const n = document.querySelector(s);
        return n ? getComputedStyle(n).userSelect ||
                   getComputedStyle(n).webkitUserSelect : null;
    };
    return { appbar: g('.ps-appbar'), inspector: g('.ps-controls'),
             nav: g('.ps-project-panel'), roleCard: g('.ps-role-card'),
             cell: g('#ps-datagrid td'), input: g('#ps-variable-name') };
});
for (const k of ['appbar', 'inspector', 'nav', 'roleCard'])
    ok(sel[k] === 'none', `${k} is not selectable text (${sel[k]})`);
ok(sel.input === 'text' || sel.input === 'auto',
   `but an input still is (${sel.input})`);
ok(/::selection/.test(src), 'and a ::selection rule exists for what remains');

console.log('case 5: the cursor policy is a desktop one (42b)');
const cursors = await page.evaluate(() => {
    const g = s => {
        const n = document.querySelector(s);
        return n ? getComputedStyle(n).cursor : null;
    };
    return { command: g('#ps-export'), menu: g('[data-ps-menu="file"]'),
             chip: g('#ps-columns .ps-chip'),
             link: g('.ps-linklike') };
});
ok(cursors.command === 'default' && cursors.menu === 'default',
   `the app's own controls show the arrow (${cursors.command}, ${cursors.menu})`);
ok(cursors.chip === 'default' || cursors.chip === 'grab',
   `so do variable chips (${cursors.chip})`);
if (cursors.link)
    ok(cursors.link === 'pointer',
       `and the hand is reserved for the link-likes (${cursors.link})`);

console.log('case 6: scrollbars, key caps, italics, forced colors');
const bars = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.ps-project-panel'));
    return { width: cs.scrollbarWidth, color: cs.scrollbarColor };
});
ok(bars.width === 'thin',
   `overflow regions carry a thin themed scrollbar (${bars.width})`);
ok(/::-webkit-scrollbar-thumb/.test(src),
   'and a webkit thumb, so the 205px rail keeps its width on Windows');
const italics = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.ps-page *, #ps-welcome *')) {
        // The chart is the ENGINE's, and its placeholder prompts ("Click to
        // add title") are deliberately italic there. This is about the shell.
        if (el.closest('.graphbuilder2-host')) continue;
        // The ONE principled exception (Aug 6 2026): the layout text
        // panel's Italic toggle renders its I glyph in real italics - the
        // universal B/I editor convention, a glyph DEPICTING the style it
        // applies, not italic prose.
        if (el.closest('#ps-ltx-italic')) continue;
        if (getComputedStyle(el).fontStyle !== 'italic') continue;
        const t = (el.textContent || '').trim();
        if (t) out.push(t.slice(0, 30));
    }
    return out;
});
ok(italics.length === 0,
   `no italic UI text is rendered (${JSON.stringify(italics.slice(0, 3))})`);
ok(/\.ps-shortcut-list kbd \{[^}]*border-bottom-width/.test(src),
   'kbd renders as a key cap rather than plain monospace');
// Source greps are the wrong instrument here: the first version of this check
// matched the #ps-tip forced-colors block and PASSED with the pane handling
// removed. Emulate the mode and measure what the panes actually get.
{
    const hc = await browser.newContext({ forcedColors: 'active',
                                          viewport: { width: 1400, height: 900 } });
    const hp = await hc.newPage();
    await hp.goto(pageUrl);
    await hp.waitForTimeout(700);
    if (await hp.locator('#ps-welcome').isVisible()) {
        await hp.click('#ps-welcome-sample');
        await hp.waitForTimeout(900);
    }
    // Measured rather than assumed: the pane BORDERS survive on their own
    // (forced-colors forces the colour and keeps the width), so asserting on
    // them can never fail and the first version of this check duly passed with
    // the whole fix removed. What actually flattens is everything told apart
    // by BACKGROUND alone.
    const hi = await hp.evaluate(() => {
        const g = n => {
            const c = getComputedStyle(n);
            return { bg: c.backgroundColor, color: c.color,
                     border: parseFloat(c.borderWidth) || 0 };
        };
        const btns = Array.from(document.querySelectorAll('[data-ps-workspace]'));
        const sel = btns.filter(b => b.getAttribute('aria-current') === 'page')[0];
        const un = btns.filter(b => b.getAttribute('aria-current') !== 'page')[0];
        const prim = document.querySelector('.ps-command-primary');
        const plain = document.querySelector('#ps-load');
        return {
            active: matchMedia('(forced-colors: active)').matches,
            sel: sel ? g(sel) : null, un: un ? g(un) : null,
            prim: prim ? g(prim) : null, plain: plain ? g(plain) : null,
            scrim: getComputedStyle(
                document.getElementById('ps-narrow-scrim')).backgroundColor
        };
    });
    ok(hi.active, 'setup: forced colors really is on');
    ok(hi.sel && hi.un && (hi.sel.bg !== hi.un.bg || hi.sel.color !== hi.un.color),
       `the SELECTED workspace is still distinguishable, which it is not when ` +
       `the distinction is a background tint ` +
       `(${hi.sel.bg} vs ${hi.un.bg})`);
    ok(hi.prim && hi.plain && hi.prim.border > hi.plain.border,
       `and the primary action still reads as primary, by weight rather than ` +
       `by an accent fill that forced colors discards ` +
       `(${hi.prim.border}px vs ${hi.plain.border}px)`);
    ok(/^rgb\(/.test(hi.scrim),
       `the modal scrim is opaque rather than a translucent white over a ` +
       `white canvas (${hi.scrim})`);
    await hc.close();
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHROME CHECK PASS');
await browser.close();
