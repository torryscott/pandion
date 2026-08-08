# Charts audit, round two: what is still outstanding

Produced Aug 7 2026 by a nine-agent verification pass over the REBASED
branch (`probe/charts-deepdive` on `e193d18`). Four agents re-checked every
item filed in CHARTS-DEEPDIVE.md against current code, because 32 Data
commits landed under it. Four ran the brief tasks the original dive never
finished (style library across datasets, APA into a manuscript, an actually
colour-unsafe palette, 1280px). One synthesised, under instruction to be
adversarial about the other eight.

Ranked by users affected times frequency. Verdicts, evidence and severity
are the agents' own; I spot-checked the mechanism behind ranks 2, 3, 6 and
9 in source myself before publishing this.

## 1. The app still never tells you a chart is misleading unless you go and ask it. (Original proposal, item 1, second half.)

- **verdict** still open  
- **severity** high  
- **owner** inst/widget/graphbuilder2.js (9-line host hook, unlanded) + standalone/js/ps-shell.js:19549-19595 (written, dormant)

RECONCILED: the honesty RULE landed (aa26564, verified: '+ Add > Sig. bracket' now yields a 15th check and the panel reads 'A bracket says "*" but no test was run', vs 14 checks / 'Looks good' without it). The SURFACING did not. I confirmed the hook is absent: `grep -c __gb2_graphLint inst/widget/graphbuilder2.js` = 0 (and 0 in the .min bundle); the shell's syncChartCheck bails at ps-shell.js:19563 on `typeof host.__gb2_graphLint !== "function"`. Armed negative (so this is not a worthless null result): bracket present AND yMinOverride true with yMin 30, then a whole-visible-DOM sweep for truncat|baselin|mislead|exagger|no test was run returned only the word 'baseline', which is a column in trial.csv. Status bar identical in every state. #ps-status-check reads {hidden:true, textContent:''}. CONFIDENCE HIGH. NOTE the dive's hope that item 1 would make item 3 moot is now falsified: at 1280x800 the finding's own title sits at y=799 against a pane bottom of 775, so the fix is itself unreadable, and its advice ('use the Compare pairs tab') lands the user on the panel described in rank 4.

## 2. The app can tell your colours merge for colour-blind readers, only says so on a settings tab you have no reason to open, and its two verdicts contradict each other on the default chart. (NEW.)

- **verdict** new finding  
- **severity** high  
- **owner** inst/widget/graphbuilder2.js:49628 + registry :49712; discoverability shared with rank 1

NEW, not in the proposal. Two parts. (a) SILENCE, armed properly: a 6-group chart hand-coloured to Tableau orange/red scores deutan 0.058 / protan 0.069 / tritan 0.046 / grayscale 0.000 against the engine's own _simulateCvd + _okDist, i.e. merges under all four; the status bar, toasts, all six shell menus and the command palette say nothing (positive control: 'export' returns 2 palette hits, 'vision' returns none). (b) CONTRADICTION, which I verified in source myself: graphbuilder2.js:49628 reads `var cvdPairs = [], cvdModes = ["deuteranopia", "protanopia"]` - the lint never simulates tritanopia or grayscale - while the Vision check judges four modes. On the dive's own trial.csv with 3 groups and NOTHING touched, Help > Check my chart prints a green tick on a pill named 'Colorblind safety' (registry row :49712) while Chart settings > Accessibility shows an amber dot and 'Under grayscale vision, "Placebo" and "Drug B" are hard to tell apart'. Stock palette grayscale worst pair: 0.111 at k=2 (passes), 0.056 at k=3, 0.036 at k=5 - so it warns from the third group onward, which is most real charts. ADVERSARIAL CAVEAT: each surface is defensible under its own remit (the pill's hover tooltip honestly says 'red-green'), and CLAUDE.md documents grayscale as unfixable for large sets. This is a naming-and-scope mismatch producing a user-visible contradiction, not a maths bug. The fixer itself works: one click took my unsafe chart to all-five-pass, independently re-scored (deutan 0.110, grayscale 0.106), and survived reload byte-identical.

## 3. Between about 760 and 1150 pixels wide, toolbar buttons stop being clickable and nothing says so. (NEW.)

- **verdict** new finding  
- **severity** high  
- **owner** inst/widget/graphbuilder2.js:95311 (measurement) + standalone/js/ps-shell.js:16516 (the third child)

NEW. Root cause verified by me in source: graphbuilder2.js:95311 computes `_stackToolbar = (_makeNeed + _actionsNeed + 12) > _innerAvail` from exactly two containers, and the shell appends a THIRD child (#ps-charttools, the Zoom select) into the same bar at ps-shell.js:16516 dockChartZoomInToolbar, which the measurement never learns about. Engine sums 444 against 525 available and concludes it fits; real need is 595. flexWrap reads 'nowrap' at every width from 1280 down to 760, so the engine's own two-row fallback never fires. Measured controls with ZERO pointer-reachable pixels at default scroll: 1000px -> Zoom; 950 -> Find, +Add, Zoom; 900 -> Chart settings, Find, +Add, Zoom; 850 -> six controls. Confirmed on FRESH boot, not a resize artifact. Recovery exists but is unadvertised and vertical-swipe-proof: horizontal wheel scrolls the bar, vertical wheel moves it 0px over 8 ticks; the bar has scrollbar-width 'none', no mask, no shadow, role null, aria-label null. Keyboard is no better: 7 real Tab presses land focus on #ps-chart-zoom with barScrollLeft still 0 and 46 of 108px reachable. Narrow mode, which fixes it completely, arrives at 760 - about 390px too late. SCOPE HONESTY, stated by the agent and worth keeping: at the brief's own 1280 nothing is unreachable (overflow 0) and at 1100 only Zoom is affected; the six-control case begins below 1000. The band contains 1024x768 and half-screen windows on 2048/2560 displays.

## 4. On a laptop screen the Statistics panel opens showing none of its numbers, and Place brackets is still below the fold. (Original proposal, item 3 - worse than filed.)

- **verdict** still open  
- **severity** high  
- **owner** standalone .ps-main-workspace layout + inst/widget/graphbuilder2.js renderInspectorStats

STILL OPEN and quantified harder than the dive did. At 1280x800, panel just opened, no other interaction: the card is 539px tall with 107px visible (20%), dataRowsFullyVisible 0 of 10, the tally pill reading '5 of 9 significant at .05' is off-screen at y=793, and ZERO of the five significant rows are on screen. 1440x900 -> 1 row. 1500x1000 -> 3 to 5 rows. Place brackets: 204px below the pane's visible bottom at 1500x1000, 304 at 1440x900, 406 at 1280x800. NUMBER CORRECTION: the dive's '258 px below the fold' does not reconcile with any measure I can construct (179 below the viewport edge, 204 below the pane bottom at that viewport), and a second agent measured y=1019 at the current tip because the footer became sticky - so the filed figure is stale, the defect is not. Cue audit on the pane the user must actually scroll (#ps-main-workspace): offsetWidth 955 === clientWidth 955, boxShadow 'none', backgroundImage 'none', maskImage 'none', zero scroll-fade elements. The Sigma panel's own 'more content' inset shadow IS implemented (graphbuilder2.js:54080, read back live as 'rgba(0,0,0,0.22) 0px -10px 8px -8px inset') but is on the nested TABLE, not the pane, and its bottom edge sits at y~1148 against pane bottoms of 775/875/975, so it is never on screen. Cost of scrolling: at max scroll only 145 of the chart's 490px survive at 1280x800, so the bars and the button cannot both be visible. CORRECTION to the dive: the Sigma button is NOT unlabelled - it renders 'Sigma Stats' at 1440 and 1500 and collapses to a 29px icon only at 1280.

## 5. The import preview still shows a quarter of a wide file, and the Likert battery you never see is typed Continuous. (Original proposal, item 4.)

- **verdict** still open  
- **severity** high  
- **owner** standalone/index.html:1835-1838, 1926, 1929 + standalone/js/ps-shell.js:20133-20235

STILL OPEN, untouched by the 32 Data commits, and the frequency is worse than filed. Re-measured byte-for-byte at the tip on wide.csv (60x20): {cols:20, fullyVisible:5, tableScrollW:1800, wrapClientW:522, scrollbarPx:0, maxScrollLeft:1278, cardW:560, winW:1500}. `git log -S 'ps-import-table-wrap' 958c243..e193d18` returns nothing; the only ps-import CSS added in those 32 commits is the amber header-guess banner. Card is 560px at window widths 900/1200/1500/1920 - never grows. The summary says exactly '60 rows x 20 columns' and a word scan of the whole card for shown|showing|scroll|'more column'|'of 20'|hidden all return false. WHAT MAKES IT MATTER: the 5 visible columns are id, group, sex, site, wave - all demographics - age is the sliced sixth, and all 13 q-items plus bmi are entirely off screen and all default to Continuous via one line with no ordinal branch (`parsed.typeList.push(au.numeric ? "continuous" : "nominal")`, ps-shell.js:20156), adopted in full at 20423. Blast radius is wider than CSV: renderImportPreview has 7 call sites and every .xlsx sheet routes through it (verbatim comment at 20015). TWO CORRECTIONS to the dive: the hidden controls are reachable (Tab walks all 20 and the box scroll-follows focus to 1278; horizontal wheel works) - they are invisible, not unreachable; and widening the dialog does NOT break narrow mode - injecting max-width:1400px at 500x900 gives cardW 476, no window overflow, identical to shipped, because max-width is only a cap. Measured lever: every column is exactly 90px because of the word 'Continuous' in the type select, not the data. LOW-CONFIDENCE SUB-CLAIM: 'overlay scrollbars mean nothing is drawn' could not be distinguished headless (a control div with an explicit ::-webkit-scrollbar height:9px also measured 0px), so do not build a fix on drawing a scrollbar. OWNER IS DATA, not Charts.

## 6. 'Set as default for new charts' does nothing for any chart built from imported data, an .omv, or the sample project. (NEW.)

- **verdict** new finding  
- **severity** high  
- **owner** standalone/js/ps-shell.js:19842, 4933, 5320-5323

NEW, and I verified the mechanism in source myself. The auto-apply gate at ps-shell.js:5320 is `libDoc.styleStamp === false`. newChart() sets `styleStamp: false` (ps-shell.js:2162), but resetDocumentsForNewData builds its first chart as `{ id: "c1", name: "Chart 1", module: "plotbuilder", roles: {}, options: {} }` (19842) with no styleStamp, and loadSample has the identical literal (4933) - so `undefined !== false` and the gate never opens. Measured in one session against one starred style: the '+' tab CONTROL gives {stamp:true, hasOwn:true} and fills Female=#7b2d8e; CSV import gives {hasOwn:false, auto:false} and fills Alpha=#4478ad; sample data likewise. So the feature works on exactly the one route the existing probe covers (library-bridge-check.mjs:129 tests the .ps-tab-add route) and is dead on all three routes a real user takes. COMPOUNDING: the one chart that does auto-apply then loses its PALETTE on the next render - the apply writes raw option keys, palette resolution reads only st.chartSpec (5124), and 5321 clobbers payload.chartPalette with the default; measured Female/Male going #7b2d8e/#56B4E9 at t0 and #7b2d8e/#dd7e2b after one tab bounce, with the store still saying okabe-ito. The manual-apply path is unaffected (hasChartSpec:true, holds across the same bounce), and cross-dataset position re-keying (convention 17) is verified CORRECT on real data.

## 7. A colour you pick is thrown away on reload if you leave the picker open, while the status bar tells you it saved. (NEW.)

- **verdict** new finding  
- **severity** high  
- **owner** inst/widget/graphbuilder2.js:27512 + standalone autosave

NEW. Mechanism confirmed by me in source: graphbuilder2.js:27512 _hideColorPicker is the ONLY commit site ('This is when setOption fires'); the SV-square drag and the hex box both set state.changed only. Decisive storage probe: with the picker open, no localStorage key contains the picked hex; after Escape, psstandalone.project.v2, .backup.v1 and .recent.v1 all contain it. Reproduced with an ordinary mouse drag, not just the hex field: chart shows #251c14, status bar 'Autosaved just now', reload -> #dd7e2b. So the drawn chart and the saved project genuinely diverge, which is a data-loss class, not a cosmetic one. ADVERSARIAL DOWNGRADE ON FREQUENCY, which is why this sits at 7 and not at 2: I counted 40 call sites of _hideColorPicker - most panel switches, tab changes and strip changes close it - so the exposure window is 'pick a colour, touch nothing else in the app, then reload or close the tab'. That is real (the picker is DOCKED and stays open by design across renders) but it is not every colour edit. UNVERIFIED: File > Save project against the same state was not tested, so the .omv path is unknown.

## 8. The verify suite still stops at its third probe, so 248 probe runs gate nothing. (Original proposal, item 2 - half landed, and the dive's diagnosis of the residue was wrong.)

- **verdict** still open  
- **severity** high  
- **owner** standalone/verify/hardening-dom-check.mjs case 11 (the await) + standalone/js/ps-shell.js:16540 (the shell guard)

STILL OPEN. I confirmed watchChartToolbar is still an unguarded boot-time IIFE at the tip (ps-shell.js:16540-16544: `var host = ...; if (!host) return; ... new MutationObserver(`), and the two guards the Data work landed are on wireMomentButton (4562) and wireStandaloneEngineExclusionLabels (7211), neither of which is this one. Without the branch's stub the probe dies with `ReferenceError: MutationObserver is not defined at watchChartToolbar (...:16546)` while ps-shell.js is still evaluating. With the stub it reaches the end and reports one failure, exit 1, and run.sh treats anything but exit 2 as fatal under set -e. TWO CORRECTIONS TO THE DIVE. (a) Scale: 248 node runs are skipped, not '125 and their 125 repeats' - FEATURE_PROBES is 119 files, run twice, plus 3 Rscript steps and the dist build; measured by simulating run.sh with stub binaries (failing run = 3 node runs, passing = 251). (b) Diagnosis: the dive said 'the real app survives this only because the observer re-docks it'. That is wrong. The harness's observer is a no-op stub that never fires, yet the node IS re-docked 50ms later by `window.setTimeout(dockChartZoomInToolbar, 0)` at ps-shell.js:6723, which I verified exists. Case 11 reads at the assertion point {zoomById:false} and 50ms later {zoomById:true}. Inserting ONLY `await new Promise(r => setTimeout(r, 0))` before the assertion turns the whole probe green - a clean single-variable proof that the residual failure is a HARNESS read-too-early, not app fragility. It is also pre-existing: an e193d18 scratch tree with none of the branch's work fails at the identical line. So the smallest close here is one await in case 11, not a chrome investigation.

## 9. The probe that guards the honesty rule that just landed is never run by the suite. (NEW.)

- **verdict** new finding  
- **severity** medium  
- **owner** standalone/verify/run.sh FEATURE_PROBES

NEW, and I verified it directly: `grep -c 'chart-check-check' standalone/verify/run.sh` = 0, and run.sh is byte-identical at e193d18 and at this branch tip (git diff --stat empty). So aa26564 landed the brackclaim rule and 1136829 recorded it, but the probe that pins it was never wired into FEATURE_PROBES. Even a fully unblocked suite would not exercise the rule. Run directly it passes: exit 0, 'CHART CHECK: PASS', with cases 5-6 correctly self-skipping ('no __gb2_graphLint hook on this engine'). Compounds with rank 8: the one thing this branch shipped to the engine is the one thing nothing regression-tests.

## 10. The status-bar receipt is not confined to standalone/proto: merging this branch merges a live feature the document still lists as undecided. (Correction to the proposal's own account.)

- **verdict** changed  
- **severity** medium  
- **owner** planning/CHARTS-DEEPDIVE.md 'What landed' vs commit 76f6df8

The proposal says the hook and receipt 'stay in standalone/proto'. Commit 76f6df8 on probe/charts-deepdive touches the LIVE shell: standalone/index.html +15 (markup `<button type="button" id="ps-status-check" hidden>` at :4635, CSS :2657-2666) and standalone/js/ps-shell.js +68 (:19549-19595). Verified: `grep -c ps-status-check` = 0 in e193d18's index.html, 5 at this HEAD; `git merge-base --is-ancestor 76f6df8 e193d18` is NO; `git branch --contains 76f6df8` returns this branch only. It is correctly DORMANT (syncChartCheck bails with no hook, #ps-status-check reads hidden:true at runtime), so it cannot misbehave - but 'is a quiet always-present receipt right?' is still an open question in the document's own 'Needs a decision' section, and merging would settle it by accident. Same shape as the layout-branch collision the dive already caught. Smallest close: decide it, or strip 76f6df8's shell hunks before merge.

## 11. The style save form tells you the opposite of what it saves. (NEW.)

- **verdict** new finding  
- **severity** medium  
- **owner** inst/widget/graphbuilder2.js:47839

NEW, verified by me in source. graphbuilder2.js:47839 renders, directly under the five capture checkboxes: 'Colors follow the palette, never per-series assignments; saving under an existing name replaces that style.' The saved blob demonstrably contains groupColors:[{original:'Female',color:'#7b2d8e'}] plus a gb2SeriesSnapshot, and CLAUDE.md convention 17 records the Jul 9 2026 reversal that made it so. So the only sentence explaining the feature is stale against the feature. This is shared-engine copy, so jamovi shows it too. Smallest close: one string.

## 12. What you copy out of the Compare pairs table is not what the row says, and a corrected p never names the family it was corrected over. (NEW.)

- **verdict** new finding  
- **severity** medium  
- **owner** inst/widget/graphbuilder2.js:52391 and 52236

NEW, and the arithmetic underneath is sound - an independent reimplementation (Lentz continued-fraction incomplete beta, no engine code reused) reproduced t=2.763099, Welch df=21.734293, p=1.142431e-2, d=1.044353 and the exact Mann-Whitney p=0.016203, all matching the display, so this is a disclosure problem not a correctness one. Two seams. (a) The row reads 'Male: Placebo vs Drug A'; the clipboard gets 'Placebo U+00B7 Male vs Drug A U+00B7 Male: ...' - level name doubled, middle dots a manuscript does not want (graphbuilder2.js:52391). (b) Same pair, same test, CORRECT=Holm: COMPARE='Both (recommended)' copies 'p = .069 (Holm-adjusted)', COMPARE='Every pair' copies 'p = .091 (Holm-adjusted)'. Both arithmetically right (rank 4 of 9 vs 8 of 15, cummax verified), byte-identical sentences apart from the number, and the DEFAULT option is the one producing the smaller p because it drops six mixed pairs including two significant ones. The explanatory foot that used to say so was deliberately removed (graphbuilder2.js:52236, 'Keep ONLY the statistical-honesty warning'). The only trace is a tally pill that does not travel with the copy. RELATED, lower: Mann-Whitney copies 'r = -.53' beside a positive z for a group with the HIGHER mean (documented jamovi parity), with no means in the sentence to disambiguate; and no APA copy anywhere carries M and SD, so the standard results sentence needs two tabs and hand-typing.

## 13. Applying a style to an ungrouped chart silently drops the colour and writes a dead entry into your saved project. (NEW.)

- **verdict** new finding  
- **severity** medium  
- **owner** inst/widget/graphbuilder2.js:47517

NEW. _styleRekeyEntries returns entries untouched when the target series list is empty (graphbuilder2.js:47517). Measured on an ungrouped chart: bars go from #4478ad to #E69F00 (the palette colour, NOT the style's #7b2d8e), and the project store carries groupColors:[{original:'Female',color:'#7b2d8e'}] for data that has no Female. It survives reload, and adding a grouping afterwards does not revive it. Nothing tells the user the colour did not land. Adjacent and lower: applying a style also inflates the chart's option state from ~7 chartSpec keys to 74, so 'Reset styling' becomes the only route back to no-opinion. Smallest close: either drop unresolvable entries, or say the per-series colour did not apply.

## 14. Opening any panel scrolls the chart's own toolbar off the top of the screen. (NEW, and it makes ranks 1 and 4 worse.)

- **verdict** new finding  
- **severity** medium  
- **owner** standalone .ps-main-workspace scroll behaviour

NEW. Clicking a bar to open the inspector auto-scrolls #ps-main-workspace 170px at 1280x800 and 178px at 1100x700. Measured at 1100x700 before: {toolbarY:127, toolbarVisible:true, chartTop:178, chartTopClipped:false}; after: {toolbarY:-51, toolbarVisible:false, chartTop:0, chartTopClipped:true} - the value axis then starts at 50 with the 60 and 70 gridlines cut. Opening Sigma does the same (137px). So the act of editing removes both the chart's top and every toolbar control from view, which is the same pane that already hides the Statistics numbers (rank 4) and the chart-check finding (rank 1). Panel contents themselves are fine: fully on screen, no horizontal overflow, all controls reachable. Minor adjacent: at 1280x800 the pane has a 16px horizontal scroll (scrollWidth 751 vs clientWidth 735) even before Sigma opens.

## 15. The first-run coach mark still lands on the data, and the two toolbar menus still cover the plot - but the proposal's 'same fix, same place' is wrong for the menus. (Original proposal, free wins.)

- **verdict** changed  
- **severity** medium  
- **owner** standalone/js/ps-shell.js:6590-6601 (coach) vs inst/widget/graphbuilder2.js:96350-96372 (flyout clamp)

STILL OPEN, with the fix plan corrected. Coach: ps-shell.js:6597-6600 unchanged, positioning off the SVG's own rect (`box.left + 26`, `box.top + 44`). Measured deltas are exactly 26 and 44; the card covers 10.5% of the plot area, 95% of the Placebo error bar and the 40/50 tick labels, and it degrades with width - 4 of 15 bar elements at 1280x800, 8 of 15 at 1100x700. It also contradicts its own comment ('Anchored under the chart's own toolbar') and its arrow: the upward tail at y=215 points at empty plot 37px inside the svg, 53px below the toolbar it claims to point at. There IS 293px of empty space below the chart card. CORRECTION ON THE MENUS: both DO open below their triggers (palette flyout top - trigger bottom = +21, left delta 0; Add menu +21, right delta 0). They cover the plot because the plot starts 6px above them. So this is occlusion, not mis-anchoring, and the two halves are not the same fix: the coach is two shell lines, while the menus live in the shared engine (fly at graphbuilder2.js:96086, addAnnMenu at 11492 - grep of ps-shell.js for either returns nothing), needing per-change approval and a re-minify. showFly already clamps maxHeight so the flyout never covers the inspector below; the plot was simply never added to that clamp, which is the cheap precedent. And the proposed home does not fit: the flyout is 502px tall against 293px of space. The Add menu covers Drug A and Drug B, not Placebo as filed.

## 16. '1 rows x 2 columns' is on six surfaces, not one, and a Data commit edited the line next to it without fixing it. (Original proposal, free win.)

- **verdict** still open  
- **severity** low  
- **owner** standalone/js/ps-shell.js:9344, 11538, 19326, 20207, 21397, 21549

STILL OPEN and wider than filed. I confirmed unpluralised sites at ps-shell.js:9344 (command bar), 11538 (grid footer .ps-grid-shape), 19326 (Data status bar), 20207 (import preview), 21397 and 21549 (diagnostics). Measured live on a 1-row CSV: import preview '1 rows x 2 columns', status context '1 rows . 2 columns', grid shape '1 rows x 2 columns', command bar 'one-row - 1 rows x 2 columns'. The disagreement is visible inside ONE rendered footer: the selection readout says '2 rows x 1 column' while .ps-grid-shape one line below says '5 rows x 1 columns' (both emitted by gridFootHtml at 11536-11539). git blame puts the CORRECT sibling under fba67113, one of the 32 Data commits, whose diff added .toLocaleString() to that line for format consistency and left its neighbour alone.

## 17. The keyboard shortcut the engine advertises for finding the colour-vision check is taken by the shell. (NEW.)

- **verdict** new finding  
- **severity** low  
- **owner** standalone/js/ps-shell.js Edit menu vs the engine's setting-search trigger

NEW, small. The engine's Find button carries title='Find a setting (Ctrl/Cmd+F)' and typing 'color blind' or 'vision' into it returns 'Color-vision check - Chart settings > Accessibility' as the top hit. But Ctrl+F in the Charts workspace opens the shell's data finder instead (document.activeElement placeholder = 'Find data'; the Edit menu lists 'Find in data... Cmd/Ctrl+F'). So the one advertised keyboard route to rank 2's remedy never reaches it. Mouse route is fine: Settings > Accessibility renders at y=722 with the Fix button 73px ABOVE the fold at 1500x1000, i.e. the opposite of rank 4.

## 18. FIXED, no action: an armed colour-vision preview no longer bakes simulated colours into an export - CLAUDE.md's 'KNOWN OPEN' note is stale.

- **verdict** fixed upstream  
- **severity** none  
- **owner** inst/widget/graphbuilder2.js:10444; CLAUDE.md convention 23(i) needs the correction

DROP FROM THE OUTSTANDING LIST. With the deuteranopia tile armed the live fills are simulated (#d4da58, #bdc558) and an amber on-chart badge says so, but __gb2_serializeSvg() at that same moment returns the TRUE colours (#4478ad, #f28e2b, #e15759, ...). The guard is graphbuilder2.js:10444 inside _gb2HarvestClone: `try { if (window.__gb2_cvdMode && window.__gb2_cvdMode !== "none") redraw(); }`, landed in bff728a (2026-08-03), which is an ancestor of the dive's own base 958c243 - so this was already true when the dive ran. Also confirmed the mid-preview lint raises no false same-colour warning. ACTION: correct CLAUDE.md convention 23(i), which still reads 'KNOWN OPEN ... verified, unfixed'.

## 19. FIXED, no action: the fabricated-significance rule works, and so do the parts of Charts that were stress-tested this round.

- **verdict** fixed upstream  
- **severity** none  
- **owner** n/a

DROP FROM THE OUTSTANDING LIST. brackclaim (aa26564) re-verified on the rebased tree: '+ Add > Sig. bracket' produces {kind:'bracket', text:'*', autoPValue:false}, the check count moves 14 -> 15, and the panel reads '1 needs a look, 14 passed' with the finding naming the Compare pairs tab; the no-bracket control still reads '14 checks ... All passed'. Also verified sound this round, so nobody need re-check them: Compare pairs / Omnibus / Descriptives arithmetic against an independent implementation (Welch, Student, exact Mann-Whitney, two-way Type III, all matching at display precision); APA clipboard italics in both flavours; Descriptives SE matching the drawn error bars to 4dp; cross-dataset style re-keying by position; style library surviving reload; one-step undo of a whole style apply; selection rings excluded from exports; four Full-APA brackets tiering without collision; the one-click colour fix working, being honest about what it changed, and persisting through reload.

## 20. Coverage still missing: what nobody has looked at even now.

- **verdict** could not determine  
- **severity** none  
- **owner** n/a

Stated so it is not mistaken for a clean bill. (a) SIX of the seven chart types are essentially unexamined - every agent this round drove Compare Groups bars; Scatter, Distribution, Frequencies, Correlation, Likert and Repeated Measures panels were touched only incidentally, and several of the defects above are type-agnostic layout or engine code that would need re-measuring per type. (b) The 248 skipped probe runs are UNKNOWN, not passing: only 3 of 248 were spot-run (chart-check-check, statusbar-check, accessibility-source-check, all exit 0), so 'STANDALONE VERIFY: ALL GREEN' has never printed on this branch and cannot until rank 8 is closed. (c) File > Save project / .omv round-trip was not tested against the picker-loss case (rank 7) or against saved chart styles. (d) No screen-reader or keyboard-only end-to-end pass of the chart editor; the a11y evidence this round is source-level plus one Tab-walk. (e) Print and PDF export fidelity beyond the SVG harvest. (f) Multi-chart projects at scale, and Layouts interaction with any of the above. (g) One agent could not narrow a reproducible-once bug where a Find search result silently does nothing when a text-element panel is already open (Escape first, or reordering the edits, cleared it) - unresolved, low.


---

# Status after the fix pass (Aug 8 2026)

Closed: ranks 1, 2, 3, 4, 6, 7, 9, plus 11 and 12; rank 14 closed as
NOT A BUG (`revealPanelAfterClick` is a deliberate Aug 5 trade and says so
in its own comment). Six new probes now gate things nothing gated before:
`chart-check-check`, `default-style-routes-check`, `pane-scroll-cue-check`,
`toolbar-scroll-cue-check`, `picker-persistence-check`,
`compare-pairs-apa-check`. All are wired into `run.sh`.

## Rank 13 - verified, deliberately NOT fixed, and why

`_styleRekeyEntries` (graphbuilder2.js:47538) is called from exactly one
place, `_styleApplyToChart`, so it is an apply-path function and nothing
else. Its second line is

    if (!Array.isArray(currentList) || currentList.length === 0) return entries;

so applying a style carrying per-series colours to an UNGROUPED chart
passes the entries through untouched, and they are committed verbatim -
`groupColors: [{original: "Female", ...}]` written into a project that has
no Female.

The one-line change is precise and safe, because it can distinguish "no
series" from "cannot tell":

    if (!Array.isArray(currentList)) return entries;   // cannot tell
    if (currentList.length === 0) return [];           // definitely none

I did not make it, because it does not fix what the user actually
complains about. An ungrouped chart has no series, so a per-series colour
has nowhere to land: dropping the entries stops junk being written to the
project, and the colour STILL does not come across. The visible symptom -
"I applied my style and the colour did not arrive, and nothing said why" -
needs a disclosure surface, not a data change, and choosing that surface
is a design decision rather than a bug fix.

Recommendation: take the one-liner for the stored-junk half whenever the
next engine change is being batched (it needs a battery pair and does not
deserve one of its own), and treat the disclosure as its own small item.
