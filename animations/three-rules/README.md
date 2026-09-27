# Three rules: the Learn-page tour

A pure-JavaScript animated explainer (no video file, no dependencies) that
teaches the three rules of Pandion Plots: click to change, drag to move,
click + to add. The script and beat sheet are in [SCRIPT.md](SCRIPT.md).

It is a hands-on tour (Torry, Sep 26 2026): the intro plays and stops on a
start card (**Try it yourself**, **Just watch**, or click one of the three
points to start at that rule). In hands-on mode the film stops at nine
steps and hands each one to the viewer: each rule's title is a door opened
with that rule's gesture (click "it.", drag "it." home, click + Add), then
click a bar, pick the teal swatch, type your own axis title (it stays on the
chart), drag a bar past its neighbor, choose Data points, and drag the
bracket's right end onto its bar so it runs the test. The steps between play
on their own with the film's cursor showing. Clicks are hit-tested against
the replica's own geometry and the film continues from its scripted press;
drags map the pointer's travel along the film's drag path to story time, so
the dragged part follows the hand (let go early and it springs back). Show
me (or Enter) does any step. Sound in hands-on mode plays the sound effects,
and Harper Lawson (the narration's voice) reads each stop's instruction a
beat after its card appears, then the end card's line; she fades out the
moment the viewer acts, and does not repeat herself when a drag springs
back. Try it yourself (or a rule on the start card) turns the sound on, the
way Just watch turns on the narration, unless the viewer turned it off
themselves.

**Watch mode is the narrated film** (Sep 26 2026): Just watch (on the start
card, the phone step card, or the end card) turns narration on and plays the
tour straight through, voiced by Harper Lawson (ElevenLabs v3). The picture
runs on a film clock with pauses where she speaks (`src/55-warp.js`, 87 s
instead of 48.6 s; the choreography itself is untouched and runs in story
time), over the score with the same extra bars, and her words show in the
caption band under the picture (CC toggles them, on by default; the C key
too). From the start card it plays from the top; from a step it carries on
from the start of the sentence under way. The Hands-on switch trades the two
clocks at the same moment of the film. The MP4 export stays the unnarrated
film (the warp is off unless the player is in Watch mode).

- Canvas renderer: every frame is a pure function of time, drawn on a
  1920 x 1080 stage and scaled to the container at device resolution.
- Soundtrack: synthesized in JavaScript (score and every sound effect, from
  the same cue sheet as the picture), rendered in a Web Worker only when the
  viewer turns sound on. Nothing is downloaded but the script.
- Size: about 149 KB minified, about 54 KB gzipped, plus the narration
  (Opus 476 KB, FLAC fallback 1.9 MB), fetched only when narration is wanted,
  and the hands-on prompts (Opus 157 KB, FLAC 606 KB), fetched with the
  sound effects the first time hands-on sound is on.
- Code for the tour: `src/85-guide.js` (the stops, their targets, hit tests,
  drag mapping, the hint layer) and `src/90-player.js` (the state machine,
  pointer handling, the coach card, start and end cards). Checks:
  `node tools/tour-check.mjs <url> [outDir] [chromium|webkit] [width]` walks
  every stop like a visitor; `node tools/tour-behavior.mjs <url> [engine]`
  covers picking a rule, an early release, Show me, a miss, Enter, Watch
  mode and sound; `node tools/tour-replay-check.mjs <url> [engine]` walks the
  tour, presses Replay and checks the start card carries nothing over from
  the last run; `node tools/tour-watch-check.mjs <learn page url> [engine]
  [offline mix]` covers Watch mode on the Learn page itself (no voice fetch
  before Just watch, narration and captions, the held last frame, the clock
  trade both ways, the phone step card) and, given the narration pipeline's
  `out/vo/mix-48k.wav`, checks the player's mix against it;
  `node tools/tour-prompts-check.mjs <learn page url> [engine]` covers the
  spoken prompts (nothing fetched before Try it yourself, the right clip at
  every stop at the narration's gain, fading out on the viewer's action,
  no repeat after an early release, muting, the end card, none in Watch
  mode, and Try it yourself leaving an explicit mute alone).
  `node tools/single-file.mjs` makes a self-contained page,
  `node tools/record-demo.mjs` a recorded walkthrough.

## On the page

```html
<div data-pandion-three-rules
     data-describedby="id-of-a-transcript"
     data-label="Interactive tour: Pandion Plots in three rules">
  <img src="assets/three-rules/poster.jpg" ...>   <!-- no-JS fallback -->
</div>
<script src="assets/three-rules/pandion-three-rules.min.js" defer></script>
```

The script mounts every `[data-pandion-three-rules]` element. The poster
inside is replaced by the player. Options: `data-autoplay="false"`,
`data-describedby`, `data-label`. Or call
`window.PandionThreeRules.mount(element, { autoplay: true, mode: 'try' | 'watch' })`.

Player behavior:

- Plays muted once it is mostly in view (the intro, then the start card);
  pauses when scrolled away or when the tab is hidden; resumes where it
  left off.
- Never autoplays under `prefers-reduced-motion`: those viewers open on the
  start card and go at their own pace.
- Before the first play it shows the start card's frame, then dissolves
  into playback.
- Hands-on mode: the coach card sits beside each target (under the picture
  on phones), every target is at least 32 CSS px to tap, keyboard users
  land on Show me, the coach text is announced, and the typing step is a
  real text field over the drawn one.
- Chapter bar (Intro, Click, Drag, Add, Recap): click a chapter to seek into
  it. Sound toggle renders the score (or, hands-on, the effects alone) on
  first use (under a second). The Hands-on switch flips to Watch and back.
- Keyboard, with the player focused: Space or K play and pause (at a stop,
  Enter or Space shows the step), arrows seek 5 s, Home and End, M toggles
  sound.
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
| `54-warp-data.js` | GENERATED: the narrated film's pauses (story time, window, added seconds) |
| `55-warp.js` | Watch mode's film clock: story time to film time and back, the narrated score plan |
| `56-narration-cues.js` | GENERATED: the narration's caption cues in film time |
| `57-prompt-clips.js` | GENERATED: where each hands-on prompt sits in the prompts file |
| `60-overlay.js` | background, intro, rule titles, chapter pill, finale, cursor |
| `70-render.js` | the frame renderer |
| `80-audio.js` | the DSP synthesizer (score + sound effects) |
| `85-guide.js` | the hands-on tour: stops, targets, hit tests, drag mapping, hints |
| `90-player.js` | the player (controls, autoplay, sound, accessibility) |

The narration comes from the pipeline in `~/Desktop/Pandion Learn Animation
ElevenLabs` (its README and `tools/vo/`): takes are generated in ElevenLabs,
fitted to the picture (`tools/vo/fit.py`, which writes the pauses), mastered,
and packaged. After a re-voice, copy its `src/54-warp-data.js`, regenerate the
cues (`tools/vo/cues_js.py vo/script.json out/vo/placement.json
<this folder>/src/56-narration-cues.js`) and copy
`dist/pandion-three-rules-voice.{webm,flac}` to `website/assets/three-rules/`.
The hands-on prompts come from the same pipeline: `vo/prompts.json` names
each stop's take, `tools/vo/prompts.py vo/prompts.json
<this folder>/src/57-prompt-clips.js` trims, masters and packages them, and
`tools/vo/prompts_verify.py` checks every clip through the web encodings;
copy `dist/pandion-three-rules-prompts.{webm,flac}` to
`website/assets/three-rules/`. A new stop needs a prompt keyed by its gate
id (a stop without one is simply silent).

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
