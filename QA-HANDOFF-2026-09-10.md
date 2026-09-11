# Pandion Plots: audit, verification and remediation handoff

Prepared September 10, 2026 for the agent continuing development. This is the
entry point for the numerical/data-integrity, rendering, usability and
accessibility work performed during the September 5–10 review sequence.
Detailed contracts and evidence are linked below; this file does not replace
them or certify the entire application.

## Read this first

The work is in the shared checkout at `/Users/tsdennis/Desktop/plotstudio`.
At handoff it is on `main`, with HEAD
`2e5d2dc5ed6ac17e929023e76add419a5d7685fa`, and substantial **uncommitted tracked
changes and untracked new files**. Do not infer that HEAD contains these fixes.
The working tree was already shared with other work; not every changed file
can be attributed to one batch. Preserve unrelated changes and use each
batch's before/after records when investigating provenance.

`DESCRIPTION` still says **3.1.1**, while new numerical corrections are listed
under **3.2.0 unreleased** in [NUMERICAL-CHANGES.md](NUMERICAL-CHANGES.md).
Resolve the intended release version deliberately; this handoff did not bump,
commit, tag, push, publish, deploy or install a release.

A session using this exact folder sees the current files. A different checkout,
worktree, machine or GitHub checkout does **not** automatically receive
uncommitted changes or local evidence. `git diff` also omits untracked files.
Inspect both `git status` and the new files. In particular:

- `planning/` is ignored by Git and contains detailed logs, before/after
  snapshots, reference fixtures, screenshots, PDFs and verification receipts.
  Preserve or explicitly transfer relevant evidence when moving the work.
- `standalone/dist/` is ignored generated output. The website's app, hashed
  scripts and portable download are separate generated delivery files.
- Many new verification scripts and documentation files are currently
  untracked. They are part of the work, not disposable scratch files.
  Incidental `__pycache__` output is not source to include in a release.
- A working-tree inventory/hash snapshot for this handoff is retained at
  `planning/qa-handoff-2026-09-10/working-tree-state.json`. It identifies the
  observed files; it is not a patch or a replacement for transferring them.

Read dated validation updates as updates to the original audits. Earlier
reports intentionally retain original failures and then-current next steps;
an older “open” item can have a later implemented fix. Old artifact hashes and
test counts belong to those particular runs, not automatically to today's tree.

## User intent and decisions to preserve

The user wants dependable numbers, safe data handling, excellent polish and
university-classroom accessibility. They authorized successive fixes after the
initial read-only audits. The aim is strong, reviewable evidence, with honest
limits: no finite fuzzer proves corruption immunity or 100% statistical or
accessibility correctness.

Classroom delivery will ideally use **both browser and jamovi**. Browser is
the proposed fallback if installed jamovi cannot be made usable, but it must
independently meet the same assignment and submission requirements. The user
does not have administrator access on this Mac. They installed the ChatGPT
Chrome extension; this does not establish native VoiceOver/installed-host test
access or constitute an actual assistive-technology session.

**A11Y-02 chart palette/contrast changes are deferred by the user.** Do not
silently redesign the default palette or mark the known contrast gap resolved.
The user explicitly authorized removing the old website prototypes: v2/v3 and
their combined preview belong under `prototypes/website/`, outside the
deployment folder. Do not restore them into `website/` during reconciliation.

## Numerical correctness, data handling and rendering

Start with [RELEASE-VALIDATION.md](docs/RELEASE-VALIDATION.md), including its
dated follow-up sections, and [NUMERICAL-CHANGES.md](NUMERICAL-CHANGES.md).
The September corrections include:

- Full observation precision through R → JSON → JavaScript, standalone
  summaries/previews and computed-column chains; exact constant means and zero
  variance, honest refusal of undefined tests/z scores, and extreme ROUND cases.
- A `.pand` precision migration with an explicit recalculation notice and
  wrapper format 3 / snapshot 5. Older exported outputs retain their old
  numbers. Do not treat old saved outputs as automatically repaired.
- Direct t/F tail probabilities, scaled QR polynomial fits, saturated-model
  confidence-band refusal, corrected R LOESS interval degrees of freedom, and
  standalone direct-surface LOESS with explicit singularity refusal. Standalone
  LOESS remains curve-only and intentionally differs from jamovi's default
  interpolated R surface; do not force inappropriate parity between conventions.
- The faceted scatter blocker: fits, intervals, ellipses and linear-model
  residuals now use facet × group populations consistently with displayed
  statistics. The opposite-slope North/South fixture no longer draws pooled
  horizontal fits. Null/unavailable scatter statistics stay unavailable.
- Actual polynomial evaluation for extended curves/bands and clipping before
  export, collision-safe literal group identities, and protection against tick
  loops when a floating-point increment cannot advance.
- More stable factorial/repeated-measures/mixed ANOVA residual calculations
  and Greenhouse–Geisser epsilon, plus exact numeric R crossed-factor reshape.
- XML-safe display/export of unsupported characters while preserving original
  data and model identities; original values remain recoverable. Display escape
  spellings must not become grouping keys or overwrite stored values.
- Removal of invisible interaction geometry from figure bounds/Notebook
  signatures, and preservation of source-chart fonts in layout panels/exports.

The verifiers were strengthened too: required fixture rosters and comparison
counts, finite-result contracts, independent references, relative small-tail
tolerances, negative controls, exact original-observation checks and release
gates that cannot pass on missing comparisons. Damaged project adoption is
checked for preserving the existing workspace. Seeded workspace sequences use
an independent model for edits, formulas, structure, filters, exclusions,
undo/redo and save/reopen/autosave boundaries.

| Detailed contract | Use it for |
| --- | --- |
| [Regression validation](docs/REGRESSION-VALIDATION.md) | Fit/interval conventions, direct vs interpolated LOESS, numerical/export geometry tolerances and facet population checks |
| [ANOVA validation](docs/ANOVA-VALIDATION.md) | Supported hypotheses/designs, missingness/refusal rules, `car::Anova` and independent 80-digit references |
| [Workspace validation](docs/WORKSPACE-VALIDATION.md) | The independent 216-edit sequence model and its explicit limits |
| [XML export validation](docs/XML-EXPORT-VALIDATION.md) | Unicode/escaping boundaries, original identity recovery and real export checks |

The release record contains the historical full standalone run, subsequent
affected-check runs and full shared-renderer source/minified runs. **Do not
describe the earlier full standalone sweep as a fresh full run on the final
September 10 code.** The optional `superb` package comparison and previously
disclosed overlapping-pie hover assertion limitations are not positive coverage.
Independent statistical-method review and final native/deployed artifact
acceptance remain release work.

Primary local numerical evidence:
`planning/release-validation-2026-09-05/` and
`planning/release-validation-2026-09-06/`, especially `facet-fit-followup/`,
`xml-export-followup/`, `standalone-gate-followup/` and
`anova-package-followup/` under the latter directory.

## Usability: UX-01 through UX-07

The code fixes from the [usability audit](docs/USABILITY-AUDIT-2026-09-07.md)
are completed locally. Human assistive-technology and installed-host acceptance
remain separate.

| Finding | Implemented behavior / record |
| --- | --- |
| UX-01 | Computed cells repaint after source edits, including chains, aggregates, filter/exclusion changes and virtualized views, without discarding focus/selection. [UX-01/02 validation](docs/USABILITY-FIXES-2026-09-07.md) |
| UX-02 | Repeated-measures status distinguishes unique cases, conditions, contributed measurements and complete cases. Same validation file; later rechecks are under `planning/ux-02-recheck-2026-09-09/`. |
| UX-03 | Error-bar controls and filter controls preserve meaningful keyboard focus through redraws/host replacement. [Validation](docs/UX-03-VALIDATION.md) |
| UX-04 | Error-bar Type/Method expose selected states; later bar orientation/summary/frequency choices receive the same focus/pressed-state treatment. [Initial validation](docs/UX-04-VALIDATION.md), [follow-up](docs/UX-FINAL-VALIDATION.md) |
| UX-05 | Individual Layout actions wrap and remain operable in narrow workspace widths. [Validation](docs/UX-05-VALIDATION.md) |
| UX-06 | Help me choose can complete a pristine current chart; explicitly creating a new chart still creates one. Rechecks prevent overwriting a target changed while the chooser was open. [Final UX validation](docs/UX-FINAL-VALIDATION.md) |
| UX-07 | Hover then click keeps the destination application menu open; submenus and Escape restore useful state/focus. Same final UX validation. |

Regression probes are registered in the standalone/shared runners as described
in those records. Final UX evidence is under
`planning/ux-final-fixes-2026-09-09/`; the earlier individual batches retain
their own `planning/usability-*` and `planning/ux-*` directories.

## Accessibility: completed engineering work and open acceptance

Start with the [audit](docs/ACCESSIBILITY-AUDIT-2026-09-09.md),
[50-criterion WCAG 2.1 A/AA matrix](docs/WCAG21-AA-AUDIT-MATRIX-2026-09-09.md),
and [latest A11Y-07 validation](docs/A11Y-07-VALIDATION.md).

| Finding | Current state |
| --- | --- |
| A11Y-01 PDF exports | Standalone chart/Layout/Notebook PDFs have linked tagged Figures, Unicode alternatives, language, page ordering and parent-tree structure; independent structural and damaged-file checks pass. Actual reader/description acceptance remains. [Validation](docs/A11Y-01-VALIDATION.md) |
| A11Y-02 chart contrast | **Open, deferred by user.** Some default unoutlined bar fills are below the measured required-boundary contrast target. Color-vision screening is not a contrast/conformance pass. |
| A11Y-03 character shortcut | `?` is scoped to the focused chart component and excludes text entry/composition. [Validation](docs/A11Y-03-VALIDATION.md) |
| A11Y-04 prototypes | Removed from local deployment root; sources retained under `prototypes/website/`. Verify their absence on production after an authorized deployment. [Validation](docs/A11Y-04-VALIDATION.md) |
| A11Y-05 reflow | Narrow frame/Data scrolling and wrapping corrected; Chromium/Firefox/WebKit probes pass. Actual shipping-browser zoom and magnifier acceptance remain. [Validation](docs/A11Y-05-VALIDATION.md) |
| A11Y-06 verification gates | All selected A/AA violations block regardless of impact. Raw incomplete findings and actual jamovi wrapper responsibilities are retained; full site inventory, all families, PDFs and release CI wiring included. [Validation](docs/A11Y-06-VALIDATION.md), [runner/report guide](docs/ACCESSIBILITY-REGRESSION.md) |
| A11Y-07 classroom acceptance | Preparation complete, human acceptance **open**. Shared browser/jamovi assignment, synthetic data, answer key and session/platform records are in the [classroom pack](docs/accessibility-classroom/README.md). |

The A11Y-07 rehearsal also fixed brand/Layout generic-container names and a
substantive shared statistics-label defect: definition buttons could expose
only “p value, definition” while showing `.071`. Their accessible names now
retain the visible value/label as well as the definition action. Tests check
actual names; finding text anywhere in an accessibility snapshot is insufficient
because the snapshot can also include overridden descendant text.

The local [public accessibility statement](website/accessibility.html) is dated
September 10 and describes implemented features, automated coverage and real
limitations. Its tagged-PDF claim explicitly concerns standalone exports,
not jamovi's full-results output. This update has not been published here.

Latest local evidence at
`planning/a11y-07-fixes-2026-09-10/verification.json` records:

- Full accessibility release gate: **284 scanned states, zero blocking rules,
  zero execution errors**; three app artifacts, website/guide and two R hosts.
- **297 open rule/state review entries**, including repeated editions/states,
  not 297 distinct confirmed defects. Contrast and actual-host responsibilities
  remain open. Do not suppress these to manufacture conformance.
- Statistics names: **80 subpanel views / 1,217 definition actions** across
  three app artifacts and two R hosts. Old-renderer negative control fails.
- Setting-search relationships: **175 lifecycle states** in five runs,
  including Chromium/Firefox/WebKit. Raw scanner uncertainty is retained even
  where the specific standalone relationships were technically verified.
- Keyboard grid/modal/layout/bypass checks, the known-answer classroom rehearsal,
  and PDF export/structure checks on all three app artifacts passed.

This is **not** installed jamovi/Electron, NVDA/JAWS/VoiceOver, native PDF-reader,
actual LMS, live deployment or full conformance acceptance. The user was told
the local engineering pass is finished and the next phase is hands-on acceptance.

## Build and verification entry points

The shared renderer is `inst/widget/graphbuilder2.js`; rebuild its committed
minified partner using `scripts/minify-widget.sh` after source edits. The pinned
compiler is Terser 5.49.0. At handoff the source MD5 and `.min.js.hash` are
`3f318ff73dbfb5445a52cc4c12bd275f`; the latest receipt records SHA-256 hashes
for source, minified, hosted and portable artifacts. Compare them with the
working copy before relying on that evidence.

```sh
# These checks/builds are local; choose the tests appropriate to later changes.
bash scripts/minify-widget.sh --check
bash standalone/build-dist.sh
bash website/build.sh
node standalone/verify/artifact-parity-check.mjs

# Main verification entry points; consult their dependency/coverage docs.
bash scripts/verify/run.sh
bash scripts/verify/run.sh --min
PS_REQUIRE_R_PARITY=1 bash standalone/verify/run.sh
bash scripts/verify/accessibility-run.sh
```

Do not rerun every expensive historical suite merely to reread this handoff.
Use recorded evidence for its stated artifacts; run affected checks after new
changes, and fresh required gates on the actual release candidate. Check runner
output for skips. `PS_PDF_BASELINE=1` is capture-only, not verification, and
release runners reject it. `scripts/prepare-release.sh` expects a clean,
version-consistent tree and refuses generated-source drift; it is not intended
to bypass the current uncommitted integration work.

Recent accessibility runs used Node 20.20.0, Playwright 1.62.1, axe-core 4.11.0,
R and Python 3.12 with pypdf 6.10.0. The desktop build has a **separate Node 22**
toolchain requirement. Do not conflate browser-test and Electron-build runtimes.
On this machine, the recent runtime overrides were:

```sh
export GB2_NODE_BASE=/Users/tsdennis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node
export NODE_PATH="$GB2_NODE_BASE/node_modules:/private/tmp/pandion-a11y-06-deps/node_modules"
export PS_PYTHON=/Users/tsdennis/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

Temporary/cache paths can disappear; verify dependencies before use. The full
numerical gates need their additional R/Python packages; these three settings
are not an exhaustive dependency installation recipe. No administrator access
is needed just to inspect the repo, handoff or classroom materials.

## What the continuing agent should do next

1. Read this index and the detailed records relevant to the next requested
   work. Compare the current tree with the evidence hashes and integrate the
   uncommitted source, tests, generated assets and documentation deliberately.
   Preserve locally ignored evidence separately if moving to another checkout.
2. Continue development without undoing validated contracts, user decisions or
   intentionally removed prototypes. Maintain numerical release notes whenever
   a displayed/stored number changes, and keep verifiers capable of detecting
   the pre-fix error rather than merely matching the implementation.
3. Arrange the actual university acceptance sessions using the classroom pack;
   record browser and installed jamovi separately. Include required chart
   families, PDF readers and LMS submission. Accept browser fallback only after
   it completes the same learning objectives independently. Track upstream
   jamovi barriers as part of the delivered workflow.
4. Before broader release, settle remaining numerical-method and accessibility
   review items, reconcile the version, freeze/rebuild final artifacts, run the
   required CI/local gates, test native/installed hosts and verify production
   bytes after authorized publishing. Earlier local passes do not certify a
   later binary, website deployment or entire classroom process.
