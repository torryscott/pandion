# Accessibility audit for public-university coursework

September 9, 2026. Pandion Plots 3.1.1 working copy.

**Assessment: substantial accessibility support exists, but this evidence does
not yet support a full WCAG 2.1 AA conformance claim for required coursework.**
The audit confirmed three substantive technical gaps, found contrast failures
in deployable website prototypes, and reproduced a narrower WebKit reflow
issue. Actual assistive-technology acceptance and complete classroom workflows
remain essential parts of the work.

This was an audit, not a remediation pass. Product source and delivery assets
were not edited. Findings are separate from the earlier UX-01 through UX-07
fixes, which addressed a smaller usability scope.

## Applicable target and scope

The user confirmed that students at a public university will use the software
as part of classwork. DOJ identifies WCAG 2.1 Level AA as the Title II web/mobile
technical standard. The April 2026 extension sets April 26, 2027 for larger
public entities and April 26, 2028 for smaller entities and special districts.
The university should confirm its applicable deadline and any earlier local
policy; student enrollment alone does not determine the category.
[DOJ fact sheet](https://www.ada.gov/resources/2024-03-08-web-rule/)

DOJ's guidance includes course content and required readings; password
protection is not a general accessibility exemption. This makes independent
completion of the assigned workflow the relevant practical test.
[DOJ guidance for public entities](https://www.ada.gov/resources/web-rule-first-steps/)

The website currently targets WCAG 2.2 A/AA. Retain that broader product target,
while tracking the legally referenced 2.1 baseline separately. Existing scans
already include some 2.2 checks, such as target size; they do not establish
complete 2.2 conformance. The 50-criterion [WCAG 2.1 AA matrix](WCAG21-AA-AUDIT-MATRIX-2026-09-09.md)
records the current evidence without declaring untested criteria passed.
[WCAG 2.1 standard](https://www.w3.org/TR/WCAG21/)

This report covers the local standalone source page, shared source/minified
renderer through R-generated hosts, local marketing/learning/workshop pages,
the guide, and sample SVG/PDF output. The Electron wrapper and installed jamovi
must be assessed with their actual host interfaces; a browser-host test cannot
establish their complete accessibility. The web/mobile rule is not a blanket
certification standard for native desktop binaries. University deployment and
procurement requirements need to account for the entire delivered experience.

The live production origin, LMS, native installers, and university-authored
course materials were not audited. The local site's documented origin is
pandionplots.com; this report does not assert deployment parity with that or
any other live domain.

## Existing features and demonstrated strengths

| Surface | Evidence from this audit | Remaining practical limit |
| --- | --- | --- |
| Application navigation | Bypass links, named regions, command palette, menus, focus restoration and dialog isolation passed their probes. | Voice control and screen-reader navigation still need direct acceptance. |
| Data workspace | Composite grid semantics, virtual row/column coordinates, active-cell relationships, keyboard navigation/editing and edit announcements passed. Grid and modal probes also passed in Firefox and WebKit. | DOM relationships do not prove reliable speech/braille output on large real class datasets. |
| Chart engine | All seven chart families expose named focusable charts and route readers to substantive semantic statistics. Missing-role, exclusion and uncertainty states were exercised. Recent error/bar selected-state and focus fixes passed again. | Graph comprehension and all editing operations need task-based nonvisual testing. Default bar contrast has a confirmed gap below. |
| Layouts and Notebook | Layout keyboard/selection/resize contracts and Notebook page/recording regressions passed. | These probes do not constitute a full nonvisual authoring and submission workflow. |
| Low-vision support | Chromium and Firefox passed the sampled 640/320-pixel reflow and text-spacing matrix; reduced-motion and text-scale probes passed. | These are viewport equivalents, not a hands-on magnifier or native browser-zoom acceptance run. WebKit has a reproducible offset below. |
| Website and teaching pages | Expanded scanning covered 26 top-level HTML pages at desktop and narrow widths, plus interactive guide states. Current learning/workshop pages had no automatic violations. | Gradients, SVG/screenshot text, alternative-text quality, and complete learning journeys still require review. |
| Export | SVG carries a title and description; the dialog offers editable companion text and raster guidance. | PDF metadata does not supply a tagged figure or reliable reading structure. |

## Prioritized findings

### A11Y-01 — PDF output lacks an accessible figure structure

**Remediation update, September 9:** The export structure gap is implemented
for chart, layout and Notebook PDFs. The original finding and evidence below
remain the pre-fix baseline. See [A11Y-01 validation](A11Y-01-VALIDATION.md)
for structural tests, rendering comparison and remaining institutional
screen-reader/description acceptance. This is not a full conformance claim.

**High priority when PDF is required or published as coursework.** Relevant
criteria: 1.1.1, 1.3.1, 1.3.2 and 3.1.1, as applicable to the delivered document.

A real eight-group chart was configured through the application and its export
dialog. The shared public PDF export pipeline produced a valid one-page vector
PDF. Inspection with pypdf and pdfinfo found no `/StructTreeRoot`, `/MarkInfo`,
page `/StructParents`, or document `/Lang`. The custom description exists only
in `/Subject`. Extracted page text contains axis ticks/titles and legend labels,
but no figure description or the plotted means. Visual rendering looks correct;
that does not supply its missing accessible structure.

The dialog already honestly says the PDF is not a tagged data table. Existing
`export-accessibility-check` verifies document metadata, not tagged-PDF reading
order or a figure alternative. Metadata is useful but insufficient for this
workflow. W3C's PDF techniques describe figure alternatives and structural
reading order; these are distinct from the document Subject field.
[PDF image alternatives](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF1),
[PDF reading order](https://www.w3.org/WAI/WCAG21/Techniques/pdf/PDF3)

**Recommended work:** Provide a tagged figure with a meaningful alternative,
document language, and reliable reading order. Where the task requires access
to exact values, supply a properly structured companion table or accessible
report. An explicitly supported accessible submission format can be an interim
coursework route; do not label the current PDF path fully accessible.

**Acceptance:** Inspect final bytes for tags/language and meaningful figure
alternatives, then read chart and multi-panel examples using the institution's
PDF reader and screen reader. Confirm the intended chart relationships and
required numerical values are available without inferring them from axis ticks.

Evidence: [structure inspection](../planning/accessibility-audit-2026-09-09/pdf-structure.json),
[pdfinfo](../planning/accessibility-audit-2026-09-09/pdfinfo.txt),
[sample PDF](../planning/accessibility-audit-2026-09-09/chart-export.pdf).
Source: [PDF construction](../standalone/js/ps-shell.js#L5624).

### A11Y-02 — Some default bars have insufficient non-text contrast

**High priority for chart interpretation.** Relevant criterion: 1.4.11.

With eight groups, the default bar chart uses unoutlined fills and no value
labels. Against its measured white background, three default colors fall below
3:1: orange `#e18e4c` is **2.569:1**, yellow `#faca59` is **1.538:1**, and teal
`#5bb1ba` is **2.487:1**. Stroke width is zero. The bar shapes encode the means,
so their boundaries matter to understanding the figure. This finding concerns
that concrete bar configuration, not an assertion that every gradient or
low-contrast decorative mark fails. W3C distinguishes required graphical
information from decorative or essential-presentation exceptions.
[Non-text contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)

**Recommended work:** Ensure required bar boundaries have sufficient contrast,
for example with an appropriate outline or revised accessible defaults. Check
adjacent series as well as the page background. Provide usable non-color cues
where group identity would otherwise depend only on hue. Color-vision
simulation and WCAG luminance contrast assess different properties.

**Acceptance:** Check rendered and exported grouped/stacked bars, points, lines,
and legend marks at several group counts. Measure effective colors, opacity,
and boundaries, then evaluate comprehension with low-vision/color-vision users.
Do not merely test palette hex values or rely on an accessibility badge.

Evidence: [measured fills, strokes and backgrounds](../planning/accessibility-audit-2026-09-09/targeted-observations.json),
[default chart](../planning/accessibility-audit-2026-09-09/default-eight-groups.png).

### A11Y-03 — A printable-character shortcut acts outside the chart

**Remediation update, September 9:** The `?` shortcut is now limited to its
focused chart component. Text entry, composition, modified keys and already
handled events are excluded. The original finding below is retained as the
pre-fix baseline. See [A11Y-03 validation](A11Y-03-VALIDATION.md) for verification
and the remaining installed-host/assistive-technology acceptance.

**High priority for the Level A baseline.** Relevant criterion: 2.1.4.

With keyboard focus on the standalone Open button (`ps-load`), pressing `?`
opens the chart's Help panel. Focus remains on Open. The shared renderer's
capture listener excludes text fields and Ctrl/Alt/Meta combinations, but does
not require focus in the chart. No user-facing disable/remap mechanism was
found in the reviewed preferences and shortcut routes.

This is the kind of shortcut that can interfere with speech input or accidental
keystrokes. Using Shift to type `?` does not remove it from this requirement.
[Character-shortcut guidance](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)

**Recommended work:** Restrict this shortcut to its focused chart component,
or supply an off/remap control. Preserve the existing Help button and other
non-character entry points.

**Acceptance:** Exercise chart focus, app chrome, grid, dialogs and editable
fields. Verify the shortcut only acts in the supported scope or respects the
persisted user setting, including after host rebuilds. Confirm with speech input.

Evidence: [before/after focus and panel state](../planning/accessibility-audit-2026-09-09/targeted-observations.json),
[screenshot](../planning/accessibility-audit-2026-09-09/global-question-shortcut.png).
Source: [shared shortcut listener](../inst/widget/graphbuilder2.js#L103347).

### A11Y-04 — Contrast failures remain in deployable design prototypes

**Remediation update, September 10:** At the owner's request, both prototypes
and the bundled local review preview were removed from `website/`. Unchanged
prototype sources are retained under `prototypes/website/`, outside the static
deployment root. Release and preview tooling now use that separation. Local
removal and current-page preservation passed verification; production URL
acceptance remains pending deployment. The finding below is the pre-fix
baseline. See [A11Y-04 validation](A11Y-04-VALIDATION.md).

**Medium priority; deployment-dependent.** Relevant criterion: 1.4.3.

`website/v2.html` and `website/v3.html` fail text-contrast checks at both tested
widths. Examples are gold 13px bold text at **2.23:1** on white and 12px muted
text at **2.95:1** on cream; both require 4.5:1. The website README identifies
these as design prototypes, but also identifies `website/` as the deployable
site. Their actual availability on the live server was not checked.

**Recommended work:** Explicitly exclude non-product prototypes from deployed
assets, including `pandion-site-preview.html`, or remediate any retained public
pages. Keep the current learning/workshop pages in the regular audit roster.
A file being unlinked does not demonstrate that it is absent from deployment.

**Acceptance:** Inspect the final deployed file inventory and scan all intended
public pages, their narrow layouts and interactive states. Do not infer a legal
archive exception from a prototype filename.

Evidence: [expanded scan](../planning/accessibility-audit-2026-09-09/fullsite-axe-raw.json),
[site inventory](../planning/accessibility-audit-2026-09-09/site-inventory.json).

### A11Y-05 — WebKit narrow Data view shifts outside the viewport

**Remediation update, September 10:** The reproduced frame shifts are fixed
locally. Narrow layouts hide the unused desktop splitters, allow the header
and Data commands to wrap, and size the Data grid to the remaining workspace
height. The expanded reflow matrix passes in Chromium, Firefox and WebKit;
shipping Safari with actual zoom remains a manual acceptance item. The finding
below is the pre-fix baseline. See [A11Y-05 validation](A11Y-05-VALIDATION.md).

**Medium review item; WCAG impact needs final adjudication.** Relevant criteria:
1.4.10 and 1.4.12, depending on the resulting content loss.

The reflow sequence reproduced a 3px left offset for the Data main pane at
640px. At 320px, some frame regions shift 4–7px left; after the specified text
spacing override, offsets reach 13–16px. Screenshots show edge clipping. The
remaining focus/reachability checks in the observation run passed, so this is
not evidence of a complete keyboard trap or wholesale unusability.

**Recommended work:** Investigate focus-driven scrolling/containment in the
narrow Data layout. Preserve all application chrome and status text while
letting the genuinely two-dimensional data grid scroll independently.

**Acceptance:** Reproduce the sequence in shipping Safari/WebKit with actual
zoom, keyboard traversal and text spacing; retain full control labels and
useful focus indicators. A viewport-containment failure alone should not be
relabelled as a legal violation without reviewing its user impact.

Evidence: [three geometry observations](../planning/accessibility-audit-2026-09-09/webkit-reflow-observations.json),
[text-spacing screenshot](../planning/accessibility-audit-2026-09-09/webkit-data-workspace-with-text-spacing.png).

### A11Y-06 — Regression gates are narrower than conformance evidence

**Remediation update, September 10:** The gates now block every selected A/AA
violation regardless of impact, retain incomplete results and host-wrapper
responsibilities, discover the public HTML inventory, and exercise teaching
edition/hint states. A required release runner covers source, portable, hosted,
both shared bundles and independently parsed PDF exports. The original finding
below remains the pre-fix baseline. See [A11Y-06 validation](A11Y-06-VALIDATION.md)
and the [review process](ACCESSIBILITY-REGRESSION.md). Open review results and
institutional acceptance are not converted into conformance passes.

**Medium priority for release process; not an additional demonstrated UI defect.**

The shell, chart and regular website axe gates block serious/critical findings
and target-size failures. Other WCAG-tagged violations can remain advisory.
They also request only violations, omitting scanner results that require
manual review. The normal website roster omits most teaching/workshop pages.
The shared R-host gate checks a representative subset and excludes wrapper
language/title checks because production wrappers belong to jamovi.

**Recommended work:** Record every applicable A/AA violation regardless of the
scanner's impact label; adjudicate incomplete results explicitly. Keep 2.2
extras distinguishable from the 2.1 baseline. Preserve the full page/state and
classroom-process inventory. Extend the export gate beyond metadata checks.
Do not silently discard host-level responsibilities from the final delivery
assessment just because they belong to an upstream project.

### A11Y-07 — Classroom and assistive-technology acceptance is not established

**Preparation/remediation update, September 10:** A browser/jamovi classroom
acceptance pack, synthetic assignment and answer key, platform matrix and
session record are ready. The local public statement now reflects current
features and evidence limits. Review corrected two generic-container names
and discovered/fixed statistical-result definition buttons whose accessible
names omitted their visible values. Automated regression and fixture evidence
are recorded in [A11Y-07 validation](A11Y-07-VALIDATION.md). Actual human,
installed-host and LMS acceptance remains open; browser fallback is conditional
on independently completing the same required assignment.

**High-priority evidence gap before a conformance claim.** No complete test
record for the intended university assignments, actual assistive technologies,
installed jamovi, or native installers was available in this audit's evidence.
That is not proof those environments fail, or a claim that no testing has ever
occurred outside this repository.

The public accessibility statement is appropriately qualified, but its July 28
list of grid/layout limitations should be reconciled with current fixes and
recorded acceptance. Publish a dated tested-platform matrix and accurate
remaining limitations. A version-specific Accessibility Conformance Report can
help a university assess procurement; it must reflect evidence and exceptions,
not simply reproduce a clean scanner score.

## Verification record and its limits

All **20 existing/derived Chromium regression runs** passed. The shell audit
captured 28 states and the chart-family audit 21. Expanded website scanning
captured **59 page/state scans**: 26 top-level HTML pages at two widths plus
mobile-navigation/guide states. Only the two prototype pages produced automatic
violations in that expanded scan. The original seven-page website roster and
guide passed in Chromium and Firefox, and in WebKit when served over HTTP.

Each source/minified R-host audit covered six states, including the separate
jamovi chooser. The only raw violations there were expected title/language
issues in fragment wrappers, which the existing gate excludes. Those exclusions
are harness limitations, not evidence that installed jamovi meets those criteria.

Firefox passed sampled grid, modal and reflow checks. WebKit passed grid and
modal checks, and its observational reflow run identified the three offsets
above. Its initial website run reported local-file CSS access errors; a localhost
HTTP repeat passed. That initial result is not counted as a production defect.
Playwright WebKit is not a hands-on Safari/VoiceOver certification.

Axe 4.11.0 and Playwright 1.62.1 were already available. Full raw violation and
incomplete results are retained. Incomplete results include SVG/gradient
contrast, dynamic `aria-controls`, and the brand's generic-element label; they
were not automatically converted into passes or failures. Contrast and shortcut
findings above came from targeted review outside the automatic scan rules.

The PDF was generated through the real public export pipeline after configuring
the actual dialog. Its native save-dialog interaction did not produce a headless
download event; the final file inspection therefore does not claim validation
of the native Save dialog. A custom-radio click in the first harness attempt
was corrected to the control's genuine keyboard activation. Both harness logs
are retained. PDF structure was inspected and its page rendered visually.

Neither full numerical suites nor product rebuilds were needed for this
read-only audit. Previously built artifacts remain unchanged. This is a scoped
engineering readiness assessment, not a legal determination or a full
accessibility certification. Representative evaluation must include complete
processes and human judgment, not only automated tools.
[W3C evaluation methodology](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/)

## Classroom acceptance and next steps

First settle the supported versions, operating systems/browsers, required chart
families and submission formats with the university's accessibility office and
course instructor. Use the stricter of the university's applicable policy and
the agreed product target. Address A11Y-01 through A11Y-03 in the applicable
workflows; resolve deployment scope and investigate the WebKit offset.

Then run the following with a keyboard-only operator and screen-reader users,
using representative assignments and data. At least one Windows screen-reader
combination and macOS VoiceOver/Safari should be included, plus whichever
assistive technologies the university actually supports. Test installed jamovi
and Electron separately when those editions are required. Include magnification,
text spacing/high-contrast settings and voice input where used by the students.

| Complete task | Evidence required to accept it |
| --- | --- |
| Find the software and instructions | Navigate download/start/learning pages, identify the correct edition, and follow instructions without relying on screenshots alone. |
| Import and inspect data | Open the supplied file, understand import warnings, traverse virtualized rows/columns, identify missing/excluded values and correct a cell. |
| Create a computed column | Discover the command, understand formula instructions/errors, correct an error, and verify announced results after editing and undo. |
| Choose and configure an analysis | Use the chooser or analysis selector, assign/reorder variables, and understand required-role messages without pointer-only steps. |
| Read and explain results | Identify chart type/axes/groups, obtain the required values and uncertainty/test results, and explain the relationship without seeing the chart. |
| Edit and combine figures | Reach and change required chart controls; keep notes; create and navigate a multi-panel layout with understandable selection/focus. |
| Save, reopen and submit | Preserve the project, reopen it, export the required accessible format, and inspect it after upload and display inside the actual LMS. |
| Recover from mistakes | Cancel a dialog, clear a mistaken selection, undo an edit, recover from invalid input and obtain help without losing position or work. |

Record version/build hashes, OS, browser/host and assistive-technology versions,
assignment, steps, expected/actual outcomes, workaround if any, and retest status.
Ask disabled participants to evaluate practical equivalence and effort, not only
whether a button can technically be reached. Keep a regression gate and a named
owner for incoming accessibility reports as the software and courses evolve.

A defensible milestone is: the confirmed gaps relevant to supported classwork
are resolved; every applicable criterion has evidence or a documented scope
rationale; the agreed classroom tasks pass on the actual supported combinations;
and the university has reviewed the dated conformance evidence. The current
record has not reached that milestone.

## Evidence index

- [Verification receipt](../planning/accessibility-audit-2026-09-09/verification.json)
- [Baseline probe results](../planning/accessibility-audit-2026-09-09/regression-results.json)
- [Raw scan summary](../planning/accessibility-audit-2026-09-09/axe-summary.json)
- [Cross-browser results](../planning/accessibility-audit-2026-09-09/crossbrowser-results.json)
- [WebKit follow-up](../planning/accessibility-audit-2026-09-09/webkit-followup-results.json)
- [R-host results](../planning/accessibility-audit-2026-09-09/r-axe-results.json)
- [Input hashes](../planning/accessibility-audit-2026-09-09/input-hashes.json)
- [Reproducible targeted audit](../planning/accessibility-audit-2026-09-09/targeted-audit.mjs)
