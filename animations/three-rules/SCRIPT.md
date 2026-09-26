# Pandion Plots: Three rules

A 48.6-second animated explainer for the top of the Learn page. It is a
JavaScript program, not a video file: every frame is drawn on a canvas as a
pure function of time, so it is crisp at any size, weighs about 40 KB
gzipped, can be scrubbed and chaptered, and renders frame-exact to MP4.

## Concept

The Pandion mark is an osprey diving along a straight trend line to seize
its final point. There are three points on that line, and the app has three
rules. The film opens with the three points (one rule each), spends one
chapter per rule inside a faithful, working replica of the app, and ends by
putting the rules back on the points just as the osprey lands on the last
one: the mark completes itself.

Everything inside the app is real: the replica's geometry, type sizes and
colors were measured from the live app, the chart is the app's own built-in
sample data (`sample-dose-response.csv`), and every behavior shown is what
the app does. The bracket's `***` is the Welch test the app runs for East
Control against East High dose (p = .00028, checked in R).

## Beat sheet

Music: D major, 100 BPM, so one bar is 2.4 s and every section starts on a
downbeat. The three ascending bell notes (F#, A, D) are the three rules: each
rule's title gets its note, and all three return when the osprey lands.

| Time | Bar | Picture | On screen | Sound |
| --- | --- | --- | --- | --- |
| 0.0 | 1 | The trend line draws; three points pop in, each with its rule's icon. | HOW PANDION WORKS / **Three rules.** / **Every chart.** / Learn them in under a minute. Points: Click, Drag, Add. | Pad; the three-note motif on the pops. |
| 4.0 | 2 | The headline lifts away; the first point flies left and becomes the Rule 1 badge. The app settles in behind a white wash. | | Arpeggios enter. |
| 4.8 | 3 | **Rule 1 title.** The cursor clicks the word "it.", which gets the app's dashed selection box and turns wing blue. | RULE 1 / Want to change something? / **Click it.** | Downbeat hit, F# bell. |
| 7.2 | 4 | The wash lifts on the whole app window; the camera moves in on the chart. The title collapses into the chapter pill. | Pill: Click to change / Click any bar. Its settings open below the chart. | Groove starts. |
| 9.1 | | Click an East bar: every East bar gets the selection halo and the Bars panel opens below the chart. | | Click, soft panel whoosh. |
| 10.5 | | Pick teal in the palette row: the recolor ripples across the series, the legend follows, the picker glides, undo lights up. | Pick a color. Every East bar follows. | Click, shimmer. |
| 12.2 | | Click the y-axis title; the Left axis title panel opens; select the text and type "Test score". The axis updates as you type. | Click a title, then type a new one. | Clicks, key ticks. |
| 15.5 | | Montage: legend, error bars, category label, each opening its own panel. Click empty space to close. | Legends, error bars, labels: click anything. | Clicks. |
| 19.2 | 9 | **Rule 2 title.** A hand grabs the displaced word "it." and drags it into place. | RULE 2 / Want to move something? / **Drag it.** | Riser, hit, A bell. |
| 21.6 | 10 | Grab the teal Control bar (the one clicked in Rule 1) and drag it right. Every teal bar travels with it, dimmed as in the app; when the pointer passes the red bar's center, the red bars step aside; on release every pair has swapped and the legend reads West, East. This is a plain drag. (Shift+drag moves a whole category, which a first-time user would not know, so the film does not show it.) | Pill: Drag to move / Drag a bar past its neighbor. Every pair swaps. | Grab, slide, drop. |
| 25.2 | | Drag the legend into the empty top-left of the plot. | Drag the legend to wherever it fits. | Grab, drop. |
| 28.8 | 13 | **Rule 3 title.** The cursor clicks a big + Add button; tiles of things you can add burst out. | RULE 3 / Want to add something? / **Click [+ Add]** | Riser, hit, D bell, sparkle. |
| 31.2 | 14 | Open the Add menu (the app's own icons), choose Data points: every observation drops onto its bar. | Pill: Click + to add / Everything you can add lives under + Add. / Add the data points. | Pop, a pentatonic plink per point. |
| 35.2 | | Add a significance bracket; drag each end onto a bar (pink snap guides, as in the app); the label computes to `***`. | Add a significance bracket, / then drag its ends onto two bars. / It runs the test for you. | Pop, snaps, chime. |
| 40.8 | 18 | Pull back to the whole app with the finished chart; the app fades. | | Drums drop out. |
| 42.6 | | The three points return on the beat, each with its rule written beside it; the line connects them. | Click to change. / Drag to move. / Click + to add. | The motif again. |
| 44.85 | | The osprey dives along the line and seizes the final point on the downbeat of bar 20. | | Rising whoosh, impact, D major resolves. |
| 46.0 | | Lockup. The last frame holds as the page's summary. | **Pandion Plots** / Clear statistical figures without the struggle. | Chord rings out. |

## Words

All on-screen copy, in order. No em dashes (house style).

- HOW PANDION WORKS / Three rules. / Every chart. / Learn them in under a minute.
- Rule 1: Want to change something? Click it.
  - Click any bar. Its settings open below the chart.
  - Pick a color. Every East bar follows.
  - Click a title, then type a new one.
  - Legends, error bars, labels: click anything.
- Rule 2: Want to move something? Drag it.
  - Drag a bar past its neighbor. Every pair swaps.
  - Drag the legend to wherever it fits.
- Rule 3: Want to add something? Click + Add.
  - Everything you can add lives under + Add.
  - Add the data points.
  - Add a significance bracket,
  - then drag its ends onto two bars.
  - It runs the test for you.
- Click to change. Drag to move. Click + to add.
- Pandion Plots. Clear statistical figures without the struggle.

## Design system

Everything comes from pandionplots.com and the app itself: navy #192E49,
cobalt #375CA0, wing #417499, kicker #8a6414, the white-to-wash hero
gradient with its soft blue glow, the system font at weight 800 with tight
tracking for headlines, the diving-straight mark (maroon #814850 points,
slate #646e76 line), and the wing mark lockup. Inside the app: the shipped
jewel palette (#2d5c94, #902634), the app's selection halo (#1a5fb4,
dashed 4.5/3, marching), its panels, toolbar and Add-menu icon artwork
(copied from the engine).
