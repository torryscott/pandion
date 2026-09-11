# WCAG 2.1 A/AA evidence matrix

September 9, 2026. Companion to the [accessibility audit](ACCESSIBILITY-AUDIT-2026-09-09.md).
Scope: the local Pandion Plots 3.1.1 working copy and the required-university-
coursework use case. The matrix uses all 50 Level A/AA criterion IDs; the
area column is an audit topic, not a replacement for the normative wording.
[WCAG 2.1](https://www.w3.org/TR/WCAG21/)

**Gap** means a confirmed issue in a stated surface/configuration. **Partial**
means positive sampled evidence with broader acceptance outstanding. **Review**
means unresolved manual/host/context evidence. **Conditional** means a feature
was not encountered or belongs to course/deployment scope; confirm that scope
before marking a criterion not applicable. **Interpretation** records the current W3C treatment of the retained 4.1.1 entry.
None of these labels is a global
conformance pass or a compliance percentage.

The baseline regression, raw scanner, R-host, cross-browser, visual and PDF
records are indexed in the main report. Where earlier numerical/workspace
validation is mentioned, it is existing evidence, not a suite rerun for this
audit. In particular, metadata, an accessible name, or a clean scanner result
is not interchangeable with successful completion of a class assignment.

September 10 regression update: A11Y-06 now retains all selected A/AA violations
and scanner-incomplete results, including explicit Jamovi wrapper
responsibilities. The expanded automated coverage and release gates are
documented in [A11Y-06 validation](A11Y-06-VALIDATION.md). This improves the
evidence record; it does not close the matrix's manual or classroom items.

September 10 classroom update: [A11Y-07 validation](A11Y-07-VALIDATION.md)
records corrected brand/Layout naming, explicit setting-search relationship
review and a fix for statistical-result buttons whose names omitted visible
values (relevant to 1.3.1, 2.5.3 and 4.1.2). The
[browser/jamovi classroom pack](accessibility-classroom/README.md) is ready;
actual AT, installed-host and submission acceptance remains open.

| SC | Level | Audit area | Evidence status | Evidence and remaining work |
| --- | --- | --- | --- | --- |
| 1.1.1 | A | Figures and other visual information | Partial | A11Y-01 remediated: chart/layout/Notebook PDFs have linked Figure alternatives. Description adequacy and institutional screen-reader acceptance remain open; see [validation](A11Y-01-VALIDATION.md). |
| 1.2.1 | A | Standalone recorded audio/video | Conditional | No such content encountered in the scanned pages. Inventory course recordings and any recording outputs before deciding applicability. |
| 1.2.2 | A | Captions for recorded lessons | Conditional | No lesson audio/video was exercised. Caption quality and equivalence need review if recordings are supplied. |
| 1.2.3 | A | Equivalent access to recorded visuals | Conditional | If lesson videos are introduced, verify descriptions or an appropriate media alternative; a page scan cannot decide this. |
| 1.2.4 | AA | Captions during live sessions | Conditional | Live instruction/streaming is outside this local software audit; include it in the course review if applicable. |
| 1.2.5 | AA | Descriptions of recorded visual action | Conditional | Evaluate any recorded demonstrations separately. No audio-description acceptance was performed. |
| 1.3.1 | A | Programmatic structure and relationships | Partial | A11Y-01 remediated: PDF structure and parent-tree links pass independent checks. Figures are not structured data tables. Grid, named groups, dialogs and statistics-table contracts passed sampled tests; full workflow acceptance remains open. |
| 1.3.2 | A | Reading sequence | Review | PDF Figure tags follow page order with tested MCID/parent links (A11Y-01). Grid/modal DOM models have evidence; actual screen-reader reading order remains unaccepted (A11Y-07). |
| 1.3.3 | A | Instructions independent of visual position | Partial | Missing-role messages and keyboard help were exercised. Review all instructional copy and screenshots for sight-only directions. |
| 1.3.4 | AA | Portrait and landscape use | Partial | Narrow/wide viewport probes passed; A11Y-05's expanded narrow matrix also passes in WebKit. Shipping-device orientation remains unaccepted. See [validation](A11Y-05-VALIDATION.md). |
| 1.3.5 | AA | Purpose of personal-information fields | Conditional | No personal-profile/account-entry fields were identified in the sampled app. Generic dataset cells are not automatically personal autofill fields. |
| 1.4.1 | A | Information conveyed by color | Review | Names and statistics supply alternatives, but chart-group identity and selection states require a complete non-color-cue review. |
| 1.4.2 | A | Automatically playing audio | Conditional | No automatic audio was encountered. Reassess if course media or sound features are added. |
| 1.4.3 | AA | Text readability against backgrounds | Partial | A11Y-04 addressed locally: v2/v3 and the bundled review preview are outside the deployment folder; production removal awaits deployment verification. See [validation](A11Y-04-VALIDATION.md). Earlier current-page scans had no automatic violations; incomplete gradient/SVG checks remain. |
| 1.4.4 | AA | Text enlargement | Partial | Text-scale tests have earlier Chromium evidence; A11Y-05's viewport-equivalent matrix passes in Chromium, Firefox and WebKit. Actual 200% browser text/zoom and magnifier use remain unaccepted. |
| 1.4.5 | AA | Text represented as images | Review | Interface text is largely live HTML/SVG. Guide screenshots and exported figures need contextual equivalence/essential-content review. |
| 1.4.10 | AA | Reflow without losing content | Partial | A11Y-05 remediated locally: sampled frame, header and Data containment passes in Chromium, Firefox and WebKit, including keyboard scrolling and all three densities. Actual browser zoom and complete workflows remain open; see [validation](A11Y-05-VALIDATION.md). |
| 1.4.11 | AA | Required graphical boundaries and states | Gap | A11Y-02: three default bar fills have less than 3:1 on white with zero-width outlines. Other chart/control configurations remain partial. |
| 1.4.12 | AA | User text-spacing overrides | Partial | A11Y-05 remediated locally: specified spacing matrix passes in Chromium, Firefox and WebKit, including wrapping Data commands and independent grid scrolling. Shipping-browser acceptance remains open; see [validation](A11Y-05-VALIDATION.md). |
| 1.4.13 | AA | Extra content on hover or focus | Partial | Menus, role pickers and dialogs were exercised. Review all tooltips, statistical popovers and dismiss/hover/persistence behavior. |
| 2.1.1 | A | Keyboard operation | Partial | Extensive grid, chart, menu, dialog and layout contracts passed. Complete nonvisual classwork and all direct-manipulation features remain unaccepted. |
| 2.1.2 | A | Ability to leave keyboard components | Partial | Sampled Escape, focus-return, drawer and modal contracts passed. Actual host/frame and assistive-technology traversal remain. |
| 2.1.4 | A | Printable-character commands | Partial | A11Y-03 remediated: `?` requires focus inside its chart component; input/composition and external controls are excluded. Browser and R-host checks are documented in [validation](A11Y-03-VALIDATION.md); actual speech-input acceptance remains open. |
| 2.2.1 | A | User control over time limits | Review | No login/session deadline was encountered. Review transient messages and any timed task or recording workflow explicitly. |
| 2.2.2 | A | Control of prolonged automatic movement | Partial | Reduced-motion probe passed. Review all animations, automatic updates, recording playback and relevant pause controls. |
| 2.3.1 | A | Flashing content | Review | No concerning flashing was observed; no quantitative flash analysis or complete media inventory was performed. |
| 2.4.1 | A | Skipping repeated chrome | Partial | Application and website bypass contracts passed. Installed jamovi iframe/document navigation remains a host acceptance item. |
| 2.4.2 | A | Document/page identification | Partial | Ordinary site pages and PDF title have evidence. R fragments omit wrappers; actual jamovi document titles were not accepted. |
| 2.4.3 | A | Useful focus sequence | Partial | Grid, modal, layout and recent control-focus fixes passed sampled checks. End-to-end task order and host boundary traversal remain. |
| 2.4.4 | A | Identifiable link destinations | Partial | Named navigation and guide search were scanned. Review link purpose in lesson context and external destinations. |
| 2.4.5 | AA | Alternative ways to locate content | Partial | Site navigation, guide search and app command/settings search exist. Full course/content information architecture was not evaluated. |
| 2.4.6 | AA | Useful headings and control labels | Partial | Scans and role/label contracts passed sampled states. Instructional clarity and all uncommon dynamic controls still need review. |
| 2.4.7 | AA | Visible keyboard position | Partial | Focus visibility and stable-control tests passed sampled controls. High-contrast/actual magnification and native host acceptance remain. |
| 2.5.1 | A | Alternatives to complex pointer gestures | Partial | Grid/layout keyboard routes exist. Inventory every multipoint/path gesture and confirm a simple-pointer alternative where required. |
| 2.5.2 | A | Avoiding accidental pointer activation | Review | Some cancellation/undo paths have prior coverage; this audit did not exhaustively examine down-event activation and drag cancellation. |
| 2.5.3 | A | Visible words in accessible names | Partial | A11Y-07 corrected definition-button names to retain visible statistical results and labels, with source/minified host regressions. Confirm speech activation across chart editing and special controls. |
| 2.5.4 | A | Alternatives to device movement | Conditional | No device-motion-operated feature was identified. Reassess if orientation sensors or motion gestures become inputs. |
| 3.1.1 | A | Default language | Partial | A11Y-01 remediated: exported PDFs declare English, matching the app. Standalone/site HTML has language evidence; other-language content and installed jamovi wrapper language remain to be reviewed. |
| 3.1.2 | AA | Language changes within content | Review | Product copy sampled is English. User labels, imported content and multilingual lessons require appropriate contextual review. |
| 3.2.1 | A | Predictability on focus | Partial | Sampled focus traversal did not trigger unexpected context changes. Uncommon controls and assistive-technology navigation remain. |
| 3.2.2 | A | Predictability when changing input | Partial | Role, preference and chooser changes have regression coverage. Review automatic redraw/context changes across complete tasks. |
| 3.2.3 | AA | Consistent navigation across pages | Partial | Current site/shared guide chrome has positive source and runtime evidence. Retired prototypes are outside the deployment folder (A11Y-04); final production inventory and LMS scope still need acceptance. |
| 3.2.4 | AA | Consistent naming of functions | Partial | Common app/site commands were reviewed. Complete teaching-page and uncommon-editor vocabulary remains an editorial acceptance item. |
| 3.3.1 | A | Recognizing input errors | Partial | Missing-role and sampled dialog/grid error mechanisms exist. Read real import/formula errors using the target screen readers. |
| 3.3.2 | A | Input instructions | Partial | Role guidance and grid/editor instructions have evidence. Validate that novices can discover and understand them through AT. |
| 3.3.3 | AA | Useful corrections for errors | Partial | Recovery guidance is present in sampled states. Include malformed files, formula errors and incompatible assignments in classwork acceptance. |
| 3.3.4 | AA | Protection when changing stored data | Partial | Undo/recovery have prior workspace validation and some current keyboard coverage. Audit irreversible/deletion/submission workflows explicitly. |
| 4.1.1 | A | Markup/parser compatibility | Interpretation | Current W3C notes treat this criterion as satisfied for HTML/XML. Actual name/role/state problems remain assessable under 4.1.2 and other relevant criteria. |
| 4.1.2 | A | Control roles, names, values and states | Partial | A11Y-07 corrected brand/Layout names and statistical-result names; standalone setting-search lifecycle relationships passed explicit checks. Actual AT/installed-host behavior remains open. |
| 4.1.3 | AA | Announcements of status changes | Partial | Grid edit status/live regions exist and passed structural checks. Verify useful announcements, timing and duplication with actual screen readers. |

WCAG conformance also concerns full pages, complete processes, accessibility-
supported technology use and non-interference. A collection of passing component
checks cannot establish those conditions for the university's actual delivery.
The main report gives a classroom process checklist and the current host limits.

The public statement's WCAG 2.2 target is broader than this matrix. Existing
2.2-tagged target-size/focus-related probes are useful additional evidence;
this document does not claim a complete 2.2 evaluation.
