// Punch list 24, 31, 32 and 33: the design-token layer and its consequences.
//
//   24  no :root block and exactly one custom property: 388 distinct hex
//       literals across 745 occurrences, 134 of them near-neutral light values
//       used once or twice. The site can only drift as far as its eight tokens
//       allow; this file could drift anywhere.
//   31  five modal treatments, four scrims, five radii, five shadows, at
//       marketing-scale elevation, for the same conceptual object.
//   32  21 font sizes with five half-pixel tiers, 12 radii, and a majority at
//       6px or larger against an engine that speaks 3-4px in the same window.
//   33  secondary text at 2.4-3.2:1 on white, at sizes the site never
//       approaches. The engine was already swept to a #666 minimum.
//
// Two of these are checkable from the stylesheet source (governance) and two
// only from the rendered page (contrast, on real backgrounds rather than an
// assumed white). This probe does both, because the source check is what stops
// the drift returning and the rendered check is what proves it was a fix.
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

// ------------------------------------------------------------ source, once
// Read the DEV stylesheet even under PS_PAGE: the dist inlines this same file,
// so checking it twice would say the same thing twice.
const src = fs.readFileSync(path.resolve(
    new URL('.', import.meta.url).pathname, '..', 'index.html'), 'utf8');
const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const body = css.slice(css.indexOf('}', css.indexOf(':root {')));

console.log('case 1: there is a token layer, and it is used');
const tokens = [...rootBlock.matchAll(/--ps-[\w-]+/g)].map(m => m[0]);
ok(tokens.length >= 40,
   `a :root block declares the app's vocabulary (${tokens.length} tokens, ` +
   `was 1 custom property in the whole file)`);
const uses = (body.match(/var\(--ps-/g) || []).length;
ok(uses > 380, `and the stylesheet actually speaks it (${uses} uses)`);
const hexes = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
const distinct = new Set(hexes);
ok(distinct.size < 200,
   `the hex literals are down from 388 distinct to ${distinct.size} ` +
   `(${hexes.length} occurrences, was 745)`);

// The app and the site must not drift apart, so the shared names carry the
// SAME values the website declares.
for (const [name, value] of [['--ps-navy', '#192E49'], ['--ps-ink', '#22364d'],
                             ['--ps-muted', '#5f6f80']]) {
    ok(new RegExp(name + ':\\s*' + value, 'i').test(rootBlock),
       `${name} holds the website's own value (${value})`);
}

console.log('case 2: one modal treatment, at a native-app elevation');
const bigShadows = (body.match(/box-shadow\s*:\s*([^;]+)/g) || [])
    .map(s => s.replace(/box-shadow\s*:\s*/, ''))
    .filter(v => !/inset/.test(v) && !/var\(/.test(v))
    .filter(v => (v.match(/(\d+(?:\.\d+)?)px/g) || [])
        .some(px => parseFloat(px) >= 20));
ok(bigShadows.length === 0,
   `no modal-scale shadow is written as a literal any more ` +
   `(${JSON.stringify(bigShadows.slice(0, 2))})`);
ok(/--ps-e-3:\s*0 8px 24px/.test(rootBlock),
   'and the one that remains is on the native-app scale, not 0 24px 70px');
// Every modal card shares the radius token.
for (const sel of ['.ps-loader-card', '.ps-export-card', '.ps-dialog-card',
                   '.ps-welcome-card', '.ps-command-palette-card']) {
    const rule = body.slice(body.indexOf('\n  ' + sel + ' {'));
    const decl = rule.slice(0, rule.indexOf('}'));
    ok(/border-radius:\s*var\(--ps-r-lg\)/.test(decl),
       `${sel} takes its radius from the scale`);
}
const scrims = new Set((body.match(/rgba\((?:1[0-9]|2[0-9]|3[0-9]|0)[^)]*0\.[34][0-9]?\)/g) || []));
ok(!/rgba\(0,0,0,0\.45\)/.test(body) && !/rgba\(35,44,55,0\.3/.test(body),
   `the four modal scrims are one token (${scrims.size} dark-alpha literals left)`);

console.log('case 3: the type and radius vocabularies are bounded');
const sizes = [...new Set((body.match(/font-size\s*:\s*([\d.]+)px/g) || [])
    .map(s => parseFloat(s.replace(/[^\d.]/g, ''))))].sort((a, b) => a - b);
ok(!sizes.some(v => v < 10),
   `nothing is set below 10px any more (smallest ${sizes[0]}px, was 8.5px)`);
ok(!/border-radius:\s*17px/.test(body),
   'the 17px pill is gone');

console.log('case 4: rendered contrast, on real backgrounds');
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);

// The measurement walks the LIVE DOM and composites each text node's actual
// background up the ancestor chain. An assumed-white check is what produced
// the first, wrong version of this fix: it "failed" the coach mark's near-white
// title, which sits on navy, and raising it made the card unreadable.
const measure = () => page.evaluate(() => {
    function parse(c) {
        const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3],
                 a: m[4] === undefined ? 1 : +m[4] };
    }
    function over(fg, bg) {
        const a = fg.a;
        return { r: fg.r * a + bg.r * (1 - a),
                 g: fg.g * a + bg.g * (1 - a),
                 b: fg.b * a + bg.b * (1 - a), a: 1 };
    }
    function lum(c) {
        const f = u => { u /= 255; return u <= 0.03928 ? u / 12.92
            : Math.pow((u + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    function bgOf(el) {
        let acc = { r: 255, g: 255, b: 255, a: 1 }, chain = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c && c.a > 0) chain.push(c);
        }
        for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc);
        return acc;
    }
    const bad = [];
    const nodes = document.querySelectorAll(
        '.ps-page *, #ps-welcome *, .ps-shell-dialog *, #ps-coach *');
    for (const el of nodes) {
        if (el.children.length && !Array.from(el.childNodes)
                .some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const text = (el.textContent || '').trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const fg = parse(cs.color);
        if (!fg) continue;
        const bg = bgOf(el);
        const composed = fg.a < 1 ? over(fg, bg) : fg;
        const L1 = lum(composed), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const px = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        // WCAG large text: 18.66px, or 14px bold.
        const need = (px >= 18.66 || (bold && px >= 14)) ? 3 : 4.5;
        if (ratio < need - 0.05)
            bad.push({ text: text.slice(0, 34), ratio: +ratio.toFixed(2),
                       px, need, color: cs.color,
                       cls: (el.className || '').toString().slice(0, 34) });
    }
    return bad;
});

// Measure the surfaces a student actually meets.
let all = [];
all = all.concat((await measure()).map(b => ({ ...b, where: 'start centre' })));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1200);
all = all.concat((await measure()).map(b => ({ ...b, where: 'chart' })));
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(600);
all = all.concat((await measure()).map(b => ({ ...b, where: 'data' })));

// Dedupe by the colour and class that produced it: one CSS rule, one finding.
const seen = new Set(), uniq = [];
for (const b of all) {
    const k = b.color + '|' + b.cls;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(b);
}
uniq.sort((a, b) => a.ratio - b.ratio);
if (uniq.length)
    console.log('    remaining below AA:\n' + uniq.slice(0, 12).map(b =>
        `      ${String(b.ratio).padStart(5)}:1 need ${b.need} at ${b.px}px  ` +
        `${b.color}  ${b.cls}  "${b.text}"`).join('\n'));
ok(uniq.length === 0,
   `every text node in the app meets its WCAG AA ratio on its REAL ` +
   `background (${uniq.length} failures across ${seen.size} rules)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TOKENS CHECK PASS');
await browser.close();
