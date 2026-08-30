# Numerical changes

Every release of Pandion Plots that changes a number the program
displays - a statistic, a computed value, a rounding - is recorded
here, newest first. A chart or table exported before the fix keeps the
old number forever; this ledger is how you find out whether a given
output could be affected. Exported SVG and PDF files carry the app
version that produced them, and every `.pand` project records the
version that saved it, so outputs are traceable to rows in this table.

The hosted app at pandionplots.com deploys ahead of tagged releases,
so a fix can be live there before the version number below ships to
the desktop app and jamovi module. The "live on the web app" date is
when the fix reached the hosted page.

## v3.2.0 (unreleased; live on the web app since 2026-08-29/30)

**ROUND ties now match R (half to even).** `ROUND(2.5)` is 2,
`ROUND(3.5)` is 4, `ROUND(-1.5)` is -2, and `ROUND(2.675, 2)` is
2.67, exactly as R and jamovi print them. The old behavior rounded
halves up (and toward positive infinity on negatives, matching
neither R nor Excel). Affects: computed variables using ROUND on
values that are exact halves at the requested digit; reopened
projects recompute, so such a column can shift by one final digit.
Live on the web app 2026-08-30.

**Mann-Whitney exact p-values are correct at larger samples.** The
exact-p computation overflowed past roughly 30 observations per
group; in strongly separated groups the displayed p could be wrong
by many orders of magnitude (for example, 2.5e-19 displayed as a
much larger value). Rebuilt on a probability-space recurrence and
verified against R across the full range. Affects: Mann-Whitney U
p-values in Compare pairs and significance brackets when both groups
were larger than about 30 and the separation was extreme. Live on
the web app 2026-08-29.

**Spearman p-values use R's exact algorithm.** The client
computation used a t approximation where R uses the AS 89 algorithm
(exact permutation to n = 9, Edgeworth expansion beyond); some
p-values differed at display precision (for example .504 vs .503).
Affects: Spearman p in the Scatter and Correlation Matrix statistics
panels. Live on the web app 2026-08-29.

## How this ledger is maintained

A change lands here in the same commit that changes the number, with
the affected surfaces named and the fix verified against base R by
the statistics parity net (which re-checks every displayed statistic
against R on every gate run and every push). When a project saved
under an older version is opened after a change on this ledger, the
app shows a one-time notice naming what was recomputed.
