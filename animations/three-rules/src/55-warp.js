/* Watch mode (the narrated film): the picture waits for the voice.
 *
 * WARP.on is false for the hands-on tour and the MP4 export (story time,
 * the approved film); the player turns it on in Watch mode, where its clock
 * runs in film time and renderFrame maps it back to story time.
 *
 * The choreography in 50-story.js runs in STORY time, exactly as in the
 * approved film. The narrated film runs in FILM time: at chosen rest points
 * (the cursor has arrived, a panel has finished opening) the story eases
 * into a pause and out again, so the narrator can explain while nothing the
 * app itself animates is slowed. Each pause adds `dur` seconds of film,
 * spread over a `w`-second window of story time with a quintic smoothstep,
 * so the story's speed falls smoothly to almost zero and back (no jolt).
 *
 * The pauses live in vo/warp.json and are generated into WARP_HOLDS
 * (src/54-warp-data.js) by tools/vo/warp_gen.py, which also mirrors this
 * math for the narration tools. Pauses in each section add whole bars
 * (2.4 s) so every title hit and the osprey's landing stay on a downbeat;
 * the music gets the same number of extra bars (FILM_PLAN). */

/* ambient: narrated hands-on keeps story time but runs through the pauses;
 * its ambient motion (marching outlines, drift) follows film time too */
var WARP = { on: false, ambient: false };
function _warpP5(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * x * (x * (x * 6 - 15) + 10); }
var WARP_TOTAL = 0;
for (var _wi = 0; _wi < WARP_HOLDS.length; _wi++) WARP_TOTAL += WARP_HOLDS[_wi].dur;
/* story time -> film time (monotone, smooth) */
function filmTime(s) {
  var f = s;
  for (var i = 0; i < WARP_HOLDS.length; i++) {
    var h = WARP_HOLDS[i];
    f += h.dur * _warpP5((s - (h.at - h.w / 2)) / h.w);
  }
  return f;
}
/* film time -> story time (bisection: filmTime(s) lies in [s, s + WARP_TOTAL]) */
function storyTime(f) {
  if (!WARP_HOLDS.length) return f;
  var lo = Math.max(0, f - WARP_TOTAL), hi = Math.max(0, f);
  for (var k = 0; k < 48; k++) { var m = (lo + hi) / 2; if (filmTime(m) < f) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
var FILM_DURATION = filmTime(DURATION);
/* the soundtrack runs past the last frame: the tagline finishes over the held
 * final frame and the closing chord rings out (the tail fade starts after it).
 * 2.0 s since the naturalness pass: the tagline is read at the passages' pace
 * now (it was the fastest line), so it ends about 0.9 s later. */
var FILM_AUDIO_DURATION = FILM_DURATION + 2.0;
var FILM_CHAPTERS = CHAPTERS.map(function (c) { return { id: c.id, label: c.label, t: filmTime(c.t) }; });
var FILM_SFX = SFX.map(function (c) { return { t: filmTime(c.t), k: c.k, v: c.v }; });
var FILM_FINALE = { line: filmTime(FINALE.line), dots: FINALE.dots.map(filmTime), dive: filmTime(FINALE.dive), land: filmTime(FINALE.land), lockup: filmTime(FINALE.lockup) };
var FILM_TITLES = [filmTime(T.r1), filmTime(T.r2), filmTime(T.r3)];

/* The score, bar by bar, with the extra bars each section needs. The base
 * plan is the unnarrated film's (it must match the default inside
 * renderSoundtrack; tools/vo/check-warp.mjs verifies the unwarped render is
 * byte-identical). Extra groove bars repeat the section's own progression
 * and go before its last bar, so each section still resolves into the next
 * title on the dominant. */
var BASE_PLAN = [
  ['Dmaj9', 'intro'], ['Bm9', 'intro2'],
  ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A7sus', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'],
  ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'],
  ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'], ['Gmaj7', 'groove2'],
  ['Gmaj9', 'recap'], ['A7sus', 'build'], ['Dmaj9', 'final'], ['Dmaj9', 'tail']
];
var FILM_PLAN = (function () {
  var CYCLE = ['Bm7', 'Gmaj7', 'A7sus', 'Gmaj7'];
  /* sections as [first bar, last bar] of BASE_PLAN, and their story spans */
  var secs = [[0, 1], [2, 2], [3, 7], [8, 8], [9, 11], [12, 12], [13, 16], [17, 20]];
  var out = [], bar = 2.4;
  for (var s = 0; s < secs.length; s++) {
    var a = secs[s][0], b = secs[s][1], t0 = a * bar, t1 = (b + 1) * bar;
    var added = 0;
    for (var i = 0; i < WARP_HOLDS.length; i++) if (WARP_HOLDS[i].at >= t0 && WARP_HOLDS[i].at < t1) added += WARP_HOLDS[i].dur;
    var extra = Math.round(added / bar);
    if (Math.abs(extra * bar - added) > 1e-6) throw new Error('pauses in bars ' + a + '-' + b + ' add ' + added + ' s, not whole bars');
    /* insert before the section's last groove bar (its dominant), so the
     * progression still resolves; the intro gets calm pad bars before its
     * build; the last section (recap to the end) only ever grows at its end */
    var ins = b;
    for (var g = a; g <= b; g++) if (BASE_PLAN[g][1] === 'groove') ins = g;
    for (var k = a; k <= b; k++) {
      if (k === ins && extra > 0 && s < secs.length - 1) {
        for (var e = 0; e < extra; e++) {
          if (s === 0) out.push(['Gmaj9', 'intro']);
          /* continue the film's four-chord cycle from where the section's own
           * bars leave off, so long stretches keep moving harmonically */
          else out.push([CYCLE[(ins - a + e) % CYCLE.length], 'groove']);
        }
      }
      out.push(BASE_PLAN[k].slice());
    }
    if (s === secs.length - 1) for (var e2 = 0; e2 < extra; e2++) out.push(['Dmaj9', 'tail']);
  }
  return out;
})();
