/* Soundtrack: a small DSP synthesizer in plain JavaScript. It renders the
 * score and every sound effect into two Float32Arrays, deterministically.
 * The same function runs in a Web Worker (in the page) and in Node (for
 * the MP4 export), so what you hear on the site is what the film carries.
 *
 * Score: D major, 100 BPM (a bar is 2.4 s). Each rule lands on the tonic.
 * The three ascending bell notes (F#, A, D) are the three rules; the film
 * hands one to each rule and plays all three again when the osprey lands. */

function renderSoundtrack(opts) {
  'use strict';
  var SR = opts.sampleRate || 44100;
  var DUR = opts.duration;
  var cues = opts.cues || [];
  var BAR = 2.4, BEAT = 0.6;
  var N = Math.ceil((DUR + 2.5) * SR);
  function buf() { return new Float32Array(N); }
  /* buses */
  var padL = buf(), padR = buf(), keyL = buf(), keyR = buf(), bass = buf(), drmL = buf(), drmR = buf();
  var sfxL = buf(), sfxR = buf(), revInL = buf(), revInR = buf(), dlyInL = buf(), dlyInR = buf();
  var kickEnv = buf(); /* for gentle sidechain ducking */

  /* ---- helpers ---- */
  var seed = 1234567;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function noise() { return rnd() * 2 - 1; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  /* table sine: phase in cycles, any real value */
  var TAB = new Float32Array(4097);
  for (var ti = 0; ti <= 4096; ti++) TAB[ti] = Math.sin(2 * Math.PI * ti / 4096);
  function fsin(ph) {
    ph -= Math.floor(ph);
    var x = ph * 4096, i = x | 0, fr = x - i;
    return TAB[i] + (TAB[i + 1] - TAB[i]) * fr;
  }
  /* every voice ends on a short fade so nothing stops while still audible */
  var FADE = Math.floor(0.04 * SR);
  function tf(k, n) { var r = n - k; return r >= FADE ? 1 : r <= 0 ? 0 : r / FADE; }
  function panGains(p) { var a = (p + 1) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; }
  function polyblep(t, dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }
  /* RBJ biquad, coefficients recomputed by the caller when needed */
  function Biquad() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.b0 = 1; this.b1 = this.b2 = this.a1 = this.a2 = 0; }
  Biquad.prototype.set = function (type, f, q) {
    f = Math.min(f, SR * 0.45);
    var w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } /* bp, constant 0 dB peak */
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  };
  Biquad.prototype.run = function (x) {
    var y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  };
  function add(L, R, i, v, g) { if (i >= 0 && i < N) { L[i] += v * g[0]; R[i] += v * g[1]; } }

  /* ---- instruments ---- */
  /* Warm pad: detuned polyBLEP saws, summed per side, then one breathing
   * low-pass per side (cheap enough to render the whole score in a blink). */
  function padChord(t0, dur, notes, level, cutoff) {
    var att = 0.9, rel = 1.4, total = dur + rel * 1.6;
    var i0 = Math.floor(t0 * SR), n = Math.floor(total * SR);
    var sL = new Float32Array(n), sR = new Float32Array(n);
    for (var v = 0; v < notes.length; v++) {
      for (var d = 0; d < 2; d++) {
        var f = mtof(notes[v]) * Math.pow(2, (d ? 6 : -6) / 1200), ph = rnd(), dt = f / SR;
        var main = d ? sR : sL, cross = d ? sL : sR;
        for (var k = 0; k < n; k++) {
          ph += dt; if (ph >= 1) ph -= 1;
          var s = 2 * ph - 1 - polyblep(ph, dt);
          main[k] += s * 0.8; cross[k] += s * 0.2;
        }
      }
    }
    var amp = level / Math.sqrt(notes.length) * 0.5;
    var sides = [[sL, padL], [sR, padR]];
    for (var q = 0; q < 2; q++) {
      var src = sides[q][0], dst = sides[q][1], lp = new Biquad(), lp2 = new Biquad();
      for (var k2 = 0; k2 < n; k2++) {
        if ((k2 & 31) === 0) {
          var fc = cutoff * (1 + 0.16 * Math.sin(2 * Math.PI * 0.13 * (t0 + k2 / SR) + q * 1.7));
          lp.set('lp', fc, 0.6); lp2.set('lp', fc * 1.5, 0.55);
        }
        var tk = k2 / SR;
        var env = (tk < att ? Math.sin(0.5 * Math.PI * tk / att) : tk < dur ? 1 : Math.exp(-(tk - dur) / (rel * 0.35))) * tf(k2, n);
        var y = lp2.run(lp.run(src[k2])) * env * amp;
        if (i0 + k2 < N) dst[i0 + k2] += y;
      }
    }
  }
  /* Electric-piano tine: two-operator FM with a decaying index. */
  function tine(t0, midi, vel, pan, dec) {
    var f = mtof(midi), n = Math.floor((dec * 4 + 0.05) * SR), i0 = Math.floor(t0 * SR);
    var g = panGains(pan), pc = 0, pm = 0, dc = f / SR, dm = f / SR, ptine = 0, dtine = 4.0 * f / SR;
    var e1 = 1, k1 = Math.exp(-1 / (dec * SR)), e2 = 1, k2 = Math.exp(-1 / (0.08 * SR)), e3 = 1, k3 = Math.exp(-1 / (0.05 * SR));
    var att = Math.floor(0.003 * SR);
    for (var k = 0; k < n; k++) {
      var idx = 2.3 * e2 + 0.35;
      pm += dm; pc += dc; ptine += dtine;
      var env = (k < att ? k / att : 1) * e1 * tf(k, n);
      var y = fsin(pc + fsin(pm) * idx / (2 * Math.PI)) * env + 0.26 * fsin(ptine) * e3;
      e1 *= k1; e2 *= k2; e3 *= k3;
      y *= vel * 0.22;
      var ii = i0 + k;
      if (ii < N) {
        keyL[ii] += y * g[0]; keyR[ii] += y * g[1];
        dlyInL[ii] += y * g[0] * 0.5; dlyInR[ii] += y * g[1] * 0.5;
      }
    }
  }
  /* Glassy bell (the three-rules motif). */
  function bell(t0, midi, vel, pan, send, bus) {
    var f = mtof(midi), n = Math.floor(3.2 * SR), i0 = Math.floor(t0 * SR);
    var g = panGains(pan || 0);
    var parts = [[1, 1, 1.6], [2.0, 0.28, 0.9], [3.0, 0.12, 0.55], [4.16, 0.07, 0.35], [5.43, 0.04, 0.2]];
    var L = bus === 'sfx' ? sfxL : keyL, R = bus === 'sfx' ? sfxR : keyR;
    var ph = [], dp = [], amp = [], km = [];
    for (var p = 0; p < parts.length; p++) { ph.push(0); dp.push(f * parts[p][0] / SR); amp.push(parts[p][1]); km.push(Math.exp(-1 / (parts[p][2] * SR))); }
    var att = Math.floor(0.002 * SR), sd = send || 0.5;
    for (var k = 0; k < n; k++) {
      var y = 0;
      for (var q = 0; q < 5; q++) { ph[q] += dp[q]; y += fsin(ph[q]) * amp[q]; amp[q] *= km[q]; }
      y *= vel * 0.16 * (k < att ? k / att : 1) * tf(k, n);
      var ii = i0 + k;
      if (ii < N) { L[ii] += y * g[0]; R[ii] += y * g[1]; revInL[ii] += y * g[0] * sd; revInR[ii] += y * g[1] * sd; }
    }
  }
  function bassNote(t0, midi, dur, vel) {
    var f = mtof(midi), n = Math.floor((dur + 0.12) * SR), i0 = Math.floor(t0 * SR), ph = 0, dt = f / SR;
    var lp = new Biquad(); lp.set('lp', 650, 0.7);
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var env = (tk < 0.006 ? tk / 0.006 : 1) * (tk > dur ? Math.exp(-(tk - dur) / 0.04) : 1) * (0.78 + 0.22 * Math.exp(-tk / 0.2));
      ph += dt; if (ph >= 1) ph -= 1;
      var s = 0.8 * fsin(ph) + 0.42 * fsin(2 * ph) + 0.16 * fsin(3 * ph) + 0.06 * fsin(4 * ph);
      var y = Math.tanh(lp.run(s) * 1.4) * env * vel * 0.21 * tf(k, n);
      if (i0 + k < N) bass[i0 + k] += y;
    }
  }
  function kick(t0, vel) {
    var n = Math.floor(0.45 * SR), i0 = Math.floor(t0 * SR), ph = 0;
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var f = 54 + 100 * Math.exp(-tk / 0.026);
      ph += f / SR;
      var y = fsin(ph) * Math.exp(-tk / 0.13) + (tk < 0.003 ? noise() * 0.12 * (1 - tk / 0.003) : 0);
      y *= vel * 0.42 * tf(k, n);
      if (i0 + k < N) { drmL[i0 + k] += y; drmR[i0 + k] += y; kickEnv[i0 + k] = Math.max(kickEnv[i0 + k], Math.exp(-tk / 0.12) * vel); }
    }
  }
  function snap(t0, vel) {
    var n = Math.floor(0.35 * SR), i0 = Math.floor(t0 * SR), bp = new Biquad(), hp = new Biquad();
    bp.set('bp', 1900, 1.1); hp.set('hp', 700, 0.7);
    var g = panGains(-0.08);
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var e = Math.exp(-tk / 0.06) * (1 + 0.8 * (tk > 0.009 && tk < 0.012 ? 1 : 0) + 0.6 * (tk > 0.019 && tk < 0.022 ? 1 : 0));
      var y = hp.run(bp.run(noise())) * e * vel * 0.34 * tf(k, n);
      add(drmL, drmR, i0 + k, y, g);
      if (i0 + k < N) { revInL[i0 + k] += y * 0.35; revInR[i0 + k] += y * 0.35; }
    }
  }
  function hat(t0, vel, open) {
    var n = Math.floor((open ? 0.25 : 0.07) * SR), i0 = Math.floor(t0 * SR), hp = new Biquad(), hp2 = new Biquad();
    hp.set('hp', 7200, 0.8); hp2.set('hp', 9000, 0.7);
    var g = panGains(0.3), tau = open ? 0.09 : 0.022;
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var y = hp2.run(hp.run(noise())) * Math.exp(-tk / tau) * vel * 0.19 * tf(k, n);
      add(drmL, drmR, i0 + k, y, g);
    }
  }
  function shaker(t0, vel) {
    var n = Math.floor(0.09 * SR), i0 = Math.floor(t0 * SR), bp = new Biquad();
    bp.set('bp', 6200, 1.4);
    var g = panGains(-0.35);
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var e = (tk < 0.012 ? tk / 0.012 : Math.exp(-(tk - 0.012) / 0.028));
      add(drmL, drmR, i0 + k, bp.run(noise()) * e * vel * 0.14, g);
    }
  }
  function boom(t0, vel) {
    var n = Math.floor(1.6 * SR), i0 = Math.floor(t0 * SR), ph = 0;
    for (var k = 0; k < n; k++) {
      var tk = k / SR, f = 42 + 30 * Math.exp(-tk / 0.08);
      ph += f / SR;
      var y = Math.sin(2 * Math.PI * ph) * Math.exp(-tk / 0.42) * vel * 0.3 * (tk < 0.01 ? tk / 0.01 : 1) * tf(k, n);
      if (i0 + k < N) { sfxL[i0 + k] += y; sfxR[i0 + k] += y; }
    }
  }
  /* Filtered-noise sweep: whooshes, risers, the osprey's dive. */
  function sweep(t0, dur, f0, f1, vel, shape, pan0, pan1, send) {
    var n = Math.floor(dur * SR), i0 = Math.floor(t0 * SR), bp = new Biquad(), bp2 = new Biquad();
    for (var k = 0; k < n; k++) {
      var u = k / n;
      if ((k & 15) === 0) { var fc = f0 * Math.pow(f1 / f0, u); bp.set('bp', fc, 1.3); bp2.set('bp', fc * 1.02, 1.1); }
      var e = shape === 'rise' ? Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1)
            : shape === 'fall' ? Math.pow(1 - u, 1.6) * Math.min(1, u / 0.02)
            : Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
      var g = panGains(lerpA(pan0 || 0, pan1 || 0, u));
      var y = bp2.run(bp.run(noise())) * e * vel * 0.5;
      add(sfxL, sfxR, i0 + k, y, g);
      if (send && i0 + k < N) { revInL[i0 + k] += y * send * g[0]; revInR[i0 + k] += y * send * g[1]; }
    }
  }
  function lerpA(a, b, t) { return a + (b - a) * t; }
  /* UI sounds */
  function uiClick(t0, vel, pan) {
    var n = Math.floor(0.05 * SR), i0 = Math.floor(t0 * SR), bp = new Biquad();
    bp.set('bp', 3600, 1.8);
    var g = panGains(pan || 0), ph = 0;
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      ph += 2350 / SR;
      var y = bp.run(noise()) * Math.exp(-tk / 0.0045) * 0.9
            + Math.sin(2 * Math.PI * ph) * Math.exp(-tk / 0.006) * 0.35
            + Math.sin(2 * Math.PI * 190 * tk) * Math.exp(-tk / 0.012) * 0.45;
      add(sfxL, sfxR, i0 + k, y * vel * 0.3, g);
    }
  }
  function keyTick(t0, vel, pan) {
    var n = Math.floor(0.03 * SR), i0 = Math.floor(t0 * SR), bp = new Biquad();
    bp.set('bp', 2500 + rnd() * 1800, 2.2);
    var g = panGains(pan || 0);
    for (var k = 0; k < n; k++) {
      var tk = k / SR;
      var y = bp.run(noise()) * Math.exp(-tk / 0.0035) + Math.sin(2 * Math.PI * 1150 * tk) * Math.exp(-tk / 0.004) * 0.25;
      add(sfxL, sfxR, i0 + k, y * vel * 0.2, g);
    }
  }
  function popSound(t0, vel, f0, f1) {
    var n = Math.floor(0.14 * SR), i0 = Math.floor(t0 * SR), ph = 0;
    for (var k = 0; k < n; k++) {
      var tk = k / SR, f = f0 + (f1 - f0) * (1 - Math.exp(-tk / 0.025));
      ph += f / SR;
      var y = Math.sin(2 * Math.PI * ph) * Math.exp(-tk / 0.04) * (tk < 0.002 ? tk / 0.002 : 1) * tf(k, n);
      add(sfxL, sfxR, i0 + k, y * vel * 0.2, [0.7, 0.7]);
      if (i0 + k < N) { revInL[i0 + k] += y * vel * 0.03; revInR[i0 + k] += y * vel * 0.03; }
    }
  }
  function thud(t0, vel) {
    var n = Math.floor(0.2 * SR), i0 = Math.floor(t0 * SR), ph = 0, lp = new Biquad();
    lp.set('lp', 900, 0.7);
    for (var k = 0; k < n; k++) {
      var tk = k / SR, f = 90 + 90 * Math.exp(-tk / 0.03);
      ph += f / SR;
      var y = (Math.sin(2 * Math.PI * ph) * Math.exp(-tk / 0.07) * 0.8 + lp.run(noise()) * Math.exp(-tk / 0.01) * 0.3) * tf(k, n);
      add(sfxL, sfxR, i0 + k, y * vel * 0.3, [0.7, 0.7]);
    }
  }

  /* ---- the score ---- */
  /* chords as MIDI note sets (pad voicing, mid register) */
  var CH = {
    Dmaj9: [57, 62, 64, 66, 69, 73], D: [57, 62, 66, 69, 74], Bm7: [54, 57, 62, 66, 69], Gmaj7: [55, 59, 62, 66, 71],
    A: [57, 61, 64, 69, 73], A7sus: [57, 62, 64, 67, 69], Bm9: [54, 57, 61, 62, 66, 69], Gmaj9: [55, 59, 62, 66, 69, 71]
  };
  var ROOT = { Dmaj9: 38, D: 38, Bm7: 35, Gmaj7: 43, A: 45, A7sus: 45, Bm9: 35, Gmaj9: 43 };
  /* bar-by-bar plan: chord, section flags */
  var PLAN = [
    ['Dmaj9', 'intro'], ['Bm9', 'intro2'],
    ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A7sus', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'],
    ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'],
    ['D', 'title'], ['Bm7', 'groove'], ['Gmaj7', 'groove'], ['A', 'groove'], ['Gmaj7', 'groove2'],
    ['Gmaj9', 'recap'], ['A7sus', 'build'], ['Dmaj9', 'final'], ['Dmaj9', 'tail']
  ];
  var ARP = { /* tine arpeggio pitches per chord */
    Dmaj9: [62, 66, 69, 73, 76, 73, 69, 66], D: [62, 66, 69, 74, 78, 74, 69, 66], Bm7: [59, 62, 66, 69, 74, 69, 66, 62],
    Gmaj7: [59, 62, 66, 67, 71, 67, 66, 62], A: [61, 64, 69, 73, 76, 73, 69, 64], A7sus: [62, 64, 67, 69, 74, 69, 67, 64],
    Bm9: [59, 61, 66, 69, 73, 69, 66, 61], Gmaj9: [59, 62, 66, 69, 71, 69, 66, 62]
  };
  for (var b = 0; b < PLAN.length; b++) {
    var ch = PLAN[b][0], sec = PLAN[b][1], t0 = b * BAR;
    if (t0 > DUR + 1) break;
    var padLvl = sec === 'final' ? 0.62 : sec === 'tail' ? 0 : sec === 'recap' || sec === 'build' ? 0.5 : sec.indexOf('intro') === 0 ? 0.42 : 0.36;
    if (padLvl > 0) padChord(t0, BAR, CH[ch], padLvl, sec === 'final' ? 2800 : sec === 'intro' ? 1300 : 2000);
    if (sec === 'final') padChord(t0 + BAR, BAR * 0.6, CH[ch], 0.42, 2200);
    /* tine arpeggios (8ths) */
    var arp = ARP[ch] || ARP.D;
    var arpOn = sec !== 'intro' && sec !== 'tail';
    if (arpOn) {
      for (var e = 0; e < 8; e++) {
        if (sec === 'title' && e >= 4) break;
        if (sec === 'intro2' && e < 4) continue;
        if (sec === 'final' && e > 0) break;
        var vel = (e % 2 === 0 ? 0.75 : 0.55) * (sec === 'intro2' ? 0.55 : sec === 'recap' ? 0.62 : sec === 'final' ? 0.9 : 1);
        tine(t0 + e * BEAT / 2, arp[e], vel, (e % 2 ? 0.35 : -0.35), sec === 'final' ? 1.4 : 0.42);
      }
    }
    /* bass */
    if (sec === 'groove' || sec === 'groove2' || sec === 'title' || sec === 'build') {
      var r = ROOT[ch];
      if (sec === 'title') bassNote(t0, r, BAR * 0.9, 0.9);
      else if (sec === 'build') { bassNote(t0, r, BEAT * 1.4, 0.7); bassNote(t0 + BEAT * 2, r, BEAT * 1.4, 0.75); }
      else {
        bassNote(t0, r, BEAT * 1.35, 1); bassNote(t0 + BEAT * 1.5, r, BEAT * 0.4, 0.7);
        bassNote(t0 + BEAT * 2, r, BEAT * 1.35, 0.95); bassNote(t0 + BEAT * 3.5, r + 12, BEAT * 0.4, 0.6);
      }
    }
    if (sec === 'final') bassNote(t0, ROOT[ch], BAR * 1.1, 1.0);
    /* drums */
    if (sec === 'groove' || sec === 'groove2') {
      kick(t0, 0.9); kick(t0 + BEAT * 2, 0.8);
      if (b % 2 === 1) kick(t0 + BEAT * 3.5, 0.45);
      snap(t0 + BEAT, 0.7); snap(t0 + BEAT * 3, 0.75);
      for (var h = 0; h < 8; h++) hat(t0 + h * BEAT / 2 + (h % 2 ? 0.012 : 0), h % 2 ? 0.9 : 0.55, h === 7 && b % 4 === 3);
      for (var sk = 0; sk < 16; sk++) if (sk % 4 !== 0) shaker(t0 + sk * BEAT / 4 + (sk % 2 ? 0.008 : 0), sk % 2 ? 0.8 : 0.5);
    } else if (sec === 'title') {
      kick(t0, 1.0);
      hat(t0 + BEAT * 2, 0.5, true);
    } else if (sec === 'intro2') {
      for (var h2 = 4; h2 < 8; h2++) hat(t0 + h2 * BEAT / 2, 0.35 + 0.1 * (h2 - 4), false);
    }
  }
  /* the motif */
  var MOTIF = [66, 69, 74]; /* F#4.. up an octave below: F#5 A5 D6 */
  function motif(times, vel, send) { for (var m = 0; m < times.length; m++) bell(times[m], MOTIF[m] + 12, vel, (m - 1) * 0.25, send, 'keys'); }
  /* intro: the three dots */
  motif([0.6, 0.9, 1.2], 0.85, 0.55);
  /* rule titles: each rule gets its own note of the motif, over a soft boom */
  var titleT = [2 * BAR, 8 * BAR, 12 * BAR];
  for (var q = 0; q < 3; q++) {
    bell(titleT[q], MOTIF[q] + 12, 0.95, 0, 0.7, 'keys');
    bell(titleT[q], MOTIF[q], 0.45, 0, 0.7, 'keys');
    boom(titleT[q], 0.8);
    sweep(titleT[q] - 1.35, 1.35, 300, 2600, 0.3, 'rise', -0.3, 0.3, 0.4);
  }
  /* finale: the three points take their rules, then the osprey lands on D */
  var fin = opts.finale || { dots: [42.6, 43.2, 43.8], land: 45.6, dive: 44.8 };
  motif(fin.dots, 0.9, 0.6);
  sweep(fin.dive - 0.15, (fin.land - fin.dive) + 0.25, 700, 5200, 0.55, 'rise', -0.6, 0.35, 0.3);
  boom(fin.land, 1.0);
  bell(fin.land, 74 + 12, 0.85, 0.1, 0.8, 'keys');
  bell(fin.land, 66 + 12, 0.5, -0.15, 0.8, 'keys');
  bell(fin.land + 0.02, 69, 0.55, 0.2, 0.8, 'keys');

  /* ---- sound effects from the film's cue sheet ---- */
  var PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
  for (var c = 0; c < cues.length; c++) {
    var cu = cues[c], ct = cu.t;
    switch (cu.k) {
      case 'click': uiClick(ct, 1, 0.05); break;
      case 'clickSoft': uiClick(ct, 0.75, 0.05); break;
      case 'grab': uiClick(ct, 0.55, 0); thud(ct, 0.35); break;
      case 'drop': thud(ct, 0.7); uiClick(ct + 0.01, 0.4, 0); break;
      case 'panelOpen': sweep(ct, 0.32, 500, 2400, 0.12, 'swell', -0.2, 0.2, 0); break;
      case 'panelClose': sweep(ct, 0.3, 2200, 500, 0.1, 'swell', 0.2, -0.2, 0); break;
      case 'shimmer':
        bell(ct + 0.02, 81, 0.28, -0.3, 0.6, 'sfx'); bell(ct + 0.07, 86, 0.22, 0, 0.6, 'sfx'); bell(ct + 0.12, 90, 0.18, 0.3, 0.6, 'sfx');
        break;
      case 'key': keyTick(ct, 0.9 + 0.2 * rnd(), -0.1 + 0.2 * rnd()); break;
      case 'menuOpen': popSound(ct, 0.9, 380, 760); break;
      case 'plink':
        var idx = Math.round((cu.v.v - 52) / 40 * (PENTA.length - 1));
        bell(ct, PENTA[Math.max(0, Math.min(PENTA.length - 1, idx))] + 12, 0.3, -0.5 + (cu.v.i / 23), 0.45, 'sfx');
        break;
      case 'pop': popSound(ct, 1, 300, 620); break;
      case 'snap': uiClick(ct, 0.9, 0.1); popSound(ct, 0.4, 1400, 1900); break;
      case 'chime': bell(ct, 81, 0.5, -0.1, 0.7, 'sfx'); bell(ct + 0.09, 86, 0.45, 0.1, 0.7, 'sfx'); break;
      case 'whoosh': sweep(ct, 0.5, 400, 2400, 0.25, 'swell', -0.5, 0.5, 0.2); break;
      case 'burst':
        for (var bi = 0; bi < 5; bi++) bell(ct + bi * 0.035, 76 + [0, 2, 5, 7, 9][bi] + 12, 0.16, -0.4 + bi * 0.2, 0.6, 'sfx');
        break;
    }
  }

  /* ---- effects ---- */
  /* tempo-synced ping-pong delay (dotted eighth) on the tines */
  (function () {
    var d = Math.floor(0.45 * SR), fb = 0.3, lpL = 0, lpR = 0;
    var bL = new Float32Array(d), bR = new Float32Array(d), w = 0;
    for (var i = 0; i < N; i++) {
      var oL = bL[w], oR = bR[w];
      lpL += (oR - lpL) * 0.35; lpR += (oL - lpR) * 0.35;
      bL[w] = dlyInL[i] + lpL * fb;
      bR[w] = dlyInR[i] + lpR * fb;
      keyL[i] += oL * 0.33; keyR[i] += oR * 0.33;
      revInL[i] += oL * 0.1; revInR[i] += oR * 0.1;
      if (++w >= d) w = 0;
    }
  })();
  /* reverb sends from the pad and keys */
  for (var i2 = 0; i2 < N; i2++) {
    revInL[i2] += padL[i2] * 0.3 + keyL[i2] * 0.22;
    revInR[i2] += padR[i2] * 0.3 + keyR[i2] * 0.22;
  }
  /* Freeverb-style plate */
  function reverb(inp, out, spread) {
    var combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225];
    var sc = SR / 44100, room = 0.84, damp = 0.32;
    var cb = [], ci = [], cf = [], ab = [], ai = [];
    for (var a = 0; a < combs.length; a++) { var L = Math.floor((combs[a] + spread) * sc); cb.push(new Float32Array(L)); ci.push(0); cf.push(0); }
    for (var a2 = 0; a2 < aps.length; a2++) { var L2 = Math.floor((aps[a2] + spread) * sc); ab.push(new Float32Array(L2)); ai.push(0); }
    for (var n = 0; n < N; n++) {
      var x = inp[n] * 0.015, s = 0;
      for (var c = 0; c < 8; c++) {
        var bufc = cb[c], y = bufc[ci[c]];
        cf[c] = y * (1 - damp) + cf[c] * damp;
        bufc[ci[c]] = x + cf[c] * room;
        if (++ci[c] >= bufc.length) ci[c] = 0;
        s += y;
      }
      for (var p = 0; p < 4; p++) {
        var bufa = ab[p], bo = bufa[ai[p]];
        bufa[ai[p]] = s + bo * 0.5;
        s = bo - s;
        if (++ai[p] >= bufa.length) ai[p] = 0;
      }
      out[n] = s;
    }
  }
  var revL = new Float32Array(N), revR = new Float32Array(N);
  reverb(revInL, revL, 0);
  reverb(revInR, revR, 23);

  /* ---- mix ---- */
  var outL = new Float32Array(N), outR = new Float32Array(N);
  var duck = 0;
  var hpL = new Biquad(), hpR = new Biquad(); hpL.set('hp', 36, 0.7); hpR.set('hp', 36, 0.7);
  function Shelf(type, f, gainDb) {
    var A = Math.pow(10, gainDb / 40), w = 2 * Math.PI * f / SR, c = Math.cos(w), sn = Math.sin(w), al = sn / 2 * Math.sqrt(2), q = new Biquad();
    var b0, b1, b2, a0, a1, a2, sq = 2 * Math.sqrt(A) * al;
    if (type === 'low') {
      b0 = A * ((A + 1) - (A - 1) * c + sq); b1 = 2 * A * ((A - 1) - (A + 1) * c); b2 = A * ((A + 1) - (A - 1) * c - sq);
      a0 = (A + 1) + (A - 1) * c + sq; a1 = -2 * ((A - 1) + (A + 1) * c); a2 = (A + 1) + (A - 1) * c - sq;
    } else {
      b0 = A * ((A + 1) + (A - 1) * c + sq); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - sq);
      a0 = (A + 1) - (A - 1) * c + sq; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - sq;
    }
    q.b0 = b0 / a0; q.b1 = b1 / a0; q.b2 = b2 / a0; q.a1 = a1 / a0; q.a2 = a2 / a0;
    return q;
  }
  var lsL = Shelf('low', 140, -3.5), lsR = Shelf('low', 140, -3.5), hsL = Shelf('high', 5200, 3.5), hsR = Shelf('high', 5200, 3.5);
  for (var j = 0; j < N; j++) {
    duck += (kickEnv[j] - duck) * (kickEnv[j] > duck ? 0.2 : 0.0009);
    var dk = 1 - 0.3 * duck;
    var l = padL[j] * 0.9 * dk + keyL[j] * 0.8 + bass[j] * 0.9 * dk + drmL[j] * 0.85 + revL[j] * 0.55 + sfxL[j] * 1.0;
    var r = padR[j] * 0.9 * dk + keyR[j] * 0.8 + bass[j] * 0.9 * dk + drmR[j] * 0.85 + revR[j] * 0.55 + sfxR[j] * 1.0;
    outL[j] = hsL.run(lsL.run(hpL.run(l))); outR[j] = hsR.run(lsR.run(hpR.run(r)));
  }
  /* gentle glue compression + soft limiting, then normalize to -1 dBFS */
  var env = 0, att = Math.exp(-1 / (0.01 * SR)), relc = Math.exp(-1 / (0.18 * SR));
  var thr = 0.28, ratio = 2.2, peak = 0;
  for (var m = 0; m < N; m++) {
    var lv = Math.max(Math.abs(outL[m]), Math.abs(outR[m]));
    env = lv > env ? att * env + (1 - att) * lv : relc * env + (1 - relc) * lv;
    var gr = env > thr ? Math.pow(env / thr, 1 / ratio - 1) : 1;
    outL[m] *= gr; outR[m] *= gr;
    var pk = Math.max(Math.abs(outL[m]), Math.abs(outR[m]));
    if (pk > peak) peak = pk;
  }
  var norm = peak > 0 ? 0.84 / peak : 1;
  for (var o = 0; o < N; o++) {
    outL[o] = Math.tanh(outL[o] * norm * 1.08) * 0.93;
    outR[o] = Math.tanh(outR[o] * norm * 1.08) * 0.93;
  }
  /* fade the tail to silence */
  var fadeN = Math.floor(1.2 * SR), endN = Math.min(N, Math.floor((DUR + 2.3) * SR));
  for (var f2 = endN - fadeN; f2 < N; f2++) {
    var gg = f2 >= endN ? 0 : 1 - (f2 - (endN - fadeN)) / fadeN;
    if (f2 >= 0) { outL[f2] *= gg; outR[f2] *= gg; }
  }
  return { sampleRate: SR, left: outL, right: outR };
}
