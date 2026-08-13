#!/usr/bin/env python3
"""Construct the six gallery datasets and prove they hit the captions.

The July renders' source data was never committed, so re-rendering means
building data from nothing. Rather than invent numbers and rewrite the
captions to match, this builds data that reproduces the numbers the
captions already state, so the prose survives untouched.

Every target below is quoted from website/gallery.html. Each is asserted,
not hoped for: this script fails loudly rather than emitting data that
would quietly make a caption false.

Run it from anywhere:  python3 website/gallery-data.py
Then re-render:        node website/gallery-shots.mjs <port>

Both this and its output are committed, which is the actual fix for what
went wrong the first time.
"""
import json, math, random, statistics as st, sys, pathlib

OUT = pathlib.Path(__file__).resolve().parent / 'gallery-data.mjs'
fail = []


def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond:
        fail.append(msg)


def pearson(xs, ys):
    """statistics.correlation needs 3.10; this runs anywhere."""
    mx, my = st.mean(xs), st.mean(ys)
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    return sxy / math.sqrt(sxx * syy)


def centre(target, devs):
    """Values with EXACTLY the given mean: deviations must sum to zero."""
    assert abs(sum(devs)) < 1e-9, 'deviations must sum to zero'
    return [round(target + d, 1) for d in devs]


# ---------------------------------------------------------------- 1. donut
# "Psychology is the largest major at 34%, followed by biology at 26%,
#  nursing at 18%, education at 12%, and other majors at 10%."
# n = 100 makes every share a literal count, so the percentages are exact
# rather than rounded into place.
print('\ndonut.png')
MAJORS = [('Psychology', 34), ('Biology', 26), ('Nursing', 18),
          ('Education', 12), ('Other', 10)]
donut_rows = [[m] for m, n in MAJORS for _ in range(n)]
counts = {m: sum(1 for r in donut_rows if r[0] == m) for m, _ in MAJORS}
for m, n in MAJORS:
    check(counts[m] == n, f'{m} is {counts[m]}% (caption says {n}%)')
check(sum(counts.values()) == 100, 'shares sum to 100, so no category is missing')
check([c for _, c in MAJORS] == sorted([c for _, c in MAJORS], reverse=True),
      'strictly descending, as "largest ... followed by" implies')

# ----------------------------------------------------------- 2. grouped bar
# "Spaced practice produces higher recall than massed practice both
#  immediately (about 69 versus 59) and after one week (about 65 versus 48)."
print('\ngrouped-bar.png')
CELLS = {('Immediate', 'Massed'): 59, ('Immediate', 'Spaced'): 69,
         ('One week', 'Massed'): 48, ('One week', 'Spaced'): 65}
# A fixed deviation pattern summing to zero: exact means, and enough spread
# that the standard-error bars the caption mentions are visible.
DEV = [-9, -6, -4, -2, -1, 1, 2, 3, 5, 11]
assert sum(DEV) == 0
bar_rows = []
for (test, prac), mu in CELLS.items():
    for v in centre(mu, DEV):
        bar_rows.append([test, prac, v])
for (test, prac), mu in CELLS.items():
    got = st.mean(r[2] for r in bar_rows if r[0] == test and r[1] == prac)
    check(abs(got - mu) < 1e-9, f'{prac.lower()} {test.lower()} mean is {got:g} (caption says about {mu})')
d_mass = CELLS[('Immediate', 'Massed')] - CELLS[('One week', 'Massed')]
d_spac = CELLS[('Immediate', 'Spaced')] - CELLS[('One week', 'Spaced')]
check(d_mass > 0 and d_spac > 0, f'recall declines for both ({d_spac:g} spaced, {d_mass:g} massed)')
check(d_mass > 2 * d_spac, f'the decline is much larger after massed practice ({d_mass:g} vs {d_spac:g})')

# ------------------------------------------------------ 3. repeated measures
# "Treatment rises from about 58 at baseline to 74 at week eight, compared
#  with roughly 61 to 67 for placebo. Treatment begins below placebo,
#  crosses it by week four, and finishes about seven points higher."
print('\nrm-line.png')
RM = {'Placebo': (61, 64, 67), 'Treatment': (58, 66, 74)}
# Per-subject offsets summing to zero: cell means stay exact while subjects
# differ from one another, which is what a within-subject error bar needs.
SUBJ = [-7, -5, -3, -2, -1, 0, 1, 2, 3, 4, 4, 4]
assert sum(SUBJ) == 0
# An occasion-specific wobble, so subjects do not move in lockstep. Each
# COLUMN must sum to zero or it shifts that occasion's mean off target; 12
# subjects is three whole cycles of these four rows.
#
# The size matters and a first pass got it wrong. With a wobble of only a
# few tenths every subject rose in parallel, the within-subject variance was
# almost nil, and the Cousineau-Morey error bars the caption promises came
# out too small to see. These are large enough to draw.
WOB = [[6.1, -5.0, -1.1], [-4.0, 6.5, -2.5], [3.2, 1.6, -4.8], [-5.3, -3.1, 8.4]]
assert all(abs(sum(row[k] for row in WOB)) < 1e-9 for k in range(3))
rm_rows = []
for grp, means in RM.items():
    for i, off in enumerate(SUBJ):
        w = WOB[i % len(WOB)]
        rm_rows.append([grp] + [round(means[k] + off + w[k], 1) for k in range(3)])
for grp, means in RM.items():
    for k, occ in enumerate(['baseline', 'week four', 'week eight']):
        got = st.mean(r[k + 1] for r in rm_rows if r[0] == grp)
        check(abs(got - means[k]) < 1e-9,
              f'{grp.lower()} {occ} mean is {got:g} (caption says {means[k]})')
check(RM['Treatment'][0] < RM['Placebo'][0], 'treatment begins below placebo')
check(RM['Treatment'][1] > RM['Placebo'][1],
      f'treatment crosses placebo by week four ({RM["Treatment"][1]} vs {RM["Placebo"][1]})')
gap = RM['Treatment'][2] - RM['Placebo'][2]
check(gap == 7, f'treatment finishes about seven points higher (finishes {gap} higher)')
rise_t = RM['Treatment'][2] - RM['Treatment'][0]
rise_p = RM['Placebo'][2] - RM['Placebo'][0]
check(rise_t > 0 and rise_p > 0, 'both groups improve over time')
check(rise_t > rise_p, f'treatment rises more ({rise_t} vs {rise_p})')

# --------------------------------------------------------------- 4. scatter
# "Cortisol generally increases as stress increases. Adult observations tend
#  to occupy the higher cortisol range, while adolescent observations cluster
#  more heavily around cortisol values from the mid-30s to mid-60s."
print('\nscatter-marginals.png')
rng = random.Random(20260813)
sc_rows = []
# The adolescent group is centred so that its cortisol lands about 50, which
# is what puts the bulk of it in the 35-to-65 band the caption describes.
# Adults sit higher on both variables but overlap, so the two still read as
# one rising cloud rather than two detached blobs.
for grp, n, sx, ssd, base, nsd in [('Adolescent', 34, 44, 14, 22, 6.5),
                                   ('Adult', 34, 56, 15, 30, 7.5)]:
    for _ in range(n):
        stress = round(max(8, min(92, rng.gauss(sx, ssd))), 1)
        cort = round(base + 0.62 * stress + rng.gauss(0, nsd), 1)
        sc_rows.append([grp, stress, cort])
xs = [r[1] for r in sc_rows]
ys = [r[2] for r in sc_rows]
r_all = pearson(xs, ys)
check(r_all > 0.4, f'cortisol generally increases as stress increases (r = {r_all:.2f})')
ado = [r[2] for r in sc_rows if r[0] == 'Adolescent']
adu = [r[2] for r in sc_rows if r[0] == 'Adult']
check(st.mean(adu) > st.mean(ado),
      f'adults occupy the higher cortisol range ({st.mean(adu):.1f} vs {st.mean(ado):.1f})')
inband = sum(1 for v in ado if 35 <= v <= 65) / len(ado)
check(inband >= 0.70,
      f'adolescents cluster from the mid-30s to mid-60s ({inband:.0%} of them do)')

# ----------------------------------------------------------- 5. histdensity
# "Most reaction times fall between about 60 and 90, with the highest
#  concentration in the low-to-mid 70s. A sparse lower tail reaches into the
#  20s and 30s, while the upper tail extends just past 100."
print('\nhistdensity.png')
# Explicit per-band counts rather than a Gaussian sample. Sampling put the
# tallest BIN at 78.5 even with the distribution centred on 73.5: with ~2.5
# wide automatic bins and only a handful of values in each, which bin wins is
# mostly noise. "the highest concentration in the low-to-mid 70s" is a claim
# about the picture, so the shape is designed rather than drawn.
BANDS = [(53, 1), (55, 2), (57, 2), (59, 3), (61, 4), (63, 5), (65, 7),
         (67, 9), (69, 11), (71, 14), (73, 16), (75, 13), (77, 9), (79, 6),
         (81, 5), (83, 4), (85, 3), (87, 2), (89, 2), (91, 1), (93, 1),
         (95, 1), (97, 1), (99, 1)]
rng = random.Random(451)
rt = []
for centre_v, k in BANDS:                  # jittered inside the band, so the
    for _ in range(k):                     # histogram is not a comb
        rt.append(round(centre_v + rng.uniform(-0.95, 0.95), 1))
rt += [27.4, 34.8, 38.1, 44.6, 47.9]       # the sparse lower tail, both decades
rt += [101.6, 103.2]                       # "just past 100", and no further
rt.sort()
n_rt = len(rt)
mid = sum(1 for v in rt if 60 <= v <= 90) / n_rt
check(mid >= 0.75, f'most fall between about 60 and 90 ({mid:.0%} do)')
check(sum(1 for v in rt if 20 <= v < 30) >= 1 and sum(1 for v in rt if 30 <= v < 40) >= 1,
      'the lower tail reaches into the 20s and the 30s')
check(sum(1 for v in rt if v < 50) <= 6, f'that lower tail is sparse ({sum(1 for v in rt if v < 50)} of {n_rt})')
check(100 < max(rt) <= 106, f'the upper tail extends just past 100 (max {max(rt)})')
check(st.mean(rt) < st.median(rt), 'left-skewed, as describing a long lower tail implies')
# The modal BIN depends on the automatic bin edges, not on the data alone,
# so "low-to-mid 70s" is checked against the render, not asserted here.
dense = sum(1 for v in rt if 70 <= v < 76)
check(dense >= 25, f'the densest six-point window sits in the low-to-mid 70s ({dense} values)')

# ------------------------------------------------------------- 6. raincloud
# "the medians are about 56 for control, 68 for low dose, and 80 for high
#  dose. The high-dose group also spans the highest values, and a red ring
#  identifies a low-dose score near 53 as a potential outlier."
#
# The ring is NOT a setting. On a raincloud the engine rings any value
# outside the Tukey fence by default. So the ring has to be engineered into
# the distribution: low dose needs a tight middle (small IQR lifts the lower
# fence) and one value below it, while the other two groups must have none.
print('\nraincloud.png')
# Odd n so the median is a literal middle value.
CTRL = [37.0, 42.5, 45.0, 47.5, 49.0, 51.0, 52.5, 54.0, 55.0, 56.0,
        57.5, 58.5, 60.0, 61.5, 63.0, 64.5, 66.0, 68.5, 71.0]
LOW = [52.0,                                   # the ringed value
       62.0, 63.5, 64.0, 64.5, 65.0, 65.5, 66.5, 67.0, 68.0,
       69.0, 70.0, 70.5, 71.0, 72.0, 72.5, 73.0, 74.0, 76.0]
HIGH = [63.0, 68.0, 70.5, 72.0, 74.0, 75.5, 77.0, 78.5, 79.0, 80.0,
        81.5, 82.5, 84.0, 85.5, 87.0, 89.0, 91.0, 94.0, 99.0]


def fences(v):
    """Tukey fence, k = 1.5, on the engine's linear-interpolation quartiles."""
    q1, q3 = st.quantiles(sorted(v), n=4, method='inclusive')[0], \
             st.quantiles(sorted(v), n=4, method='inclusive')[2]
    iqr = q3 - q1
    return q1 - 1.5 * iqr, q3 + 1.5 * iqr, q1, q3


for name, v, target in [('control', CTRL, 56), ('low dose', LOW, 68), ('high dose', HIGH, 80)]:
    check(st.median(v) == target, f'{name} median is {st.median(v):g} (caption says about {target})')
lo_f, hi_f, q1, q3 = fences(LOW)
out_low = [v for v in LOW if v < lo_f or v > hi_f]
check(len(out_low) == 1, f'low dose has exactly one value outside its fence: {out_low}')
check(bool(out_low) and 50 <= out_low[0] <= 56,
      f'that value is near 53 (it is {out_low[0] if out_low else "none"}; fence at {lo_f:.1f})')
for name, v in [('control', CTRL), ('high dose', HIGH)]:
    f_lo, f_hi, _, _ = fences(v)
    outs = [x for x in v if x < f_lo or x > f_hi]
    check(not outs, f'{name} has no value outside its fence, so the ring stays singular {outs or ""}')
check(max(HIGH) > max(CTRL) and max(HIGH) > max(LOW),
      f'the high-dose group spans the highest values (max {max(HIGH)})')

rain_rows = ([['Control', v] for v in CTRL] + [['Low dose', v] for v in LOW]
             + [['High dose', v] for v in HIGH])

# ------------------------------------------------------------------- emit
# Column names are capitalised because the chart derives its axis titles and
# its legend heading straight from them. Renaming the column is therefore the
# whole fix: no per-figure title overrides, and a reader who opens the same
# table in the app sees the labels the figure shows. Sentence case, not title
# case, so "Reaction time" rather than "Reaction Time".
DATASETS = {
    'donut': dict(name='Student majors', header=['Major'], rows=donut_rows,
                  types={'Major': 'nominal'},
                  levels={'Major': [m for m, _ in MAJORS]}),
    'groupedBar': dict(name='Practice and recall', header=['Test', 'Practice', 'Recall'],
                       rows=bar_rows,
                       types={'Test': 'nominal', 'Practice': 'nominal', 'Recall': 'continuous'},
                       levels={'Test': ['Immediate', 'One week'],
                               'Practice': ['Massed', 'Spaced']}),
    'rmLine': dict(name='Treatment over eight weeks',
                   header=['Group', 'Baseline', 'Week 4', 'Week 8'], rows=rm_rows,
                   types={'Group': 'nominal', 'Baseline': 'continuous',
                          'Week 4': 'continuous', 'Week 8': 'continuous'},
                   levels={'Group': ['Placebo', 'Treatment']}),
    'scatter': dict(name='Stress and cortisol', header=['Age group', 'Stress', 'Cortisol'],
                    rows=sc_rows,
                    types={'Age group': 'nominal', 'Stress': 'continuous',
                           'Cortisol': 'continuous'},
                    levels={'Age group': ['Adolescent', 'Adult']}),
    'histDensity': dict(name='Reaction times', header=['Reaction time'],
                        rows=[[v] for v in rt],
                        types={'Reaction time': 'continuous'}, levels={}),
    'raincloud': dict(name='Dose and score', header=['Condition', 'Score'], rows=rain_rows,
                      types={'Condition': 'nominal', 'Score': 'continuous'},
                      levels={'Condition': ['Control', 'Low dose', 'High dose']}),
}

if fail:
    print('\n%d TARGET(S) MISSED, refusing to write:' % len(fail))
    for f in fail:
        print('  ' + f)
    sys.exit(1)

body = json.dumps(DATASETS, indent=2)
OUT.write_text('''// Source data for the gallery figures. GENERATED, do not hand-edit:
// see the generator recorded beside it in the commit that added this file.
//
// These exist because the originals did not. The July 2026 gallery renders
// were made from tables that were never committed, so when the default
// palette changed there was no way to redraw the same figures, and the
// captions state specific numbers (r values, medians, slice shares) that
// new data would have falsified.
//
// Every dataset here is constructed to satisfy the claims its caption
// already makes, and the generator asserts each one before writing this
// file. If you change a number in a caption, change it here too and re-run
// the generator, or the picture and the prose will disagree.
export const GALLERY_DATA = ''' + body + ';\n', encoding='utf-8')

rows = sum(len(d['rows']) for d in DATASETS.values())
print('\nall targets met across %d datasets (%d rows)' % (len(DATASETS), rows))
print('wrote ' + str(OUT))
