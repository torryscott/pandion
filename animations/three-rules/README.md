# Three rules: the Learn-page animation

A pure-JavaScript animated explainer (no video file, no dependencies) that
teaches the three rules of Pandion Plots: click to change, drag to move,
click + to add. The script and beat sheet are in [SCRIPT.md](SCRIPT.md).

- Canvas renderer: every frame is a pure function of time, drawn on a
  1920 x 1080 stage and scaled to the container at device resolution.
- Soundtrack: synthesized in JavaScript (score and every sound effect, from
  the same cue sheet as the picture), rendered in a Web Worker only when the
  viewer turns sound on. Nothing is downloaded but the script.
- Size: about 105 KB minified, about 39 KB gzipped.

## On the page

```html
<div data-pandion-three-rules
     data-describedby="id-of-a-transcript"
     data-label="Animation: Pandion Plots in three rules">
  <img src="assets/three-rules/poster.jpg" ...>   <!-- no-JS fallback -->
</div>
<script src="assets/three-rules/pandion-three-rules.min.js" defer></script>
```

The script mounts every `[data-pandion-three-rules]` element. The poster
inside is replaced by the player. Options: `data-autoplay="false"`,
`data-describedby`, `data-label`. Or call
`window.PandionThreeRules.mount(element, { autoplay: true })`.

Player behavior:

- Plays muted once it is mostly in view; pauses when scrolled away or when
  the tab is hidden; resumes where it left off.
- Never autoplays under `prefers-reduced-motion`: those viewers see the
  final frame (the three rules beside the mark) and a Play button.
- Before the first play it shows the finished title frame, then dissolves
  into playback.
- Chapter bar (Intro, Click, Drag, Add, Recap): click a chapter to seek into
  it. Sound toggle renders the score on first use (under a second).
- Keyboard, with the player focused: Space or K play and pause, arrows seek
  5 s, Home and End, M toggles sound.
- Under 700 px wide the in-picture captions move to a real text line under
  the picture, so phones can read them.
- The picture is `aria-hidden`; the region is labelled and described by the
  transcript on the page.

## Source

`src/*.js` concatenate, in order, into one IIFE:

| File | Contents |
| --- | --- |
| `00-core.js` | math, easing, springs, OKLab color mixing, text helpers |
| `05-brand.js` | brand path data, extracted verbatim from `website/assets/*.svg` |
| `10-assets.js` | the engine's own Add-menu and graph-type icons, cursors, UI glyphs |
| `20-app.js` | the app window replica (app bar, rails, toolbar, work card) |
| `30-chart.js` | the grouped bar chart, halos, legend, data points, bracket |
| `40-panels.js` | inspector panels, HSV picker, Add menu |
| `50-story.js` | the script: cue times, camera, cursor, all UI state as f(t) |
| `60-overlay.js` | background, intro, rule titles, chapter pill, finale, cursor |
| `70-render.js` | the frame renderer |
| `80-audio.js` | the DSP synthesizer (score + sound effects) |
| `90-player.js` | the player (controls, autoplay, sound, accessibility) |

The replica's positions, colors and type sizes were measured from the live
app (`website/app/`) on 26 Sep 2026 with `tools/capture-app.mjs`,
`tools/probe-styles.mjs` and `tools/probe-axes.mjs`. If the app's toolbar,
panels or chart layout change enough to notice, re-run those against a
local copy of the site and update `APP`, `TB`, `CH` and the panel layouts.

## Commands

```bash
npm install                                   # playwright 1.62, ffmpeg-static, terser, axe-core
node tools/build.mjs --site ../../website/assets/three-rules
node tools/serve.cjs . 8863                   # then open /dev.html or /player-test.html
node tools/export.mjs out/three-rules.mp4 60 1920
node tools/frames.mjs out/frames 3.2 10.5 45.6   # stills at chosen times
node tools/player-check.mjs http://127.0.0.1:8863/player-test.html
node tools/motion-check.mjs                   # 60 fps scan for jumps
```

`dev.html` loads the sources directly and has a scrubber; add `?t=12.3` to
open at a time.
