// Source-contract checks for the launch consistency sweep. These controls are
// assembled dynamically inside the widget, so focused source assertions catch
// semantic drift without requiring every inspector route to have a fixture.
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const widgetPath = path.join(ROOT, 'inst/widget/graphbuilder2.js');
const source = readFileSync(widgetPath, 'utf8');
const widgetR = readFileSync(path.join(ROOT, 'R/widget.R'), 'utf8');
const aYaml = readdirSync(path.join(ROOT, 'jamovi'))
    .filter(name => name.endsWith('.a.yaml'))
    .map(name => readFileSync(path.join(ROOT, 'jamovi', name), 'utf8'))
    .join('\n');
let failures = 0;

function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) failures++;
}

function count(needle, haystack = source) {
    return haystack.split(needle).length - 1;
}

function section(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) return '';
    return source.slice(start, end);
}

const syntax = spawnSync(process.execPath, ['--check', widgetPath], { encoding: 'utf8' });
check('Widget JavaScript parses', syntax.status === 0,
    (syntax.stderr || syntax.stdout || '').trim());

// Field diagnostics must be REACHABLE in embedded hosts (v2.9.9, Torry):
// the overlay is the no-devtools diagnostics surface, so the Appearance
// toggle is present by default. Standalone may suppress this duplicate
// because its shell exposes the same setting in Help > Diagnostics.
const globalInspector = section('function renderInspectorGlobal(body)',
    'function renderInspectorFacet(body, level)');
check('Render-timing diagnostics is default-on for hosts and relocated in standalone',
    globalInspector.includes(
        'window.__gb2ShowDeveloperDiagnosticsInChartSettings !== false') &&
    globalInspector.includes('data-field="dbg-timing"') &&
    readFileSync(path.join(ROOT, 'standalone/js/ps-shell.js'), 'utf8')
        .includes('window.__gb2ShowDeveloperDiagnosticsInChartSettings = false;'));
check('Facet color actions accurately say they restore the default',
    source.includes('title="Restore the default divider color">Use default color</a>') &&
    source.includes('title="Restore the default accent-line color">Use default color</a>'));
check('Dot-plot panels use dot vocabulary in active controls',
    source.includes('_lsIsDot ? "Dot fill color" : "Marker fill color"') &&
    source.includes('_lsIsDot ? "Dot size" : "Marker size"') &&
    source.includes('_lsIsDot ? "All dots" : "All markers"') &&
    source.includes('aria-label="Dot outline color" title="Dot outline color"') &&
    source.includes('{ id: "marker", label: "Dots" }'));
check('Find-a-setting paths match the renamed tabs',
    source.includes('"Style \\u203a Line style \\u203a Width"') &&
    source.includes('"Pie slice \\u203a Layout \\u203a Rotation"') &&
    source.includes('"Point style \\u203a Marker \\u203a Color"') &&
    source.includes('"Item means \\u203a Dots"') &&
    source.includes('"Style \\u203a Shape \\u203a Bandwidth"'));

// Opacity: a genuine 0 is editable and still leaves an interaction target.
check('Frequency slice opacity uses 0–1 in 0.05 steps',
    source.includes('_distRangeHtml("fqs-op", 0, 1, 0.05'));
check('Correlation cell opacity uses 0–1 in 0.05 steps',
    source.includes('_distRangeHtml("cr-op", 0, 1, 0.05'));
check('Likert response opacity uses 0–1 in 0.05 steps',
    source.includes('_distRangeHtml("lkl-op", 0, 1, 0.05'));
check('Data-point opacity uses 0–1 in 0.05 steps',
    /data-field="opacity" min="0" max="1" step="0\.05"/.test(source));
check('Correlation and Likert renderers honor zero opacity',
    source.includes('data.corrCellOpacity >= 0') &&
    source.includes('data.barOpacity >= 0'));
check('Data-point input handler accepts zero opacity',
    source.includes('if (!isFinite(v) || v < 0 || v > 1) return;'));
check('Transparent slices, Likert segments, and data points remain selectable',
    count('style: "cursor:pointer;pointer-events:all;"') >= 2 &&
    source.includes('"pointer-events": "all"\n                    });'));

// Units and numeric landmarks.
check('All three bar corner controls say percent of bar thickness',
    count('% of bar thickness') >= 3);
check('Violin and density bandwidths share 0.1–5 by 0.05',
    /data-field="vl-bandwidth" min="0\.1" max="5" step="0\.05"/.test(source) &&
    source.includes('_distRangeHtml("dd-bw", 0.1, 5, 0.05'));
check('Both bandwidth controls identify the automatic-bandwidth multiplier',
    count('automatic bandwidth</span>') >= 2 &&
    source.includes('>Auto</a>'));

const markerContracts = [
    /data-field="bx-o-size"[^\n]*min="1" max="20" step="0\.5"/,
    /data-field="marker-size"[^\n]*min="1" max="20" step="0\.5"/,
    /data-field="p-size"[^\n]*min="1" max="20" step="0\.5"/,
    /_distRangeHtml\("qq-size", 1, 20, 0\.5/,
    /_distRangeHtml\("fpm-size", 1, 20, 0\.5/,
    /_distRangeHtml\("lkm-size", 1, 20, 0\.5/,
    /data-field="size" data-unit="px" min="1" max="20" step="0\.5"/
];
check('Marker-size controls share 1–20 px by 0.5',
    markerContracts.every(re => re.test(source)));
check('Legacy zero marker sizes fall back to a visible size',
    source.includes('data.linePointSize > 0') &&
    source.includes('data.qqPointSize > 0') &&
    source.includes('data.pointSize > 0'));

check('Violin inner-box width is shown as 0–100 percent',
    /data-field="vl-ib-width" min="0" max="100" step="2"/.test(source) &&
    source.includes('% of violin width') &&
    source.includes('uiScale: 100'));
check('Violin inner-box renderer, inspector, reseed, and R default agree on 12 percent',
    count('? data.violinBoxWidthFrac : 0.12;') >= 2 &&
    source.includes('dataKey: "violinBoxWidthFrac", def: 0.12, uiScale: 100') &&
    !/violinBoxWidthFrac[^\n]{0,100}(?:\?|def:)\s*0\.18/.test(source) &&
    widgetR.includes('violin_box_width_frac = 0.12,'));
check('Correlation circle size is shown as 40–100 percent of its cell',
    source.includes('_distRangeHtml("cr-scale", 40, 100, 2') &&
    source.includes('"% of cell"'));
check('Likert row gap is shown as 0–70 percent of its row',
    source.includes('_distRangeHtml("lk-rowgap", 0, 70, 5') &&
    source.includes('"% of row left empty"'));
check('Percent controls convert UI values back to stored proportions',
    count('function (v) { return v / 100; }') >= 3 &&
    source.includes('typeof toData === "function"'));
check('True scale factors carry a multiplication sign',
    source.includes('_distRangeHtml("cl-size", 0.4, 3, 0.1, _clScaleCur, "&times;")') &&
    count('_distRangeHtml("dh-patden", 0.25, 4, 0.25') === 2 &&
    count('_distRangeHtml("dh-patthk", 0.25, 4, 0.25') === 2);

// Order and visibility chrome.
const facetOrderStart = source.indexOf('var canMoveUp = idx > 0;');
const facetOrderEnd = source.indexOf('listHost.appendChild(rowEl);', facetOrderStart);
const facetRow = (facetOrderStart >= 0 && facetOrderEnd > facetOrderStart)
    ? source.slice(facetOrderStart, facetOrderEnd) : '';
const labelAt = facetRow.indexOf('data-fo-label');
const upAt = facetRow.indexOf('data-fo-up');
const downAt = facetRow.indexOf('data-fo-down');
const eyeAt = facetRow.indexOf('data-fo-eye');
check('Facet Order keeps labels beside handles, before row actions',
    labelAt >= 0 && labelAt < upAt && upAt < downAt && downAt < eyeAt);
check('Facet Order disables boundary arrows accessibly',
    facetRow.includes('canMoveUp') && facetRow.includes('canMoveDown') &&
    count('disabled aria-disabled="true"', facetRow) === 2);

const likertLegend = section('function renderInspectorLikertLegend(body)',
    'function renderInspectorLikertLevel(body, lv)');
check('Likert legend uses a title-bar eye instead of an internal Show checkbox',
    likertLegend.includes('likert-legend-title-eye') &&
    likertLegend.includes('_eyeIconSvg(hidden)') &&
    !likertLegend.includes('lkleg-show'));
check('Likert title eye persists the dedicated visibility option',
    likertLegend.includes('_setOption("likertLegendShow", data.likertLegendShow)'));

// Field-level reset vocabulary and strip rhythm.
check('Automatic range and layout actions use concise Auto wording',
    count('>Auto</a>') >= 4 &&
    source.includes('>Auto</button>') &&
    !source.includes('>Reset to auto</button>'));
check('Rotation and text-reset actions name their result',
    count('Reset to 0°') >= 4 && count('Clear override') >= 2);
check('Custom statistics plates use Fit to content',
    count('Fit to content') >= 2 && !source.includes('Reset size'));
check('Revealed control strips use the 8 px gap token',
    /var _DIST_stripWrap = "[^"]*gap:8px;/.test(source));

// These are chart-spec values. The analysis schema should not acquire a
// second, conflicting constraint layer; R should continue numeric marshalling.
const chartSpecKeys = [
    'barOpacity', 'violinBandwidth', 'violinBoxWidthFrac', 'linePointSize',
    'pointOpacity', 'densBandwidthAdjust', 'qqPointSize', 'paretoMarkerSize',
    'corrCellOpacity', 'corrCircleScale', 'likertRowGap', 'likertDotSize'
];
check('Hand-written analysis schemas do not duplicate chart-spec constraints',
    chartSpecKeys.every(key => !aYaml.includes(key)));
check('R marshalling remains numeric for every changed chart-spec value',
    [
        'barOpacity = as.numeric(bar_opacity)',
        'violinBandwidth = as.numeric(violin_bandwidth)',
        'violinBoxWidthFrac = as.numeric(violin_box_width_frac)',
        'linePointSize = as.numeric(line_point_size)',
        'pointOpacity = as.numeric(point_opacity)',
        'densBandwidthAdjust = as.numeric(dens_bandwidth_adjust)',
        'qqPointSize = as.numeric(qq_point_size)',
        'paretoMarkerSize = as.numeric(pareto_marker_size)',
        'corrCellOpacity = as.numeric(corr_cell_opacity)',
        'corrCircleScale = as.numeric(corr_circle_scale)',
        'likertRowGap = as.numeric(likert_row_gap)',
        'likertDotSize = as.numeric(likert_dot_size)'
    ].every(line => widgetR.includes(line)));

if (failures) {
    console.error(`\n${failures} semantic consistency check(s) failed`);
    process.exit(1);
}
console.log('\nSemantic consistency checks passed');
