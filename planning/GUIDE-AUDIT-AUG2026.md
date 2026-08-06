# User guide audit: confirmed findings (Aug 2026)

57 confirmed by adversarial verification (9 others were refuted and are NOT listed).

## [high/churn/wrong] Editing the appearance → Axes, gridlines, and layout
- **Guide says:** "On Scatter, the Range strip adds a <b>Scale</b> switch (Linear / Log₁₀)."
- **Actually:** Log10 axes are dormant. Both axis panels' Scale segments are behind literal `false` gates and _xyLogX()/_xyLogY() hard-return false, so a saved log10 state renders linear. There is no Scale switch on the Scatter Range strip. Note the code documents an explicit restore path ("delete the two early returns + flip the two panel gates back"), so this is a parked feature that may return.

## [high/churn/wrong] Exporting & sharing > Exporting from the app
- **Guide says:** "…or the Notebook (a PDF, one page per kept moment; with several sections it asks which)."
- **Actually:** Notebook export asks for scope first from a menu under the button (this page / this section, when there are 2+ / the whole Notebook), then opens the same export dialog charts use, offering PDF, SVG, PNG and JPG; PDF keeps all pages in one file, the raster/vector formats save one file per page in a zip.

## [high/stable/wrong] Keyboard & mouse reference — Mouse
- **Guide says:** "Right-click an individual data point — A small menu with one action: \"Hide this point\" (the only right-click menu; restore from the eye button)." (docs/user-guide.html:878)
- **Actually:** In the standalone the point menu reads "Exclude this value from dataset" (or "Include this value in dataset" on a ghost) and carries a second item, "Reveal in Data". The action writes a real dataset exclusion rather than a display hide, so the eye/Visibility panel is not the restore path. Several other right-click menus exist (data grid, document tabs, layout canvas, pinboard).

## [high/stable/framing] Picking the right chart > Help Me Choose (the wizard)
- **Guide says:** "Good to know: The wizard cannot open an analysis for you; jamovi does not allow it… The wizard also resets to its first screen whenever it re-runs…" — this callout carries NO data-channel attribute, so it renders under "In the app".
- **Actually:** In the app, both wizard routes end in a primary "Create <Analysis> chart" button that opens the recommended analysis with the chosen variables; the app wizard is a modal with a Start over button, not a re-running analysis. The callout's caveats are jamovi-only but render in both channels.

## [high/stable/wrong] The app's four workspaces > Saving and opening
- **Guide says:** "Your saved palettes and chart styles live in your own library on this machine and never travel inside a shared project." (docs/user-guide.html:267-268)
- **Actually:** Backwards. Every .pand embeds a machine-library snapshot at the top level, and opening one merges any palette/style name the recipient's library is missing (existing names win). Only the one-shot library ACTIONS are machine-guarded, not the snapshot.

## [high/stable/framing] The seven chart analyses → Repeated Measures
- **Guide says:** "<b>Variable boxes: different from the other modules.</b> Repeated Measures uses the same factorial input as jamovi's own RM-ANOVA" → Repeated Measures Factors / Repeated Measures Cells / Between Subject Factors; plus "<b>Arranging a factorial design.</b> With two or more factors, a small strip under the toolbar offers three dropdowns (X-axis, Grouped by, Panels)."
- **Actually:** The factorial factors/cells supplier and the X-axis/Grouped by/Panels pivot strip exist only in the jamovi module. The app's Repeated Measures has a flat multi-slot "Repeated measures" role plus "Between-groups variable", with the factorial design explicitly out of standalone v1 scope.

## [high/stable/wrong] The seven chart analyses → Scatter
- **Guide says:** Variable-box table rows: "<b>Size By (bubble, optional)</b> | numeric → sizes each point (bubble chart)" and "<b>Label Points By (optional)</b> | any ID / name column → a small text label beside each point"; plus the gallery card "<b>Bubbles + labels</b> — Size By turns points into bubbles; Label Points By tags each point."
- **Actually:** Size By and Label Points By were removed from the UI on Jul 9 2026 and are dormant hidden options that exist only so old .omv files load. No variable box for either exists in jamovi or in the app, so neither documented chart can be produced.

## [high/stable/wrong] Troubleshooting & FAQ > "Where do my projects, library, and autosave live?" (app-tagged)
- **Guide says:** "Saved palettes and chart styles also live in that local storage: they follow you across projects on this machine, and never travel inside a shared file."
- **Actually:** A .pand file embeds a snapshot of the machine's saved palettes and styles under a top-level `libraries` key, and opening one imports every name the recipient does not already have, persisting it to localStorage. Colliding names are skipped, so existing entries and default pointers are safe.

## [high/stable/wrong] Welcome > Installing
- **Guide says:** "Pandion Plots runs three ways, and the chart editor is the same in each. Projects saved in one open in the others." (docs/user-guide.html:207-208)
- **Actually:** Project interchange covers only browser <-> portable. The jamovi module has no .pand reader, and the standalone's .omv import (adoptOMV) takes the data table only, then resets charts/layouts/Notebook.

## [medium/stable/missing] Adding things: the "+" menu (item table)
- **Guide says:** (absent) — the item table has no <b>Error bars</b> row.
- **Actually:** The "+" menu ships an Error bars item gated to bar/line/dot and hidden on Frequencies. It is the practical route back once Type is set to None, because with no error bar drawn there is nothing to click to reach the Type strip.

## [medium/stable/wrong] Adding things: the "+" menu (item table, Outliers row)
- **Guide says:** "<b>Outliers</b> | bar / line / dot summary charts | Marks per-cell outliers."
- **Actually:** The overlay's gate is bar,line,dot,box,violin,raincloud. On the box family the rings dock on the box's own outlier dots (points overlay off) or on the jittered points (overlay on), and the box's fixed Tukey highlight stands aside so points never wear two rings.

## [medium/stable/stale-screenshot] Around the chart: the toolbar
- **Guide says:** 9 of the 14 screenshots show the second toolbar button labeled "Palette ▾" while the guide's prose and captions call it "Theme ▾".
- **Actually:** The toolbar trigger is labeled "Theme". Nine screenshots taken before the Jul 13 rename still show "Palette ▾", contradicting the guide's own prose, its toolbar reference table, and the five re-shot figures that already read "Theme".

## [medium/stable/framing] Around the chart: the toolbar (and Welcome > Your first chart in 60 seconds)
- **Guide says:** Untagged toolbar row "⭳ | Export plot | Save the figure as SVG, PDF, PNG, or JPG", the untagged figure caption listing "…add · export · help", and the untagged quickstart step "Export. Click the export button (the tray icon)…"
- **Actually:** The app hides the engine toolbar's Export plot button outright and routes chart export to the command bar's blue Export button (one per workspace); only jamovi still has the tray icon.

## [medium/stable/missing] Check graph: a pitfall scanner — "The full list of checks (40)"
- **Guide says:** The <details> block is labelled "The full list of checks (40)" and enumerates 38 rows (two covering two checks each). (docs/user-guide.html:811-850)
- **Actually:** The lint registry ships 42 named checks. The guide's "full list (40)" omits `catsingle` ("Categories hold real groups", WARN — an identifier column dropped into a category/grouping slot) and `xcatthin` ("Crowded axis labels thinned", a tip disclosing the label-thinning stride).

## [medium/stable/missing] Compare pairs → Place brackets
- **Guide says:** "The Compare pairs tab … enumerates every within-panel pair of cells" and the Compare control lists only "Both (recommended)" and "Every pair".
- **Actually:** A faceted chart's Compare select adds "Every pair, across panels too" (cross-panel pairs in two extra sections) and relabels "Every pair" to "Every pair (within panels)"; the Compare band also renders on ungrouped faceted charts, where it reads "Within panels" plus the cross-panel option.

## [medium/stable/wrong] Compare pairs → Place brackets
- **Guide says:** "Test: Auto (recommended) / Welch's t / Student's t / Mann-Whitney U, plus Paired t and Wilcoxon signed-rank on Repeated Measures."
- **Actually:** On Repeated Measures the Test list is gated by the design implied by the current Compare scope: paired class offers Auto / Paired t / Wilcoxon only; mixed class (grouped RM at the default Both scope, or ungrouped RM under "Every pair, across panels too") offers Auto alone; Welch / Student / Mann-Whitney appear only under the independent ("…within each occasion") scope.

## [medium/churn/wrong] Editing the appearance → Axes, gridlines, and layout
- **Guide says:** "<b>Resize the plot</b> by dragging the grips at the chart's edges (hold <kbd>Shift</kbd> to keep proportions)"
- **Actually:** One always-visible bottom-right CORNER handle drags both dimensions; Shift (or the Sizing panel's aspect lock) preserves the ratio and release keeps the exact dropped size. The per-axis edge grips are gone (makeGripLine is dead code). Downgraded to medium: the mechanism still exists and is visible, only its described location is wrong. Marked churn: eight commits touched resize in the last week (bff728a, 306b391, e26c0dd, 3899842, 9a4c3f1, 4fc1aaa and the resize-follow series).

## [medium/stable/missing] Exporting & sharing (both channels)
- **Guide says:** (absent) Copy-to-clipboard is documented nowhere. The word "clipboard" appears zero times in the guide, and the keyboard table maps ⌘+C only to "Copy & paste annotations".
- **Actually:** In the app, Cmd/Ctrl+C on a chart or layout writes a 2x PNG to the clipboard and the Edit menu carries "Copy chart as image" / "Copy layout as image"; in jamovi, right-click Copy on the results item ships a real PNG via the copy-clean swap.

## [medium/stable/wrong] Exporting & sharing > Exporting from the app
- **Guide says:** "Your saved palettes and chart styles stay in your own library on your machine, so opening someone else's project can never rewrite your defaults."
- **Actually:** Defaults are indeed never rewritten (name collisions are skipped), but the palettes and styles themselves DO travel in the .pand and are added to the opener's library.

## [medium/stable/missing] Exporting & sharing > Exporting from the app
- **Guide says:** "One blue Export button, top right, exports whatever workspace you are in: the chart (SVG, PDF, PNG, JPG), the layout page, or the Notebook…"
- **Actually:** In the Data workspace the same button relabels to "Export data" and writes a CSV (menu entry "Export data as CSV…"), with a toast disclosing that row filters are not applied and excluded values are included.

## [medium/stable/missing] Exporting & sharing > Exporting from the app
- **Guide says:** (absent) The app export dialog's Caption field and its "Add what produced this chart" button are not mentioned anywhere in the guide.
- **Actually:** The chart export dialog has a Caption textarea (600 chars) carried into PNG, SVG and PDF, plus a one-click button that appends a provenance line naming what produced the chart.

## [medium/stable/missing] Exporting & sharing > Exporting from the app
- **Guide says:** (absent) The app export dialog's accessibility description, Resolution and Background controls are not mentioned.
- **Actually:** The app export dialog also carries an "Image description for accessibility" textarea prefilled with a generated chart summary, a Copy description button, help text on how SVG/PDF/PNG each handle it, a Resolution select (96/150/300/600 DPI) and a Background select (As shown / Transparent / White).

## [medium/stable/missing] Keyboard & mouse reference
- **Guide says:** The section presents itself as the app's reference but its Keyboard table is only the chart engine's 15 rows ("This is the same table as the chart's ? → Basics → All shortcuts.", lines 864-899). No app-level shortcut appears anywhere in the guide.
- **Actually:** The app ships a second shortcut layer plus an F1 "Keyboard shortcuts" sheet (also in the Help menu) with nine groups. None of it, and not F1 itself, is in the guide — whose keyboard table is only the engine's 15 rows. Workspace switching is the one app chord the guide does document (line 235).

## [medium/stable/framing] Keyboard & mouse reference > Mouse
- **Guide says:** Untagged row: "Right-click an individual data point | A small menu with one action: \"Hide this point\" (the only right-click menu; restore from the eye button)."
- **Actually:** In the app the menu reads "Exclude this point" / "Include this point" and writes a real dataset exclusion; a ghosted point's right-click offers the Include side, so the eye button is not the only way back; and the app has many other right-click menus (grid, tabs, layout canvas, headers, rail).

## [medium/stable/wrong] Picking the right chart → Help Me Choose (the wizard)
- **Guide says:** Callout: "The wizard cannot open an analysis for you; jamovi does not allow it. Its card tells you to "Open &lt;Analysis&gt; from the Pandion Plots menu, then drop in your variables.""
- **Actually:** In the browser/portable app the wizard result card has a "Create <Analysis> chart" button that opens the recommended analysis and, on the variables route, pre-fills the role slots. The stated limitation holds only in jamovi, but the passage is shown unqualified to the app channel, which is the guide's default.

## [medium/stable/wrong] Teaching & checking tools (the "?" family)
- **Guide says:** guide-basics.png alt text and figcaption promise an "Open the user guide" button in the Basics tab; the button is not visible in the image.
- **Actually:** In the browser and portable builds the engine's "Open the user guide" button never renders (userGuidePath ships in no standalone template, and the engine's handler calls window.openUrl against a jamovi module-asset route). The shell deliberately owns the link from the Help menu instead. Only the jamovi module shows the button.

## [medium/stable/wrong] Teaching & checking tools (the "?" family) — intro
- **Guide says:** "Basics also carries an Open the user guide button that opens this very guide in your browser." (docs/user-guide.html:786)
- **Actually:** The engine's "Open the user guide" button renders only in jamovi, where R/widget.R ships userGuidePath. In the browser/portable app the button never appears; the guide is reached from the app menu bar via Help > User guide, which the guide never mentions.

## [medium/stable/missing] Teaching & checking tools (the "?" family) — intro
- **Guide says:** "The ? button opens a five-tab help family…" (docs/user-guide.html:786) — the ? button is the only route the guide gives.
- **Actually:** The standalone adds named routes to the same panels: Help menu entries ("Which graph should I use?", "Check my chart", "Label the chart parts", "Glossary of terms") and end-of-wizard buttons in Help Me Choose. The guide documents only the "?" button and never mentions the app menu bar at all.

## [medium/stable/missing] The app's four workspaces > Data
- **Guide says:** "...exclude individual values or whole rows without deleting them, filter, and search with Cmd/Ctrl+F." (docs/user-guide.html:239-244) -- "filter" is the only mention of row filters in the whole guide.
- **Actually:** Row filters are dataset-wide conditions over six operators, AND-combined; a failing row (or one missing its value) stays visible in the grid at 38% opacity but is removed from the derived table every chart and statistic consumes. The guide states none of this.

## [medium/stable/missing] The app's four workspaces > Data
- **Guide says:** "(absent)" -- the Data section lists import, editing, measure types, exclusions, filter, search, and computed variables, and never mentions reshaping.
- **Actually:** "Reshape to wide..." is a Data-menu command with its own dialog and probe (ps-shell.js:20052 / 20639, reshape-check.mjs). It is the documented route from long data to the wide layout the guide requires for Repeated Measures and Likert, and the guide never mentions it.

## [medium/stable/missing] The app's four workspaces > Data
- **Guide says:** "(absent)" -- the section covers setting "each variable's measure type" but nothing about the per-variable inspector.
- **Actually:** Selecting a column opens a variable inspector with Summary, type advice, and a drag-reorderable Levels list plus "Sort A-Z" ("Sort levels the way R would") and "Reset order". That display order determines chart category order, because the shell keeps first-seen order rather than R's sort.

## [medium/stable/wrong] The hidden-data rule
- **Guide says:** "On count charts (Frequencies) and in every table, hiding is decluttering. The chi-square, proportion tests, and all tables keep the full data: hiding a bar never silently changes an N, a percent, or a p."
- **Actually:** The Scatter Σ table is an exception to "all tables keep the full data": rows for hidden groups are dropped from the table entirely, and the panel discloses this with its own wording — "Hidden groups are left out of this table; the correlations shown use every point in each visible group" — which matches neither side of the stated rule. (No surviving row's N, percent or p is altered.)

## [medium/stable/framing] The seven chart analyses (all module variable-box tables)
- **Guide says:** Variable boxes are named with jamovi's labels throughout, e.g. Compare Groups "<b>X-Axis Variable</b>", "<b>Y-Axis Variable</b>", "<b>Group By (optional)</b>", "<b>Panels (optional)</b>"; Distribution "<b>Variable</b>"; Frequencies "<b>Variable</b>"; Likert "<b>Items</b>".
- **Actually:** The app labels the same role slots differently (Category axis / Value axis / Color / group / Panels / Measure / Category variable / Matrix variables / Survey items). The guide uses jamovi's labels exclusively and never mentions the app names, in sections shown to both channels.

## [medium/stable/wrong] The seven chart analyses → Correlation Matrix
- **Guide says:** "<b>Special features</b> (click any cell to reach them; tabs <i>Cells · Values · Significance · Layout · Order</i>)"
- **Actually:** The cell panel is titled "Cell grid" and has four tabs: Appearance, Values, Display, Order. The Significance tab was retired Jul 10 2026 (alpha/stars/p-adjustment folded into Values, which also gained the correlation Method seg; the non-significant-cell treatment moved to Display). Two of the five names the guide prints are wrong and one names a removed tab.

## [medium/stable/wrong] The seven chart analyses → Distribution (Special features)
- **Guide says:** "<b>Shapiro-Wilk normality tests</b> per cell, with plain-language verdicts, in the Σ panel's Normality tab, plus a one-click "Switch to the Q-Q plot"."
- **Actually:** The Normality tab's "Switch to the Q-Q plot" and "Show on chart" buttons were both removed Jul 9 2026; only Copy table remains on that card. The Shapiro-Wilk tests and verdicts themselves are still there.

## [medium/stable/wrong] The Σ Statistics panel (panel-wide behaviors, Alpha bullet)
- **Guide says:** "Alpha is a reading lens (.10 / .05 / .01 / .001): it recolors the green significance chips and tallies without changing anything saved."
- **Actually:** Alpha is an unsaved session lens on Compare Groups / RM / Frequencies / Distribution only. On the Correlation Matrix the Alpha select commits the persisted corrSigLevel, which is saved and also drives the chart's stars and the non-significant fade/blank/cross treatment.

## [medium/stable/wrong] The Σ Statistics panel (per-analysis tab table, Scatter row)
- **Guide says:** "Scatter | Correlation + fit (per cell) | Pearson r with a Fisher-z CI, Spearman ρ (Kendall τ when selected), linear slope and R², per group × panel."
- **Actually:** The scatter Σ table is method-scoped: it shows only the selected method's columns (Pearson r + 95% Fisher-z CI + p, OR Spearman ρ + p, OR Kendall τ-b + p), always alongside N, Linear slope and Linear R².

## [medium/stable/wrong] Welcome > Your first chart in 60 seconds (step 2)
- **Guide says:** "Drop in variables. Drag a categorical variable into X-Axis Variable and a numeric one into Y-Axis Variable. Optionally add a second categorical variable to Group By (optional)..." (docs/user-guide.html:224)
- **Actually:** Those are jamovi's u.yaml labels. The standalone labels the same roles "X (categories)", "Y (values)", "Group By", "Panels", and its designed path is the inline role picker (the empty slot IS the picker) plus the "Choose variables" empty-state button; the "Available variables" list the guide says to drag from is collapsed by default.

## [low/stable/wrong] Adding things: the "+" menu (item table, Scatter row)
- **Guide says:** "<b>Fit line / Confidence band / Statistics box / Data ellipses / Density contours / Rug marks / Marginals</b> | Scatter"
- **Actually:** The scatter item is labelled "Distributions" ("Marginals" is the group heading above it), and the scatter Regression group also carries its own Outliers item that the row omits.

## [low/churn/wrong] Check graph: a pitfall scanner — list of checks
- **Guide says:** "TIP — Log axis flagged — A log axis should say \"log\" in its title." (docs/user-guide.html:831)
- **Actually:** Log axes are dormant — _xyLogX/_xyLogY hard-return false and the Scale segs are not emitted — so the logscale check is permanently inapplicable: it never fires and never shows as passed, and there is no way to make a log axis.

## [low/stable/wrong] Compare pairs → Place brackets
- **Guide says:** "Compare … drops hard-to-interpret diagonal pairs (disclosed in the footnote; "Every pair" restores them)."
- **Actually:** No such footnote exists. The verbose Compare-pairs footnote was removed; the card's only footnote is the conditional median/mean honesty warning. The dropped-diagonal counts (cmpDropped / cmpDroppedNC) are computed and never displayed anywhere.

## [low/stable/wrong] Compare pairs → Place brackets
- **Guide says:** "Correct: None / Bonferroni / Holm / Benjamini-Hochberg (FDR), plus Tukey, Games-Howell, and Dunnett (vs control) on Compare Groups."
- **Actually:** Even on Compare Groups the pooled-error trio is conditional: Tukey / Games-Howell / Dunnett are listed only when Test is Auto, Welch's t or Student's t, and never under the "Every pair, across panels too" scope. A previously persisted pick stays visible so a saved chart never misreports.

## [low/stable/wrong] Computed variables
- **Guide says:** "open it from the column menu (or the <b>fx</b> button)" (docs/user-guide.html:272-273)
- **Actually:** There is no fx button. fx is a non-interactive badge span on a computed column's header carrying only a tooltip; the header click handler acts on [data-grid-type] and column selection only. The dialog opens from Data > "Add computed column..." or the column menu's "Add computed column..."/"Edit formula...".

## [low/stable/wrong] Editing the appearance → Axes, gridlines, and layout (Legend bullet)
- **Guide says:** "drag individual rows to rearrange them (a <b>"Reset to auto"</b> button undoes a custom layout)"
- **Actually:** The button is labelled "Auto" (tooltip "Restore automatic layout"), not "Reset to auto", and it appears only once a custom legend layout is active.

## [low/stable/wrong] Editing the appearance → The Vision check
- **Guide says:** "a <b>Fix colors</b> button re-spreads your colors' lightness…"
- **Actually:** The default label is "Fix all colors"; it becomes "Fix unlocked colors" once any series is locked. The guide bolds "Fix colors" the same way it bolds the adjacent exact labels (Try another arrangement, Revert, Adjust a color), so it reads as a literal label.

## [low/stable/wrong] Exporting & sharing > The Export panel
- **Guide says:** "PNG / JPG add a DPI choice: Screen (96) / 150 / Print (300) / 600 / Hi-res (1200)."
- **Actually:** Hi-res (1200) is JPG-only. On PNG the option is hidden and disabled, and a persisted 1200 selection silently falls back to 600.

## [low/stable/wrong] Glossary
- **Guide says:** "The same dictionary powers the Σ panel's tap-a-term popovers…" (docs/user-guide.html:860)
- **Actually:** They are two independent tables: `_GB_GLOSSARY` (131 entries, glossary tab only) and `_GB_STAT_TERMS` (104 entries, Σ popovers only, with no "Common misread" field). A term in one is not guaranteed to exist in the other.

## [low/churn/framing] Keyboard & mouse reference — Accessibility callout
- **Guide says:** "The whole chart is keyboard-navigable and self-describing… The ? → Basics → Accessibility topic collects all of this." (docs/user-guide.html:900)
- **Actually:** The Accessibility topic the guide points at opens with an amber "Work in progress" banner saying the features may be incomplete or change. The guide's underlying claims are accurate; it simply carries none of that caveat.

## [low/stable/wrong] Keyboard & mouse reference — Keyboard
- **Guide says:** "Delete — Hide the selected element (restore via the eye button). A selected drawn shape is deleted instead; undo brings it back." (docs/user-guide.html:884)
- **Actually:** Reference lines are deleted outright too, alongside drawn shapes; only text and bracket annotations keep the hide-and-restore-from-the-eye behavior. The engine's own ? → Basics shortcut table is stale in the same way.

## [low/stable/missing] Keyboard & mouse reference — Keyboard
- **Guide says:** (absent) The keyboard table has no row for excluding/hiding the data point under the cursor.
- **Actually:** Cmd/Ctrl+E toggles the exclusion state of the data point under the cursor, wired once per window in the engine and always live on the chart. It is absent from both the guide's keyboard table and the engine's own shortcut table it mirrors.

## [low/stable/wrong] Significance brackets
- **Guide says:** "Honesty built in: if a correction cannot apply to a bracket's test (e.g. Tukey on repeated measures), the raw p is shown with a disclosure line saying so."
- **Actually:** The disclosure mechanism still exists, but Tukey / Games-Howell / Dunnett are now removed from a bracket's Correct dropdown whenever they cannot apply (Repeated Measures, Frequencies, or any bracket whose resolved test is not an independent t), so the guide's example combination cannot be produced from the menu and the flat list of seven is only correct for an independent-t bracket on Compare Groups.

## [low/churn/wrong] Teaching & checking tools → Check graph (log-axis rule)
- **Guide says:** Check list entry: "<b>Log axis flagged</b> A log axis should say "log" in its title."
- **Actually:** Scatter log10 axes were removed Jul 9 2026 (_xyLogX/_xyLogY hard-return false, both axis panels' Scale segs gated off), so the logscale check's applicability flag is permanently false and the rule can neither fire nor show as passed.

## [low/stable/missing] The Σ Statistics panel (panel-wide behaviors, Sticky stats mode bullet)
- **Guide says:** "Click open space to clear; the Σ button or Esc exits."
- **Actually:** The panel's grey title bar carries an explicit "✕ Close" button (data-role="st-close-btn") on every module, which clears the pin and closes the panel. The guide lists only open-space click, the Σ toggle and Esc.

## [low/stable/missing] The Σ Statistics panel (per-analysis tab table, Correlation Matrix row)
- **Guide says:** "Correlation Matrix | Matrix summary · All pairs | Strongest pair, significant-pair tally, copyable r matrix, every pair listed once."
- **Actually:** The Matrix summary card leads with a Method / Alpha / Adjust-p controls band (committing corrMethod, corrSigLevel, corrPAdjust and recomputing the matrix client-side), and the Strongest-pair row plus every All-pairs row carries a per-row "APA" copy button — it is not a read-only summary.

## [low/stable/missing] The Σ Statistics panel (per-analysis tab table, Scatter row)
- **Guide says:** (absent) — the row lists what the table reports but never mentions that the correlation METHOD selector lives in this card.
- **Actually:** The scatter Σ card carries a quiet METHOD band (Pearson r / Spearman ρ / Kendall τ-b) committing xyStatsCorrType; it moved here from the Regression panel's retired Statistics tab, so the Σ card is the on-chart home for choosing the correlation method.

## [low/stable/framing] The Σ Statistics panel (per-analysis table header)
- **Guide says:** The table's second column is headed "Tabs", and lists "Correlation + fit (per cell)" for Scatter and "Matrix summary · All pairs" for Correlation Matrix.
- **Actually:** Only four modules are tabbed (Compare Groups/RM, Frequencies, Distribution, Likert). Scatter and Correlation Matrix render bare, untabbed cards; the strings the guide lists under "Tabs" for those two are card titles.

## [low/stable/framing] Welcome > The three ideas behind it
- **Guide says:** Untagged bullet: "Everything is click-to-edit. The left-hand jamovi panel stays tiny on purpose."
- **Actually:** The app has no jamovi panel; it has its own left rail with four workspaces plus a variables/roles panel. The claim itself (click-to-edit, minimal options panel) is true in both channels.


---

# Status: what was fixed, and what was deliberately deferred

## Fixed (Aug 2026 correctness pass)
All 9 high-severity findings, plus the medium ones that are single-sentence
label or gate corrections, plus the undocumented shipped Data features
(row filters, reshape to wide, the variable inspector). The jamovi-versus-app
framing was addressed two ways: a jamovi-to-app role-name mapping table at the
top of "The seven chart analyses" (app channel only), and `data-channel`
scoping on the Repeated Measures factorial supplier, the RM pivot strip, the
Help Me Choose "cannot open an analysis" callout, the Basics "Open the user
guide" button, and the keyboard reference's pointer to the in-app F1 sheet.

## Deferred on purpose

**Screenshots.** All 14 `img/shots/guide-*.png` date from Jul 24 2026 and are
the one part any UI change invalidates. Known stale: 9 of them show the second
toolbar button labelled "Palette", which has read "Theme" since Jul 13; the
palette swatch rows were redesigned Aug 3 (22px chips, 3px gap, quick-pick row
beside the colour chip); none show the Aug 3 corner resize handle; and the
standalone now ships `textScale = 1.15`, so app text renders larger than the
shots show. Regenerating them ALSO means rebuilding the generator: the script
that produced `guide-*.png` is no longer in the repo (docs/img/shots/README.md
still refers to it). Do this once, late, as a single batch.

**Remaining low-severity detail drift.** Mostly Sigma-panel per-control gating
(which tests and corrections are offered in which design), the Sigma Close
button, the sixth "Saved" palette-gallery pill, error-bar cap units, and the
glossary-versus-popover dictionary distinction. All listed above; none of them
would make a reader fail at a task.

**Accessibility copy.** The guide states the chart is keyboard-navigable and
self-describing; the app's own Accessibility topic opens with an amber
"Work in progress" banner. These should agree before launch. Marked `churn`
because that work is still moving.
