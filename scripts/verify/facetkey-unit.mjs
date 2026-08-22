// The facet-key split is pure and decides which panel every category
// belongs to, so it is unit-testable on its own. Extract the three
// helpers from the source bundle and exercise both hostile shapes:
// a CATEGORY containing the separator (the first-separator convention
// got this right, the last-separator one did not) and a FACET LEVEL
// containing it (the other way round). One helper must get both.
import { readFileSync } from 'node:fs';

// Reads the SOURCE bundle on purpose (the catstride-unit idiom): the
// minifier mangles local function names, so name-based extraction only
// works pre-minify. The end-to-end behaviour runs on BOTH bundles in
// facetsep-client-check.mjs.
const SRC = process.env.GB2_SRC || 'inst/widget/graphbuilder2.js';
const src = readFileSync(SRC, 'utf8');

// Pull the three declarations out by brace matching from each name.
function extract(name) {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('not found: ' + name);
    let i = src.indexOf('{', at), depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (!depth) return src.slice(at, j + 1); }
    }
    throw new Error('unbalanced: ' + name);
}
const body = ['_gb2FacetPrefixLen', '_gb2FacetOfKey', '_gb2CatOfKey'].map(extract).join('\n');
const { facetOf, catOf } = new Function(body +
    '\nreturn { facetOf: _gb2FacetOfKey, catOf: _gb2CatOfKey };')();

const SEP = ' ¦ ';
let fails = 0;
function eq(got, want, what) {
    if (got === want) return;
    fails++;
    console.log(`  FAIL ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}

// 1. Ordinary keys: one separator, nothing exotic.
eq(facetOf('F1' + SEP + 'A', SEP, ['F1', 'F2']), 'F1', 'plain facet');
eq(catOf('F1' + SEP + 'A', SEP, ['F1', 'F2']), 'A', 'plain category');

// 2. A CATEGORY that contains the separator.
const hostileCat = 'A' + SEP + 'B';
eq(facetOf('F1' + SEP + hostileCat, SEP, ['F1', 'F2']), 'F1', 'facet beside hostile category');
eq(catOf('F1' + SEP + hostileCat, SEP, ['F1', 'F2']), hostileCat, 'hostile category survives');

// 3. A FACET LEVEL that contains the separator -- the mirror case.
const hostileLv = 'North' + SEP + 'East';
eq(facetOf(hostileLv + SEP + 'A', SEP, [hostileLv, 'South']), hostileLv, 'hostile facet level');
eq(catOf(hostileLv + SEP + 'A', SEP, [hostileLv, 'South']), 'A', 'category beside hostile level');

// 4. Both at once.
eq(facetOf(hostileLv + SEP + hostileCat, SEP, [hostileLv]), hostileLv, 'both hostile: facet');
eq(catOf(hostileLv + SEP + hostileCat, SEP, [hostileLv]), hostileCat, 'both hostile: category');

// 5. A level that is a prefix of another level: the longest wins.
eq(facetOf('A' + SEP + 'B' + SEP + 'c', SEP, ['A', 'A' + SEP + 'B']), 'A' + SEP + 'B', 'longest level wins');

// 6. Empty category (the dist box family rides one).
eq(facetOf('F1' + SEP, SEP, ['F1']), 'F1', 'empty category: facet');
eq(catOf('F1' + SEP, SEP, ['F1']), '', 'empty category: category');

// 7. Unfaceted / absent separator: the key passes through untouched.
eq(facetOf('A', SEP, ['F1']), '', 'no separator: facet');
eq(catOf('A', SEP, ['F1']), 'A', 'no separator: category');
eq(catOf('F1' + SEP + 'A', '', ['F1']), 'F1' + SEP + 'A', 'no separator configured');
eq(catOf(null, SEP, ['F1']), null, 'non-string key');

// 8. No levels shipped: fall back to the first-separator split, which is
//    what every call site did before the helper existed.
eq(facetOf('F1' + SEP + hostileCat, SEP, []), 'F1', 'levels absent: first-separator fallback');
eq(catOf('F1' + SEP + hostileCat, SEP, null), hostileCat, 'levels null: first-separator fallback');

// 9. Levels present but the key's level is not among them.
eq(facetOf('F9' + SEP + 'A', SEP, ['F1', 'F2']), 'F9', 'unlisted level: fallback');

console.log(fails ? `facetkey-unit: FAIL (${fails})` : 'facetkey-unit: PASS (18 cases)');
process.exit(fails ? 1 : 0);
