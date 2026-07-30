import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(websiteDir);
const read = relative => readFileSync(path.join(rootDir, relative), 'utf8');
let failures = 0;

function check(condition, message) {
    if (condition) {
        console.log('  ok  ' + message);
    } else {
        failures++;
        console.error('  FAIL ' + message);
    }
}

const publicPages = [
    'website/index.html',
    'website/gallery.html',
    'website/download.html',
    'website/about.html',
    'website/support.html',
    'website/accessibility.html',
];

for (const file of publicPages) {
    const html = read(file);
    check(
        /<body>\s*<a class="skip-link" href="#main-content">Skip to main content<\/a>/.test(html),
        file + ' starts with the shared skip link',
    );
    check(
        /<main id="main-content" tabindex="-1">/.test(html),
        file + ' provides a programmatically focusable skip-link target',
    );
}

const sharedCss = read('website/assets/site-nav.css');
check(
    /\.skip-link:focus\s*\{\s*transform:\s*none/.test(sharedCss),
    'the shared skip link becomes visible on focus',
);

const home = read('website/index.html');
check(!/href="#"/.test(home), 'the homepage contains no top-of-page dead links');
for (const file of publicPages) {
    const html = read(file);
    check(
        /<footer>[\s\S]*?href="accessibility\.html"[\s\S]*?<\/footer>/.test(html),
        file + ' links to the accessibility statement from its footer',
    );
    const header = (html.match(/<header[\s\S]*?<\/header>/) || [''])[0];
    check(
        !/href="accessibility\.html"/.test(header),
        file + ' keeps Accessibility in the footer rather than the primary navigation',
    );
}

const accessibility = read('website/accessibility.html');
check(
    /mailto:contact@pandionplots\.com/.test(accessibility),
    'the accessibility statement publishes the product contact',
);
check(
    !/government affiliation/i.test(accessibility),
    'the public accessibility statement does not introduce irrelevant government-affiliation language',
);
check(
    !/required use in a course/i.test(accessibility),
    'the public accessibility statement stays focused on the product rather than institutional-use policy',
);

const notFound = read('website/404.html');
check(/<main class="box">/.test(notFound), 'the 404 content uses a main landmark');
check(
    /\.links a:focus-visible\s*\{[^}]*outline:/s.test(notFound),
    'the 404 recovery links have an explicit focus indicator',
);

const about = read('website/about.html');
check(
    /\.about-grid > \*, \.prose\s*\{\s*min-width:\s*0/.test(about),
    'About allows grid children to shrink at the reflow width',
);
check(
    /@media \(max-width: 520px\)[\s\S]*?\.cite-format-control, \.cite-actions[\s\S]*?flex-wrap:\s*wrap/.test(about),
    'About wraps citation controls at narrow widths',
);

const guide = read('docs/user-guide.html');
const deployedGuide = read('website/docs/index.html');
check(guide === deployedGuide, 'the deployed guide matches its canonical source');
check(
    /<a class="skip-link" href="#content">Skip to guide content<\/a>/.test(guide) &&
    /<main id="content" tabindex="-1">/.test(guide),
    'the guide starts with a content skip link and focusable target',
);
check(
    /id="hamb"[^>]*aria-label="Guide contents"[^>]*aria-controls="sidebar"[^>]*aria-expanded="false"/.test(guide),
    'the guide drawer trigger exposes its controlled and expanded state',
);
check(
    /id="navsearch"[^>]*aria-controls="searchhits"[^>]*aria-describedby="search-status"/s.test(guide) &&
    !/id="navsearch"[^>]*aria-expanded=/s.test(guide),
    'guide search controls a named results region without invalid searchbox state',
);
check(
    /id="search-status" role="status" aria-live="polite"/.test(guide),
    'guide search has a live status message',
);
check(
    /id="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title"/.test(guide) &&
    /id="lightbox-close"[^>]*aria-label="Close enlarged image"/.test(guide),
    'the guide lightbox is a labelled modal with an explicit close button',
);
check(
    /button\.className='enlarge-button'/.test(guide) &&
    /button\.addEventListener\('click'/.test(guide),
    'guide screenshots are promoted to native keyboard buttons',
);
check(
    /sb\.setAttribute\('inert',''\)/.test(guide) &&
    /hamb\.setAttribute\('aria-expanded','false'\)/.test(guide) &&
    /if\(e\.key==='Escape'&&sb\.classList\.contains\('open'\)/.test(guide),
    'the closed mobile guide drawer is inert and supports Escape',
);
check(
    /setSearchOpen\(true,found\.length/.test(guide) &&
    /Press Tab to move through the results/.test(guide) &&
    /e\.key==='ArrowDown'/.test(guide),
    'guide search announces results and supports Tab or Arrow navigation',
);

const scripts = [...guide.matchAll(/<script>([\s\S]*?)<\/script>/g)];
check(scripts.length === 1, 'the guide contains one inline behavior script');
if (scripts.length === 1) {
    try {
        new Function(scripts[0][1]);
        check(true, 'the guide behavior script compiles');
    } catch (error) {
        check(false, 'the guide behavior script compiles: ' + error.message);
    }
}

function variables(block) {
    return Object.fromEntries(
        [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)]
            .map(match => [match[1], match[2]]),
    );
}

function luminance(hex) {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = rgb.map(value =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
    const a = luminance(first);
    const b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const lightMatch = guide.match(/:root\{([^}]+)\}/);
const darkMatch = guide.match(/\[data-theme="dark"\]\{([^}]+)\}/);
check(Boolean(lightMatch && darkMatch), 'guide color-token blocks are present');
if (lightMatch && darkMatch) {
    const themes = [
        ['light', variables(lightMatch[1]), [
            ['ink3', 'bg'], ['ink3', 'bg2'], ['ink3', 'bg3'], ['ink3', 'card'],
            ['blue', 'bg'], ['blue', 'blue-soft'],
            ['amber', 'amber-soft'], ['red', 'red-soft'], ['green', 'green-soft'],
        ]],
        ['dark', variables(darkMatch[1]), [
            ['ink3', 'bg'], ['ink3', 'bg2'], ['ink3', 'bg3'], ['ink3', 'card'],
            ['blue', 'bg'], ['blue', 'blue-soft'],
            ['amber', 'amber-soft'], ['red', 'red-soft'], ['green', 'green-soft'],
        ]],
    ];
    for (const [name, tokens, pairs] of themes) {
        for (const [foreground, background] of pairs) {
            const ratio = contrast(tokens[foreground], tokens[background]);
            check(
                ratio >= 4.5,
                `${name} ${foreground} on ${background} contrast is ${ratio.toFixed(2)}:1`,
            );
        }
    }
}

if (failures) {
    console.error(`\nWEBSITE ACCESSIBILITY CONTRACT: ${failures} FAILURE(S)`);
    process.exit(1);
}
console.log('\nWEBSITE ACCESSIBILITY CONTRACT: PASS');
