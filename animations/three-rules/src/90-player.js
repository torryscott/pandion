/* The player: a responsive canvas, a chapter bar, sound on demand, and the
 * hands-on tour.
 *
 *   <div data-pandion-three-rules></div>
 *
 * Plays muted when it scrolls into view (never under reduced motion). In
 * hands-on mode (the default) the intro plays and stops on the start card:
 * "Try it yourself" walks through the three rules with the viewer doing
 * each action (see 85-guide.js), "Just watch" plays the film straight
 * through. The Hands-on switch in the control bar flips between the two at
 * any time. Sound is off until asked for: the film plays its score, the
 * hands-on tour plays the sound effects alone (it stops at every step). */

var PLAYER_CSS = [
  '.ptr{position:relative;border:1px solid #dde5ee;border-radius:12px;overflow:hidden;background:#fff;',
  'box-shadow:0 10px 28px rgba(25,46,73,.10);color:#22364d;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
  '.ptr:focus-visible{outline:3px solid #375CA0;outline-offset:3px}',
  '.ptr-stage{position:relative;aspect-ratio:16/9;background:linear-gradient(#fff,#f4f7fb);cursor:pointer;container-type:inline-size;-webkit-user-select:none;user-select:none}',
  '.ptr-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
  '.ptr-stage.ptr-try{cursor:default}',
  '.ptr-stage.ptr-over{cursor:pointer}',
  '.ptr-stage.ptr-grab{cursor:grab}',
  '.ptr-stage.ptr-grabbing{cursor:grabbing}',
  '.ptr-stage.ptr-touchlock{touch-action:none}',
  '.ptr-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
  'background:rgba(251,252,254,.35);transition:opacity .25s ease;border:0;padding:0;margin:0;width:100%;cursor:pointer;z-index:4}',
  '.ptr-cover[hidden]{display:none}',
  '.ptr-cover{animation:ptrfade .25s ease}',
  '@keyframes ptrfade{from{opacity:0}to{opacity:1}}',
  '.ptr-cover span{display:inline-flex;align-items:center;gap:12px;padding:14px 26px 14px 20px;border-radius:999px;',
  'background:#192E49;color:#fff;font-weight:700;font-size:17px;box-shadow:0 12px 30px rgba(25,46,73,.28);transition:transform .15s ease,background .15s ease}',
  '.ptr-cover:hover span{background:#24405f;transform:translateY(-1px)}',
  '.ptr-cover svg{width:22px;height:22px}',
  /* the coach card: what to do now */
  '.ptr-coach{position:absolute;z-index:3;width:max-content;max-width:min(360px,62cqw);background:#fff;border:1px solid #d3deea;border-radius:14px;',
  'box-shadow:0 14px 34px rgba(25,46,73,.20);padding:11px 15px 10px;display:flex;flex-direction:column;gap:2px;animation:ptrcoach .3s cubic-bezier(.2,.8,.2,1) both}',
  '.ptr-coach[hidden]{display:none}',
  '@keyframes ptrcoach{from{opacity:0;transform:translateY(var(--dy,8px)) scale(.97)}to{opacity:1;transform:none}}',
  '.ptr-coach.ptr-nudge{animation:ptrnudge .45s ease}',
  '@keyframes ptrnudge{0%,100%{transform:none}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}',
  '.ptr-coach::after{content:"";position:absolute;left:var(--ax,50%);width:13px;height:13px;background:#fff;border:1px solid #d3deea;transform:translateX(-50%) rotate(45deg)}',
  '.ptr-coach.ptr-below::after{top:-7.5px;border-right:0;border-bottom:0}',
  '.ptr-coach.ptr-above::after{bottom:-7.5px;border-left:0;border-top:0}',
  '.ptr-coach.ptr-side::after{left:-7.5px;top:var(--ay,50%);transform:translateY(-50%) rotate(45deg);border-right:0;border-top:0}',
  '.ptr-coach-k{font-size:11.5px;font-weight:800;letter-spacing:.14em;color:#8a6414}',
  '.ptr-coach-t{font-size:16.5px;font-weight:700;color:#192E49;line-height:1.3}',
  '.ptr-coach-row{display:flex;gap:14px;align-items:center;margin-top:3px}',
  '.ptr-link{border:0;background:none;padding:3px 0;margin:0;font:inherit;font-size:13.5px;font-weight:700;color:#375CA0;cursor:pointer;',
  'text-decoration:underline;text-underline-offset:3px;min-height:24px}',
  '.ptr-link:hover{color:#192E49}',
  '.ptr-link[hidden]{display:none}',
  '.ptr-link:focus-visible,.ptr-go:focus-visible,.ptr-alt:focus-visible,.ptr-mode:focus-visible{outline:3px solid #375CA0;outline-offset:2px}',
  '.ptr-step{margin-left:auto;font-size:12.5px;font-weight:600;color:#5f6f80;font-variant-numeric:tabular-nums;white-space:nowrap}',
  /* the start and end cards */
  '.ptr-card{position:absolute;left:8.9%;display:flex;flex-direction:column;gap:12px;z-index:3;animation:ptrcoach .35s cubic-bezier(.2,.8,.2,1) both}',
  '.ptr-card[hidden]{display:none}',
  '.ptr-card-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
  '.ptr-hub{top:75.5%}',
  '.ptr-end{top:62%;gap:10px}',
  '.ptr-note .ptr-link{font-size:inherit;padding:0;min-height:0}',
  '.ptr-end b{font-size:clamp(15px,2.05cqw,24px);color:#192E49;line-height:1.2}',
  '.ptr-go{display:inline-flex;align-items:center;gap:10px;padding:.72em 1.35em .72em 1.05em;border-radius:999px;border:0;background:#192E49;color:#fff;',
  'font:inherit;font-weight:700;font-size:clamp(13.5px,1.6cqw,18px);cursor:pointer;box-shadow:0 12px 30px rgba(25,46,73,.26);text-decoration:none;white-space:nowrap}',
  '.ptr-go:hover{background:#24405f}',
  '.ptr-go svg{width:1.15em;height:1.15em;flex:0 0 auto}',
  '.ptr-alt{display:inline-flex;align-items:center;gap:8px;padding:.66em 1.2em;border-radius:999px;border:1.5px solid #c3d0df;background:#fff;color:#192E49;',
  'font:inherit;font-weight:700;font-size:clamp(13px,1.5cqw,17px);cursor:pointer;white-space:nowrap;text-decoration:none}',
  '.ptr-alt:hover{border-color:#375CA0;color:#375CA0}',
  '.ptr-alt svg{width:1em;height:1em;flex:0 0 auto}',
  '.ptr-note{font-size:clamp(12px,1.25cqw,14.5px);color:#5f6f80;font-weight:500}',
  /* the viewer types here: laid exactly over the drawn text box */
  '.ptr-type{position:absolute;z-index:2;border:0;margin:0;padding:0 0 0 .4em;background:transparent;color:transparent;caret-color:transparent;',
  'font-size:16px;outline:none;-webkit-appearance:none;appearance:none}',
  '.ptr-type[hidden]{display:none}',
  '.ptr-cap{display:none;padding:9px 14px 10px;border-top:1px solid #dde5ee;background:#f7f9fc;font-size:14.5px;line-height:1.45;min-height:3.1em;color:#22364d}',
  '.ptr-cap b{color:#192E49;margin-right:6px}',
  '.ptr.ptr-compact .ptr-cap{display:block}',
  '.ptr-bar{display:flex;align-items:center;gap:14px;padding:10px 14px 10px 12px;border-top:1px solid #dde5ee;background:#fff}',
  '.ptr-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;',
  'border:1px solid #c3d0df;background:#fff;color:#192E49;cursor:pointer;padding:0;transition:border-color .15s,background .15s,color .15s}',
  '.ptr-btn:hover{border-color:#375CA0;color:#375CA0}',
  '.ptr-btn.ptr-main{background:#192E49;border-color:#192E49;color:#fff}',
  '.ptr-btn.ptr-main:hover{background:#24405f;border-color:#24405f;color:#fff}',
  '.ptr-btn svg{width:18px;height:18px;display:block}',
  '.ptr-btn:focus-visible,.ptr-chap:focus-visible{outline:3px solid #375CA0;outline-offset:2px}',
  '.ptr-btn[aria-pressed="true"]{background:#e8f0fa;border-color:#375CA0;color:#375CA0}',
  '.ptr-btn.ptr-busy svg{animation:ptrspin 1s linear infinite}',
  '@keyframes ptrspin{to{transform:rotate(360deg)}}',
  '.ptr-mode{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px 0 11px;border-radius:999px;',
  'border:1px solid #c3d0df;background:#fff;color:#5f6f80;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}',
  '.ptr-mode svg{width:18px;height:18px;display:block}',
  '.ptr-mode:hover{border-color:#375CA0;color:#375CA0}',
  '.ptr-mode[aria-pressed="true"]{background:#e8f0fa;border-color:#375CA0;color:#192E49}',
  '.ptr-chaps{flex:1 1 auto;display:flex;gap:4px;min-width:0}',
  '.ptr-chap{position:relative;flex:1 1 0;min-width:30px;min-height:32px;border:0;background:none;padding:6px 0 0;margin:0;cursor:pointer;text-align:left;color:#5f6f80;font:inherit}',
  '.ptr-track{display:block;height:6px;border-radius:3px;background:#e3eaf3;overflow:hidden}',
  '.ptr-fill{display:block;height:100%;width:0;background:#375CA0;border-radius:3px}',
  '.ptr-lbl{display:block;margin-top:6px;font-size:12.5px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ptr-chap[aria-current="true"] .ptr-lbl{color:#192E49}',
  '.ptr-chap:hover .ptr-lbl{color:#375CA0}',
  '.ptr-time{flex:0 0 auto;font-size:12.5px;font-variant-numeric:tabular-nums;color:#5f6f80;min-width:34px;text-align:right}',
  '.ptr-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
  /* phones: the coach and the cards move under the picture */
  '.ptr.ptr-compact .ptr-coach,.ptr.ptr-compact .ptr-card{position:static;max-width:none;width:auto;box-shadow:none;border:0;border-radius:0;',
  'border-top:1px solid #dde5ee;padding:10px 14px 11px;background:#f7f9fc;animation:none}',
  '.ptr.ptr-compact .ptr-coach::after{display:none}',
  '.ptr.ptr-compact .ptr-card{gap:8px}',
  '.ptr.ptr-compact.ptr-guiding .ptr-cap{display:none}',
  /* on phones the Hands-on switch leaves the crowded bar; the step card offers Just watch */
  '.ptr-watchrest{display:none}',
  '.ptr.ptr-compact .ptr-watchrest{display:inline}',
  '@media (max-width:420px){.ptr-mode{display:none}}',
  '@media (max-width:560px){.ptr-bar{gap:10px;padding:8px 10px}.ptr-lbl{font-size:11.5px}.ptr-time{display:none}',
  '.ptr-chap:not([aria-current="true"]) .ptr-lbl{visibility:hidden}.ptr-btn{width:34px;height:34px}.ptr-mode{height:34px;padding:0 9px}.ptr-mode span{display:none}}',
  /* Watch mode is the narrated film: the sound button names the narration,
   * a CC button shows the words in the caption band under the picture */
  '.ptr-btn.ptr-snd{width:auto;gap:7px;padding:0 15px 0 11px;border-radius:19px}',
  '.ptr-snd-t{font-size:13px;font-weight:700;letter-spacing:.01em;white-space:nowrap}',
  '.ptr-btn.ptr-ccb{display:none;font-size:12px;font-weight:800;letter-spacing:.04em}',
  '.ptr.ptr-watch .ptr-btn.ptr-ccb{display:inline-flex}',
  '.ptr.ptr-narr .ptr-cap{display:block;font-size:15px}',
  '@media (max-width:560px){.ptr-btn.ptr-snd{width:34px;padding:0;border-radius:50%}.ptr-snd-t{display:none}}',
  /* the narrowest phones: the chapters need the room (captions stay on; C toggles them) */
  '@media (max-width:360px){.ptr.ptr-watch .ptr-btn.ptr-ccb{display:none}}'
].join('');

var ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 3.5v4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  busy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.2V4.9a1.6 1.6 0 0 1 3.2 0v5.3m0-.9V3.8a1.6 1.6 0 0 1 3.2 0v6.4m0-.6V5.9a1.6 1.6 0 0 1 3.2 0v8.3a6.7 6.7 0 0 1-6.7 6.7h-.7a6.4 6.4 0 0 1-5.1-2.6l-3.1-4.3a1.6 1.6 0 0 1 2.5-2l1.5 1.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

var POSTER_T = 3.4;
var PROMISE_TRY = 'Try each one yourself, right here.';
var APP_URL = 'https://pandionplots.com/app/';
var PROMISE_WATCH = 'Explore them in under two minutes.';

/* ---- narration (Watch mode) ---- */
/* The voice (ElevenLabs v3, Harper Lawson; made in the narration pipeline,
 * ~/Desktop/Pandion Learn Animation ElevenLabs) ships beside this script as
 * Opus in WebM, with FLAC as the fallback for browsers that cannot decode
 * Opus. It is fetched only when narration is wanted (Just watch, or sound on
 * in Watch mode), then mixed with the narrated score in the worker (the score
 * ducks under the voice). The picture holds its final frame until the last
 * word, then the closing chord rings out.
 * In hands-on mode Harper reads each stop's instruction (and the end card's
 * line): pandion-three-rules-prompts.{webm,flac}, one file with the clips
 * 0.6 s apart (PROMPT_CLIPS says where each sits), fetched with the sound
 * effects the first time hands-on sound is on, and played at the narration's
 * own gain so she sounds the same in both modes. */
var PTR_SCRIPT_SRC = (function () {
  try { var s = document.currentScript; return s && s.src ? s.src : ''; } catch (e) { return ''; }
})();
var VOICE_FILES = ['pandion-three-rules-voice.webm', 'pandion-three-rules-voice.flac'];
var PROMPT_FILES = ['pandion-three-rules-prompts.webm', 'pandion-three-rules-prompts.flac'];
var VOICE_MIX = { gain: 1.26, bedDb: -5.5 };
/* a spoken prompt starts a beat after its coach card lands (the card's
 * entrance takes 0.3 s) */
var PROMPT_DELAY = 0.3;
function voiceUrls(attr, files) {
  var list = attr ? attr.split(',') : (files || VOICE_FILES);
  return list.map(function (u) {
    u = u.trim();
    try { return new URL(u, attr ? document.baseURI : (PTR_SCRIPT_SRC || document.baseURI)).href; } catch (e) { return u; }
  });
}
function loadVoice(ac, urls, cb) {
  var i = 0;
  function next() {
    if (i >= urls.length) { cb(null); return; }
    var url = urls[i++];
    fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(function (ab) {
      return new Promise(function (ok, bad) { var p = ac.decodeAudioData(ab, ok, bad); if (p && p.then) p.then(ok, bad); });
    }).then(function (buf) {
      var n = buf.length, out = new Float32Array(n), c, k;
      for (c = 0; c < buf.numberOfChannels; c++) { var ch = buf.getChannelData(c); for (k = 0; k < n; k++) out[k] += ch[k] / buf.numberOfChannels; }
      cb(out);
    }).catch(function () { next(); });
  }
  next();
}
/* the caption to show at film time t: from just before a sentence's first
 * word until the next one starts (or a moment after its last word) */
function narrationCueAt(t) {
  for (var i = NARRATION_CUES.length - 1; i >= 0; i--) {
    var c = NARRATION_CUES[i];
    if (t < c[0] - 0.12) continue;
    var nx = NARRATION_CUES[i + 1], until = nx ? Math.min(nx[0] - 0.12, c[1] + 1.2) : c[1] + 1.5;
    return t < until ? i : -1;
  }
  return -1;
}

function mountThreeRules(host, options) {
  options = options || {};
  if (host.__ptr) return host.__ptr;
  if (!document.getElementById('ptr-css')) {
    var st = document.createElement('style');
    st.id = 'ptr-css';
    st.textContent = PLAYER_CSS;
    document.head.appendChild(st);
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var label = options.label || 'Interactive tour: the three rules of Pandion Plots';
  host.innerHTML = '';
  host.classList.add('ptr-host-live');
  var root = document.createElement('div');
  root.className = 'ptr';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', label);
  root.tabIndex = 0;
  var desc = options.describedBy;
  if (!desc) {
    var sr = document.createElement('p');
    sr.className = 'ptr-sr';
    sr.id = 'ptr-desc-' + Math.random().toString(36).slice(2, 8);
    sr.textContent = TRANSCRIPT_SHORT;
    root.appendChild(sr);
    desc = sr.id;
  }
  root.setAttribute('aria-describedby', desc);
  var live = document.createElement('p');
  live.className = 'ptr-sr';
  live.setAttribute('aria-live', 'polite');
  root.appendChild(live);
  var stage = document.createElement('div');
  stage.className = 'ptr-stage';
  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  var cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'ptr-cover';
  cover.innerHTML = '<span><i class="ptr-i-play" style="display:contents">' + ICONS.play + '</i><b>Play the tour</b></span>';
  stage.appendChild(cover);
  /* hands-on chrome */
  var coach = document.createElement('div');
  coach.className = 'ptr-coach';
  coach.hidden = true;
  coach.innerHTML = '<span class="ptr-coach-k">YOUR TURN</span><span class="ptr-coach-t"></span>' +
    '<span class="ptr-coach-row"><button type="button" class="ptr-link ptr-done" hidden>Done</button>' +
    '<button type="button" class="ptr-link ptr-show">Show me</button>' +
    '<button type="button" class="ptr-link ptr-watchrest">Just watch</button><span class="ptr-step"></span></span>';
  var coachT = coach.querySelector('.ptr-coach-t'), coachStep = coach.querySelector('.ptr-step');
  var showBtn = coach.querySelector('.ptr-show'), doneBtn = coach.querySelector('.ptr-done');
  var hub = document.createElement('div');
  hub.className = 'ptr-card ptr-hub';
  hub.hidden = true;
  hub.innerHTML = '<span class="ptr-card-row"><button type="button" class="ptr-go ptr-hub-go">' + ICONS.hand + 'Try it yourself</button>' +
    '<button type="button" class="ptr-alt ptr-hub-watch">' + ICONS.play + 'Just watch</button></span>' +
    '<span class="ptr-note">Or click a rule to start there. A minute or so, at your own pace.</span>';
  var endCard = document.createElement('div');
  endCard.className = 'ptr-card ptr-end';
  endCard.hidden = true;
  endCard.innerHTML = '<b>Nice work. That\u2019s all three rules.</b><span class="ptr-card-row">' +
    '<a class="ptr-go ptr-end-app" href="' + APP_URL + '" target="_blank" rel="noopener">Open Pandion Plots</a>' +
    '<button type="button" class="ptr-alt ptr-end-again">' + ICONS.replay + 'Try it again</button></span>' +
    '<span class="ptr-note">Or <button type="button" class="ptr-link ptr-end-watch">watch it narrated</button> without stopping.</span>';
  var typeIn = document.createElement('input');
  typeIn.type = 'text';
  typeIn.className = 'ptr-type';
  typeIn.maxLength = 28;
  typeIn.autocomplete = 'off';
  typeIn.spellcheck = false;
  typeIn.setAttribute('aria-label', 'New axis title');
  typeIn.hidden = true;
  stage.appendChild(typeIn);
  stage.appendChild(coach);
  stage.appendChild(hub);
  stage.appendChild(endCard);
  root.appendChild(stage);
  var capEl = document.createElement('div');
  capEl.className = 'ptr-cap';
  capEl.setAttribute('aria-hidden', 'true');
  root.appendChild(capEl);
  var bar = document.createElement('div');
  bar.className = 'ptr-bar';
  var playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'ptr-btn ptr-main';
  var chaps = document.createElement('div');
  chaps.className = 'ptr-chaps';
  chaps.setAttribute('role', 'group');
  chaps.setAttribute('aria-label', 'Chapters');
  var chapEls = [];
  for (var i = 0; i < CHAPTERS.length; i++) {
    var c = CHAPTERS[i], end = i < CHAPTERS.length - 1 ? CHAPTERS[i + 1].t : DURATION;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ptr-chap';
    b.style.flexGrow = String(end - c.t);
    b.innerHTML = '<span class="ptr-track"><span class="ptr-fill"></span></span><span class="ptr-lbl">' + c.label + '</span>';
    b.setAttribute('aria-label', 'Jump to ' + c.label);
    /* s0/s1 are story times; t0/t1 follow the current mode's clock (layoutChapters) */
    var entry = { el: b, fill: b.querySelector('.ptr-fill'), s0: c.t, s1: end, t0: c.t, t1: end };
    (function (en, btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var tt = en.t0, t1 = en.t1;
        /* pointer clicks seek to that spot in the chapter; keyboard jumps to its start */
        var to = tt;
        if (e.detail > 0 && e.clientX) {
          var r = btn.getBoundingClientRect();
          var f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          to = f < 0.06 ? tt : tt + f * (t1 - tt);
        }
        /* hands-on: a rule starts with its title card, so begin just before it */
        if (GUIDE.on && tt > 0 && to - tt < 0.5) to = Math.max(0, tt - 0.45);
        seek(to); play();
      });
    })(entry, b);
    chaps.appendChild(b);
    chapEls.push(entry);
  }
  function layoutChapters() {
    for (var i = 0; i < chapEls.length; i++) {
      var c = chapEls[i];
      c.t0 = WARP.on ? filmTime(c.s0) : c.s0;
      c.t1 = WARP.on ? (i === chapEls.length - 1 ? FILM_DURATION : filmTime(c.s1)) : c.s1;
    }
    /* the narrated film spends most of its time in the demos, so in Watch mode
     * every chapter keeps at least 11% of the bar (its label stays readable;
     * a click still maps exactly within the chapter's own span) */
    var total = chapEls.length ? chapEls[chapEls.length - 1].t1 - chapEls[0].t0 : 1;
    for (var j = 0; j < chapEls.length; j++) {
      var span = chapEls[j].t1 - chapEls[j].t0;
      chapEls[j].el.style.flexGrow = String(WARP.on ? Math.max(span, 0.11 * total) : span);
    }
  }
  var timeEl = document.createElement('span');
  timeEl.className = 'ptr-time';
  timeEl.setAttribute('aria-hidden', 'true');
  var modeBtn = document.createElement('button');
  modeBtn.type = 'button';
  modeBtn.className = 'ptr-mode';
  modeBtn.innerHTML = ICONS.hand + '<span>Hands-on</span>';
  modeBtn.title = 'Hands-on: the tour stops so you can do each step yourself';
  var soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'ptr-btn';
  soundBtn.setAttribute('aria-pressed', 'false');
  soundBtn.setAttribute('aria-label', 'Sound');
  soundBtn.title = 'Sound';
  soundBtn.innerHTML = ICONS.soundOff;
  var ccBtn = document.createElement('button');
  ccBtn.type = 'button';
  ccBtn.className = 'ptr-btn ptr-ccb';
  ccBtn.textContent = 'CC';
  ccBtn.setAttribute('aria-label', 'Captions');
  ccBtn.setAttribute('aria-pressed', 'true');
  ccBtn.title = 'Captions (C)';
  bar.appendChild(playBtn); bar.appendChild(chaps); bar.appendChild(timeEl); bar.appendChild(modeBtn); bar.appendChild(ccBtn); bar.appendChild(soundBtn);
  root.appendChild(bar);
  host.appendChild(root);

  var ctx = canvas.getContext('2d');
  var state = {
    t: 0, playing: false, ended: false, userPaused: false, autoPaused: false, reduce: reduce,
    clock0: 0, t0: 0, visible: false, sound: false, audio: null, audioBusy: false, raf: 0, dpr: 1, w: 0,
    mode: options.mode === 'watch' ? 'watch' : 'try', waiting: null, drag: null, skip: null, fast: null, jumpFade: null,
    cc: true,
    /* the viewer turned the sound off themselves: Try it yourself leaves it off */
    userMuted: false,
    /* the spoken prompt asked for and not yet played ({id, at}) */
    promptWant: null
  };
  /* for tests: every prompt Harper has started, in order */
  var spoken = [];
  GUIDE.reduce = reduce;
  /* the length of the current mode's timeline: story time in hands-on mode,
   * the narrated film (with its pauses) in Watch mode */
  function dur() { return WARP.on ? FILM_DURATION : DURATION; }
  function setMode(m) {
    var was = WARP.on;
    if (state.playing && !state.fast) state.t = now();
    state.mode = m;
    GUIDE.on = m === 'try';
    WARP.on = !GUIDE.on;
    /* the same moment of the film on the other clock */
    if (was !== WARP.on) {
      state.t = WARP.on ? filmTime(state.t) : storyTime(state.t);
      state.fast = null;
      if (WARP.on && state.sound) alignToSentence();
      if (state.playing) { stopAudio(); rebase(); }
    }
    RENDER_OPTS.promise = GUIDE.on ? PROMISE_TRY : PROMISE_WATCH;
    modeBtn.setAttribute('aria-pressed', GUIDE.on ? 'true' : 'false');
    stage.classList.toggle('ptr-try', GUIDE.on);
    root.classList.toggle('ptr-watch', !GUIDE.on);
    layoutChapters();
    if (!GUIDE.on) leaveGate();
    setSoundUi();
    if (state.sound) ensureAudio(function () { if (state.playing && !state.fast) { state.t = now(); rebase(); startAudio(); } });
  }
  /* with narration, start (or rejoin) at the beginning of a sentence */
  function alignToSentence() {
    if (!WARP.on) return;
    for (var i = 0; i < NARRATION_CUES.length; i++) {
      var c = NARRATION_CUES[i];
      if (state.t > c[0] - 0.05 && state.t < c[1]) { state.t = Math.max(0, c[0] - 0.3); return; }
    }
  }
  /* inside a click: make (or wake) the audio context so the browser lets it play */
  function unlockAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!state.audio) {
      var ac = new AC(), gain = ac.createGain();
      gain.gain.value = 0.9;
      gain.connect(ac.destination);
      state.audio = { ctx: ac, gain: gain, narr: null, sfx: null, src: null, prompts: null, prompt: null };
    }
    if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
  }
  /* Just watch: the narrated film with the voice on. fromStart plays it from
   * the top; otherwise it carries on from here, at a sentence boundary. */
  function startWatching(fromStart) {
    var focusIn = root.contains(document.activeElement);
    leaveGate();
    hideCards();
    if (state.playing) pause(false);
    state.sound = true;
    state.userMuted = false;
    unlockAudio();
    setMode('watch');   /* converts the clock and, with sound on, starts at a sentence */
    if (fromStart) { state.t = 0; state.ended = false; }
    setSoundUi();
    state.pendingPlay = true;
    var go = function () { if (state.pendingPlay) { state.pendingPlay = false; play(); } };
    if (!state.audio) go(); else ensureAudio(go);
    draw();
    keepFocus(focusIn);
  }

  /* ---- layout ---- */
  function resize() {
    var r = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.width * 9 / 16 * dpr));
    state.compact = r.width < 700;
    root.classList.toggle('ptr-compact', state.compact);
    placeChrome();
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
    state.w = w;
    if (state.waiting && state.waiting.kind !== 'hub') { placeCoach(state.waiting); if (state.waiting.kind === 'type') placeTyping(state.waiting); }
    draw();
  }
  /* on phones the coach and the cards sit under the picture, in the caption slot */
  function placeChrome() {
    [coach, hub, endCard].forEach(function (el) {
      if (state.compact && el.parentNode !== root) root.insertBefore(el, capEl);
      else if (!state.compact && el.parentNode !== stage) stage.appendChild(el);
    });
  }
  var poster = null, jumpCanvas = null;
  function draw() {
    if (!canvas.width) return;
    RENDER_OPTS.compact = !!state.compact;
    GUIDE.rt = performance.now() / 1000;
    /* before the first play, show the start card's frame instead of a blank one */
    var idle = !state.playing && !state.started && !state.waiting;
    var tt = (idle && state.t < 0.05) ? (WARP.on ? filmTime(POSTER_T) : POSTER_T) : Math.min(state.t, dur());
    if (idle && state.reduce && !GUIDE.on) tt = dur();
    renderFrame(ctx, tt, canvas.width / STAGE_W);
    if (idle) {
      /* keep a copy so the first play can dissolve out of it */
      if (!poster) poster = document.createElement('canvas');
      if (poster.width !== canvas.width || poster.height !== canvas.height) { poster.width = canvas.width; poster.height = canvas.height; }
      poster.getContext('2d').drawImage(canvas, 0, 0);
      state.posterValid = true;
    } else if (state.posterFade != null && poster && state.posterValid) {
      var k = 1 - clamp((performance.now() / 1000 - state.posterFade) / 0.45, 0, 1);
      if (k > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = k * k * (3 - 2 * k);
        ctx.drawImage(poster, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      } else { state.posterFade = null; state.posterValid = false; }
    }
    /* a jump in the tour (a rule picked at the start) dissolves, never cuts */
    if (state.jumpFade != null && jumpCanvas) {
      var jk = 1 - clamp((performance.now() / 1000 - state.jumpFade) / 0.5, 0, 1);
      if (jk > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = jk * jk * (3 - 2 * jk);
        ctx.drawImage(jumpCanvas, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      } else state.jumpFade = null;
    }
    updateUi();
  }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  var ui = {};
  function setOnce(key, val, fn) { if (ui[key] !== val) { ui[key] = val; fn(val); } }
  function updateUi() {
    var t = state.t;
    for (var i = 0; i < chapEls.length; i++) {
      var c = chapEls[i], p = clamp((t - c.t0) / (c.t1 - c.t0), 0, 1);
      c.fill.style.width = (p * 100).toFixed(2) + '%';
      var cur = t >= c.t0 && (t < c.t1 || (i === chapEls.length - 1));
      if (cur) c.el.setAttribute('aria-current', 'true'); else c.el.removeAttribute('aria-current');
    }
    setOnce('time', fmt(t), function (v) { timeEl.textContent = v; });
    var guiding = !!(!coach.hidden || !hub.hidden || !endCard.hidden);
    root.classList.toggle('ptr-guiding', guiding && !!state.compact);
    var narrCap = WARP.on && state.cc;
    root.classList.toggle('ptr-narr', narrCap);
    if (narrCap) {
      var qi = narrationCueAt(t);
      setOnce('cap', 'n' + qi, function () { capEl.textContent = qi >= 0 ? NARRATION_CUES[qi][2] : ''; });
    } else if (state.compact && !guiding) {
      var cp = captionForTime(WARP.on ? storyTime(t) : t);
      setOnce('cap', cp.lead + '|' + cp.text, function () {
        capEl.textContent = '';
        var b = document.createElement('b'); b.textContent = cp.lead + (cp.text ? '.' : '');
        capEl.appendChild(b);
        capEl.appendChild(document.createTextNode(cp.text));
      });
    }
    /* the big button only offers a way back in after the viewer paused */
    var coverState = state.playing || state.ended || state.waiting || state.drag || !state.coverReady || !state.started || !state.userPaused ? 'hide' : 'resume';
    setOnce('cover', coverState, function (v) {
      cover.hidden = v === 'hide';
      if (v === 'hide') return;
      cover.querySelector('b').textContent = 'Resume';
      cover.setAttribute('aria-label', 'Resume');
    });
    var btnState = state.playing ? 'pause' : state.ended ? 'replay' : 'play';
    setOnce('btn', btnState, function (v) {
      playBtn.innerHTML = ICONS[v];
      var lbl = v === 'pause' ? 'Pause' : v === 'replay' ? 'Replay' : 'Play';
      playBtn.setAttribute('aria-label', lbl);
      playBtn.title = lbl;
    });
  }

  /* ---- the clock ---- */
  /* one clock at a time: the audio clock while sound plays (so picture
   * and sound cannot drift), the page clock otherwise */
  function now() {
    if (state.clock === 'audio' && state.audio && state.audio.ctx)
      return state.t0 + Math.max(0, state.audio.ctx.currentTime - state.clock0);
    return state.t0 + (performance.now() / 1000 - state.clock0);
  }
  function rebase() { state.t0 = state.t; state.clock0 = performance.now() / 1000; state.clock = 'perf'; }
  function kick() { if (!state.raf) state.raf = requestAnimationFrame(loop); }
  function loop() {
    state.raf = 0;
    var rt = performance.now() / 1000;
    GUIDE.rt = rt;
    if (state.drag) updateDragK(rt);
    if (state.drag && state.drag.phase !== 'hold') stepDragAnim(rt);
    else if (state.playing) {
      var tn;
      if (state.fast) {
        tn = state.fast.t0 + (rt - state.fast.r0) * state.fast.k;
        if (tn >= state.fast.until) {
          tn = state.fast.until; state.fast = null; state.t = tn; rebase();
          if (state.sound) startAudio();
        }
      } else tn = now();
      var g = GUIDE.on ? gateBetween(state.t, tn, state.skip) : null;
      if (g) tn = g.t;
      if (state.skip) { var sg = gateById(state.skip); if (!sg || tn > sg.t + 0.3) state.skip = null; }
      state.t = tn;
      if (g) arrive(g);
      if (GUIDE.showUntil > 0 && state.t > GUIDE.showUntil + 0.4) GUIDE.showUntil = -1;
      var narrated = WARP.on && state.sound && state.audio && state.audio.voiceEnd && state.audio.src;
      var endT = narrated ? Math.max(dur(), state.audio.voiceEnd) : dur();
      if (state.t >= endT) {
        state.t = dur(); state.playing = false; state.ended = true;
        if (!narrated) stopAudio();   /* with narration the closing chord rings on */
        rebase();
        if (GUIDE.on) showEnd();
      }
    }
    draw();
    /* one frame chain at a time (arrive() may already have asked for the next frame) */
    if (!state.raf && (state.playing || guideAnimating() || state.drag || state.jumpFade != null || state.posterFade != null)) state.raf = requestAnimationFrame(loop);
  }
  function play() {
    if (state.playing) return;
    if (state.waiting) { showMe(state.waiting); return; }
    hideCards();
    if (state.ended || state.t >= dur()) { state.t = 0; state.ended = false; GUIDE.typed = null; GUIDE.typedAt = Infinity; GUIDE.capFloor = -1; }
    if (!state.started && state.posterValid) state.posterFade = performance.now() / 1000;
    state.playing = true; state.started = true; state.userPaused = false; state.autoPaused = false;
    rebase();
    if (state.sound) startAudio();
    kick();
    updateUi();
  }
  function pause(user) {
    if (!state.playing) return;
    if (!state.fast) state.t = now();
    state.fast = null;
    state.playing = false;
    if (user) { state.userPaused = true; state.coverReady = true; }
    stopAudio();
    rebase();
    draw();
  }
  function seek(t) {
    var was = state.playing;
    if (was) stopAudio();
    leaveGate();
    hideCards();
    state.fast = null;
    state.t = clamp(t, 0, dur());
    state.ended = state.t >= dur();
    GUIDE.capFloor = -1;
    if (state.t < GUIDE.typedAt) { GUIDE.typed = null; GUIDE.typedAt = Infinity; }
    rebase();
    if (was && state.sound) startAudio();
    draw();
  }
  function toggle() { if (state.playing) pause(true); else play(); }

  /* ---- the hands-on tour ---- */
  function stepNumber(g) {
    var n = 0, tot = 0;
    for (var i = 0; i < GATES.length; i++) {
      if (GATES[i].chap !== g.chap) continue;
      tot++;
      if (GATES[i].t <= g.t) n++;
    }
    return { n: n, tot: tot };
  }
  function arrive(g) {
    /* the same stop again (a drag let go too early springs back to it):
     * the coach returns, but Harper does not repeat herself */
    var again = state.waiting === g;
    state.playing = false;
    stopAudio();
    state.t = g.t;
    rebase();
    state.waiting = g;
    GUIDE.gate = g;
    GUIDE.since = performance.now() / 1000;
    if (g.capT) { GUIDE.capFloor = g.capT; GUIDE.capFrom = g.t; }
    if (g.kind === 'hub') { showHub(); kick(); return; }
    var sn = stepNumber(g);
    coachT.textContent = g.text;
    coachStep.textContent = 'Rule ' + (g.chap + 1) + ' \u00b7 step ' + sn.n + ' of ' + sn.tot;
    doneBtn.hidden = g.kind !== 'type';
    showBtn.textContent = g.kind === 'type' ? 'Type it for me' : 'Show me';
    coach.hidden = false;
    coach.classList.remove('ptr-nudge');
    placeCoach(g);
    stage.classList.toggle('ptr-touchlock', g.kind === 'drag');
    announce('Your turn. ' + g.text + (g.kind === 'type' ? '' : ' Or press Enter to see it done.'));
    if (!again) wantPrompt(g.id);
    if (g.kind === 'type') beginTyping(g);
    /* keyboard users land on the coach, so Show me is one key away */
    else if (root.contains(document.activeElement) && document.activeElement !== root) showBtn.focus({ preventScroll: true });
    kick();
  }
  function leaveGate() {
    stopPrompt();
    state.waiting = null;
    state.drag = null;
    GUIDE.gate = null;
    GUIDE.drag = null;
    GUIDE.hubHover = -1;
    coach.hidden = true;
    hub.hidden = true;
    if (!typeIn.hidden) { typeIn.hidden = true; typeIn.blur(); }
    stage.classList.remove('ptr-touchlock', 'ptr-over', 'ptr-grab', 'ptr-grabbing');
  }
  function hideCards() { hub.hidden = true; endCard.hidden = true; }
  function keepFocus(wasIn) { if (wasIn) root.focus({ preventScroll: true }); }
  /* the viewer did it: carry on from the film's own press */
  function proceed(g) {
    var focusIn = root.contains(document.activeElement) && document.activeElement !== root;
    leaveGate();
    if (g.fast) {
      state.t = g.t;
      state.fast = { t0: g.t, r0: performance.now() / 1000, k: g.fast, until: g.at };
    } else state.t = g.at != null ? g.at : g.t;
    state.playing = true; state.started = true;
    rebase();
    if (!state.fast && state.sound) startAudio();
    keepFocus(focusIn);
    kick();
  }
  /* rewind a moment and let the film do this step, cursor and all */
  function showMe(g) {
    if (g.kind === 'hub') { startRule(0); return; }
    var focusIn = root.contains(document.activeElement) && document.activeElement !== root;
    leaveGate();
    if (g.kind === 'type') { GUIDE.typed = null; GUIDE.typedAt = Infinity; }
    var endT = g.at != null ? g.at : g.press ? g.press[1] : typingDone();
    GUIDE.capFloor = -1;
    GUIDE.showFrom = g.show != null ? g.show : Math.max(0, g.t - 0.9);
    GUIDE.showUntil = endT + 0.45;
    state.skip = g.id;
    state.t = GUIDE.showFrom;
    state.playing = true; state.started = true;
    rebase();
    if (state.sound) startAudio();
    keepFocus(focusIn);
    kick();
  }
  function miss(p) {
    GUIDE.miss = performance.now() / 1000;
    if (p) GUIDE.clicks.push([p[0], p[1], GUIDE.miss]);
    coach.classList.remove('ptr-nudge');
    void coach.offsetWidth;
    coach.classList.add('ptr-nudge');
    kick();
  }
  /* The coach card sits beside its target: below it when there is room,
   * else above, never over the target or a drag's path. */
  function placeCoach(g) {
    if (state.compact || coach.hidden) { coach.style.left = coach.style.top = ''; return; }
    var G = gateShape(g, stateAt(g.t));
    if (!G) return;
    var r = stage.getBoundingClientRect(), s = r.width / STAGE_W;
    var focus = g.kind === 'drag' && G.drop ? gUnion([G.beacon, G.drop]) : G.beacon;
    var pad = (G.pad || 8) + 16;
    var cw = coach.offsetWidth || 260, chh = coach.offsetHeight || 80;
    var tx = (focus[0] + focus[2] / 2) * s, top = (focus[1] - pad) * s, bot = (focus[1] + focus[3] + pad) * s;
    if (g.place === 'right') {
      var rx = (focus[0] + focus[2] + pad) * s, ry = clamp((focus[1] + focus[3] / 2) * s - chh / 2, 6, Math.max(6, r.height - chh - 6));
      if (rx + cw + 8 <= r.width) {
        coach.style.left = rx.toFixed(1) + 'px';
        coach.style.top = ry.toFixed(1) + 'px';
        coach.style.setProperty('--dy', '0px');
        coach.style.setProperty('--ay', clamp((focus[1] + focus[3] / 2) * s - ry, 18, chh - 18).toFixed(1) + 'px');
        coach.classList.remove('ptr-below', 'ptr-above');
        coach.classList.add('ptr-side');
        return;
      }
    }
    coach.classList.remove('ptr-side');
    var below = bot + chh + 8 <= r.height || top - chh - 8 < 0;
    var y = below ? bot : top - chh;
    y = clamp(y, 6, Math.max(6, r.height - chh - 6));
    var x = clamp(tx - cw / 2, 8, Math.max(8, r.width - cw - 8));
    coach.style.left = x.toFixed(1) + 'px';
    coach.style.top = y.toFixed(1) + 'px';
    coach.style.setProperty('--ax', clamp(tx - x, 18, cw - 18).toFixed(1) + 'px');
    coach.style.setProperty('--dy', below ? '8px' : '-8px');
    coach.classList.toggle('ptr-below', below);
    coach.classList.toggle('ptr-above', !below);
  }
  function announce(s) { live.textContent = ''; setTimeout(function () { live.textContent = s; }, 30); }

  /* start card */
  function showHub() {
    hub.hidden = false;
    announce('Try the three rules yourself, or just watch. You can also pick a rule to start there.');
    if (root.contains(document.activeElement) && document.activeElement !== root) hub.querySelector('.ptr-hub-go').focus({ preventScroll: true });
  }
  function startRule(i) {
    var g = state.waiting;
    var focusIn = root.contains(document.activeElement);
    /* Try it yourself (or a rule) is a click, so the tour may speak: the sound
     * comes on, the way Just watch turns on the narration, unless the viewer
     * turned it off themselves */
    if (!state.sound && !state.userMuted) { state.sound = true; unlockAudio(); setSoundUi(); }
    leaveGate();
    hideCards();
    if (!GUIDE.on) setMode('try');
    if (i === 0) state.t = g && g.kind === 'hub' ? g.t : POSTER_T;
    else {
      /* dissolve from the start card into that rule's title */
      if (!jumpCanvas) jumpCanvas = document.createElement('canvas');
      jumpCanvas.width = canvas.width; jumpCanvas.height = canvas.height;
      jumpCanvas.getContext('2d').drawImage(canvas, 0, 0);
      state.jumpFade = performance.now() / 1000;
      state.t = GUIDE_CHAPTERS[i].t;
    }
    state.playing = true; state.started = true; state.userPaused = false;
    rebase();
    /* the effects may still be loading (sound only just came on): they join
     * the picture where it is when they are ready */
    if (state.sound) ensureAudio(function () { if (state.playing && !state.fast && !state.audio.src) { state.t = now(); rebase(); startAudio(); } });
    keepFocus(focusIn);
    kick();
  }
  function showEnd() {
    endCard.hidden = false;
    wantPrompt('end');
    announce('Nice work. That is all three rules. Open Pandion Plots, try the tour again, or watch it narrated.');
    if (root.contains(document.activeElement) && document.activeElement !== root) endCard.querySelector('.ptr-end-app').focus({ preventScroll: true });
  }
  hub.querySelector('.ptr-hub-go').addEventListener('click', function (e) { e.stopPropagation(); startRule(0); });
  hub.querySelector('.ptr-hub-watch').addEventListener('click', function (e) {
    e.stopPropagation();
    startWatching(true);
    root.focus({ preventScroll: true });
  });
  endCard.querySelector('.ptr-end-again').addEventListener('click', function (e) {
    e.stopPropagation();
    endCard.hidden = true;
    if (!GUIDE.on) setMode('try');
    GUIDE.typed = null; GUIDE.typedAt = Infinity;
    seek(POSTER_T - 0.02);
    play();
  });
  endCard.querySelector('.ptr-end-watch').addEventListener('click', function (e) {
    e.stopPropagation();
    endCard.hidden = true;
    startWatching(true);
  });
  showBtn.addEventListener('click', function (e) { e.stopPropagation(); if (state.waiting) showMe(state.waiting); });
  coach.querySelector('.ptr-watchrest').addEventListener('click', function (e) {
    e.stopPropagation();
    startWatching(false);
    root.focus({ preventScroll: true });
  });
  doneBtn.addEventListener('click', function (e) { e.stopPropagation(); commitTyping(); });
  [coach, hub, endCard].forEach(function (el) {
    el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    el.addEventListener('pointerup', function (e) { e.stopPropagation(); });
    el.addEventListener('click', function (e) { e.stopPropagation(); });
  });

  /* typing the axis title: a real text field laid over the drawn one */
  function placeTyping(g) {
    var G = gateShape(g, stateAt(g.t)), s = stage.getBoundingClientRect().width / STAGE_W, r = G.beacon;
    typeIn.style.left = (r[0] * s).toFixed(1) + 'px';
    typeIn.style.top = (r[1] * s).toFixed(1) + 'px';
    typeIn.style.width = (r[2] * s).toFixed(1) + 'px';
    typeIn.style.height = (r[3] * s).toFixed(1) + 'px';
  }
  function beginTyping(g) {
    typeIn.hidden = false;
    typeIn.value = '';
    placeTyping(g);
    GUIDE.typed = null;
    GUIDE.typedAt = g.t;
    setTimeout(function () { if (state.waiting === g) typeIn.focus({ preventScroll: true }); }, 60);
  }
  function commitTyping() {
    var g = state.waiting;
    if (!g || g.kind !== 'type') return;
    var v = (typeIn.value || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    if (!v) { showMe(g); return; }
    leaveGate();
    GUIDE.typed = v;
    GUIDE.typedAt = g.t;
    state.t = typingDone() + 0.02;
    state.playing = true;
    rebase();
    if (state.sound) startAudio();
    root.focus({ preventScroll: true });
    kick();
  }
  typeIn.addEventListener('input', function () {
    GUIDE.typed = typeIn.value.slice(0, 28);
    GUIDE.since = performance.now() / 1000 - 0.3;
    slice('key');
    kick();
  });
  typeIn.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitTyping(); }
    else if (e.key === 'Escape') { e.preventDefault(); root.focus({ preventScroll: true }); }
  });
  typeIn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  typeIn.addEventListener('click', function (e) { e.stopPropagation(); });

  /* pointer: hovers, clicks and drags on the picture */
  function stagePoint(e) {
    var r = stage.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * STAGE_W, (e.clientY - r.top) / r.height * STAGE_H];
  }
  /* 32 CSS px (above the WCAG 2.2 24 px minimum) in stage px at the current size,
   * so the tiny parts of the app are still easy to hit when the picture is small */
  function minHit() { return 32 * STAGE_W / Math.max(1, stage.getBoundingClientRect().width); }
  function setCursorClass(cls) {
    stage.classList.toggle('ptr-over', cls === 'over');
    stage.classList.toggle('ptr-grab', cls === 'grab');
    stage.classList.toggle('ptr-grabbing', cls === 'grabbing');
  }
  stage.addEventListener('pointermove', function (e) {
    if (!GUIDE.on) return;
    var p = stagePoint(e);
    GUIDE.pointer = p;
    if (state.drag && state.drag.phase === 'hold') { if (e.pointerId === state.drag.pid) moveDrag(p); return; }
    var g = state.waiting, cls = '';
    if (g && !state.drag) {
      if (g.kind === 'hub') {
        var hd = hubDotAt(p, minHit());
        GUIDE.hubHover = hd;
        cls = hd >= 0 ? 'over' : '';
      } else if (g.kind === 'click' || g.kind === 'drag') {
        if (gateHit(g, stateAt(state.t), p, g.kind === 'drag', minHit())) cls = g.kind === 'drag' ? 'grab' : 'over';
      }
    }
    setCursorClass(cls);
    kick();
  });
  stage.addEventListener('pointerleave', function () {
    if (state.drag) return;
    GUIDE.pointer = null;
    GUIDE.hubHover = -1;
    kick();
  });
  var pressOn = null;
  stage.addEventListener('pointerdown', function (e) {
    if (!GUIDE.on || e.button > 0) return;
    var g = state.waiting;
    if (!g || state.drag) return;
    var p = stagePoint(e);
    GUIDE.pointer = p;
    if (g.kind === 'hub') { pressOn = hubDotAt(p, minHit()) >= 0 ? g : null; return; }
    if (g.kind === 'type') return;
    var S = stateAt(state.t);
    if (g.kind === 'drag') {
      if (gateHit(g, S, p, true, minHit())) {
        e.preventDefault();
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        startDrag(g, S, p, e.pointerId);
      } else miss(p);
      return;
    }
    pressOn = gateHit(g, S, p, false, minHit()) ? g : null;
    if (!pressOn) miss(p);
  });
  stage.addEventListener('pointerup', function (e) {
    if (!GUIDE.on) return;
    var p = stagePoint(e);
    if (state.drag && state.drag.phase === 'hold') { if (e.pointerId === state.drag.pid) endDrag(p); return; }
    var g = state.waiting;
    if (!g || pressOn !== g) { pressOn = null; return; }
    pressOn = null;
    if (g.kind === 'hub') {
      var d = hubDotAt(p, minHit());
      if (d >= 0) startRule(d);
      return;
    }
    if (gateHit(g, stateAt(state.t), p, false, minHit())) {
      GUIDE.clicks.push([p[0], p[1], performance.now() / 1000]);
      proceed(g);
    }
  });
  stage.addEventListener('pointercancel', function () { if (state.drag && state.drag.phase === 'hold') releaseDrag(false); });

  /* drags: the pointer's travel along the film's own drag path picks the
   * story time, so the dragged part sits under the pointer */
  function startDrag(g, S, p, pid) {
    coach.hidden = true;
    state.drag = { g: g, gate: g, G: gateShape(g, S), p0: p, pid: pid, u: 0, phase: 'hold',
      flipped: false, flipAt: -10, unflipAt: -10, snapped: false, snapAt: -10, flipK: 0, snapK: 0 };
    GUIDE.drag = state.drag;
    state.t = g.path[0];
    setCursorClass('grabbing');
    slice('grab');
    kick();
  }
  function moveDrag(p) {
    var D = state.drag, g = D.g;
    D.u = dragProgress(D.G, D.p0, p);
    state.t = dragTime(g, D.u);
    var rt = performance.now() / 1000;
    if (g.flip) {
      var past = D.u >= DRAG_FLIP_U;
      if (past && !D.flipped) { D.flipped = true; D.flipAt = rt; slice('slide'); }
      else if (!past && D.flipped) { D.flipped = false; D.unflipAt = rt; }
    }
    if (g.snapLeg) {
      var L = g.snapLeg, b = stateAt(state.t).chart.bracket;
      var on = !!b && Math.abs((L === BR.L ? b.x1 : b.x2) - L.to) < 0.5;
      if (on && !D.snapped) { D.snapped = true; D.snapAt = rt; slice('snap'); }
      else if (!on && D.snapped) D.snapped = false;
    }
    kick();
  }
  function endDrag(p) {
    var D = state.drag;
    if (p) moveDrag(p);
    releaseDrag(D.u >= D.g.commit);
  }
  function releaseDrag(ok) {
    var D = state.drag;
    D.phase = ok ? 'settle' : 'back';
    D.r0 = performance.now() / 1000;
    D.u0 = D.u;
    setCursorClass('');
    if (!ok) miss(null);
    kick();
  }
  function stepDragAnim(rt) {
    var D = state.drag, g = D.g;
    var dur = D.phase === 'settle' ? 0.16 : 0.3;
    var k = clamp((rt - D.r0) / dur, 0, 1), e = Ease.outCubic(k);
    D.u = D.phase === 'settle' ? lerp(D.u0, 1, e) : lerp(D.u0, 0, e);
    state.t = dragTime(g, D.u);
    if (g.flip && D.phase === 'settle' && !D.flipped && D.u >= DRAG_FLIP_U) { D.flipped = true; D.flipAt = rt; slice('slide'); }
    if (g.flip && D.phase === 'back' && D.flipped && D.u < DRAG_FLIP_U) { D.flipped = false; D.unflipAt = rt; }
    if (k < 1) return;
    if (D.phase === 'settle') {
      leaveGate();
      state.t = g.path[1];
      state.playing = true;
      rebase();
      if (state.sound) startAudio();
    } else {
      state.drag = null; GUIDE.drag = null;
      arrive(g);
    }
  }
  function updateDragK(rt) {
    var D = state.drag;
    D.flipK = D.flipped ? clamp((rt - D.flipAt) / 0.15, 0, 1) : (D.unflipAt > D.flipAt ? 1 - clamp((rt - D.unflipAt) / 0.15, 0, 1) : 0);
    D.snapK = D.snapped ? clamp((rt - D.snapAt) / 0.1, 0, 1) : 0;
  }

  /* ---- sound ---- */
  function stopAudio() {
    var A = state.audio;
    if (A && A.src) {
      var src = A.src, g = A.srcGain, tNow = A.ctx.currentTime;
      /* a 40 ms fade, never a hard cut (that clicks) */
      try {
        g.gain.cancelScheduledValues(tNow);
        g.gain.setValueAtTime(g.gain.value, tNow);
        g.gain.linearRampToValueAtTime(0, tNow + 0.04);
        src.stop(tNow + 0.05);
      } catch (e) { try { src.stop(); } catch (e2) {} }
      setTimeout(function () { try { src.disconnect(); g.disconnect(); } catch (e) {} }, 120);
      A.src = null; A.srcGain = null;
    }
  }
  function currentBuffer() {
    var A = state.audio;
    return A ? (GUIDE.on ? A.sfx : A.narr) : null;
  }
  function startAudio() {
    var A = state.audio, buf = currentBuffer();
    if (!A || !buf) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    stopAudio();
    var src = A.ctx.createBufferSource();
    src.buffer = buf;
    var g = A.ctx.createGain();
    src.connect(g);
    g.connect(A.gain);
    /* start the buffer a hair early and fade in over that lead, so a sound
     * right at the resume point (the click the viewer just made) plays at
     * full strength; the picture's clock starts where the buffer reaches it */
    var off = Math.max(0, state.t), pre = Math.min(0.03, off), start = A.ctx.currentTime + 0.03;
    state.t0 = state.t;
    state.clock0 = start + pre;
    state.clock = 'audio';
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, start + Math.max(0.005, pre));
    src.start(start, off - pre);
    A.src = src; A.srcGain = g;
  }
  /* one sound effect on its own, for moments the viewer drives (a grab,
   * the bars stepping aside, a snap, a key) */
  function slice(kind) {
    var A = state.audio;
    if (!state.sound || !A || !A.sfx) return;
    var t = -1;
    for (var i = 0; i < SFX.length; i++) if (SFX[i].k === kind) { t = SFX[i].t; break; }
    if (t < 0) return;
    var src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = A.sfx;
    src.connect(g); g.connect(A.gain);
    var t0 = A.ctx.currentTime + 0.005, len = kind === 'key' ? 0.09 : 0.35;
    g.gain.setValueAtTime(1, t0);
    g.gain.setValueAtTime(1, t0 + len - 0.03);
    g.gain.linearRampToValueAtTime(0, t0 + len);
    src.start(t0, Math.max(0, t - 0.005), len);
  }
  /* Harper's hands-on prompts: one file, fetched once, alongside the effects */
  function loadPrompts() {
    var A = state.audio;
    if (!A || A.prompts || A.promptsLoading || A.promptsFailed) return;
    A.promptsLoading = true;
    loadVoice(A.ctx, voiceUrls(options.promptSrc, PROMPT_FILES), function (mono) {
      A.promptsLoading = false;
      if (!mono) {
        A.promptsFailed = true;
        if (window.console) console.warn('Pandion three rules: the spoken prompts could not be loaded; the tour carries on without them.');
        return;
      }
      var b = A.ctx.createBuffer(1, mono.length, A.ctx.sampleRate);
      if (b.copyToChannel) b.copyToChannel(mono, 0); else b.getChannelData(0).set(mono);
      A.prompts = b;
      sayPrompt();
    });
  }
  /* ask for a prompt (a stop just reached, or the end card); it plays as soon
   * as the prompts are loaded, unless the viewer has moved on or has been
   * there a while by then */
  function wantPrompt(id) {
    state.promptWant = { id: id, at: performance.now() / 1000 };
    sayPrompt();
  }
  function sayPrompt() {
    var A = state.audio, w = state.promptWant;
    if (!w || !state.sound || !GUIDE.on || !A || !A.prompts) return;
    state.promptWant = null;
    var c = PROMPT_CLIPS[w.id], waited = performance.now() / 1000 - w.at;
    if (!c || waited > 5) return;
    stopPrompt();
    if (A.ctx.state === 'suspended') A.ctx.resume();
    var src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = A.prompts;
    g.gain.value = VOICE_MIX.gain;
    src.connect(g); g.connect(A.gain);
    src.start(A.ctx.currentTime + Math.max(0.02, PROMPT_DELAY - waited), c[0], c[1] - c[0]);
    var P = { src: src, g: g, id: w.id };
    A.prompt = P;
    spoken.push(w.id);
    src.onended = function () {
      if (A.prompt === P) A.prompt = null;
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    };
  }
  /* the viewer acted, or moved on: she fades out rather than stopping mid-word */
  function stopPrompt() {
    state.promptWant = null;
    var A = state.audio, P = A && A.prompt;
    if (!P) return;
    A.prompt = null;
    var tNow = A.ctx.currentTime;
    try {
      P.g.gain.cancelScheduledValues(tNow);
      P.g.gain.setValueAtTime(P.g.gain.value, tNow);
      P.g.gain.linearRampToValueAtTime(0, tNow + 0.12);
      P.src.stop(tNow + 0.13);
    } catch (e) { try { P.src.stop(); } catch (e2) {} }
  }
  function setSoundUi() {
    var narr = WARP.on;
    soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    soundBtn.classList.toggle('ptr-busy', !!state.audioBusy);
    soundBtn.classList.toggle('ptr-snd', narr);
    soundBtn.innerHTML = (state.audioBusy ? ICONS.busy : state.sound ? ICONS.soundOn : ICONS.soundOff) +
      (narr ? '<span class="ptr-snd-t" aria-hidden="true">Narration</span>' : '');
    soundBtn.setAttribute('aria-label', narr ? 'Narration and sound' : 'Sound');
    soundBtn.title = narr ? (state.audioBusy ? 'Loading the narration' : state.sound ? 'Narration and sound on' : 'Turn on narration and sound')
      : (state.sound ? 'Sound on' : 'Sound off');
  }
  /* hands-on mode plays the sound effects alone (story time); Watch mode plays
   * the narrated film: the voice over the score with its extra bars (film time) */
  function ensureAudio(cb) {
    var need = GUIDE.on ? 'sfx' : 'narr';
    if (need === 'sfx') loadPrompts();
    if (state.audio && state.audio[need]) { cb(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    unlockAudio();
    var A = state.audio;
    if (need === 'sfx') loadPrompts();
    A.waiting = A.waiting || {};
    if (A.waiting[need]) { A.waiting[need].push(cb); return; }
    A.waiting[need] = [cb];
    state.audioBusy = true; setSoundUi();
    var finish = function (res, voiceEnd) {
      var bufr = A.ctx.createBuffer(2, res.left.length, res.sampleRate);
      bufr.copyToChannel ? bufr.copyToChannel(res.left, 0) : bufr.getChannelData(0).set(res.left);
      bufr.copyToChannel ? bufr.copyToChannel(res.right, 1) : bufr.getChannelData(1).set(res.right);
      A[need] = bufr;
      if (need === 'narr') A.voiceEnd = voiceEnd || 0;
      state.audioBusy = false; setSoundUi();
      var w = A.waiting[need]; A.waiting[need] = null;
      for (var i = 0; i < w.length; i++) w[i]();
    };
    if (need === 'sfx') { renderScoreAsync(A.ctx.sampleRate, 'sfx', null, finish); return; }
    loadVoice(A.ctx, voiceUrls(options.voiceSrc), function (voice) {
      var vEnd = 0;
      if (!voice && window.console) console.warn('Pandion three rules: the narration could not be loaded; playing the score alone.');
      if (voice) {
        /* the picture holds its last frame until the last word */
        var last = voice.length - 1;
        while (last > 0 && Math.abs(voice[last]) < 0.003) last--;
        vEnd = last / A.ctx.sampleRate + 0.3;
      }
      renderScoreAsync(A.ctx.sampleRate, 'narr', voice, function (res) { finish(res, vEnd); });
    });
  }
  soundBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (state.audioBusy) return;
    if (state.playing && !state.fast) { state.t = now(); stopAudio(); rebase(); }
    state.sound = !state.sound;
    state.userMuted = !state.sound;
    setSoundUi();
    if (!state.sound) { stopAudio(); stopPrompt(); return; }
    unlockAudio();
    ensureAudio(function () {
      if (!state.sound) return;
      if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
      /* narration rejoins at the start of the sentence under way */
      if (state.playing && !state.fast) { state.t = now(); alignToSentence(); rebase(); startAudio(); }
      /* waiting at a stop: Harper says what to do (sound just came on) */
      if (GUIDE.on && state.waiting && state.waiting.kind !== 'hub' && !state.drag) wantPrompt(state.waiting.id);
    });
    /* resume inside the gesture so Safari unlocks audio */
    if (state.audio && state.audio.ctx && state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
  });

  playBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  modeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var wasWaiting = !!state.waiting;
    setMode(GUIDE.on ? 'watch' : 'try');
    if (!GUIDE.on && wasWaiting) play();
    announce(GUIDE.on ? 'Hands-on: the tour stops so you can do each step yourself.' : 'Watching: the tour plays straight through. Turn on Narration to hear it explained.');
    draw();
  });
  ccBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    state.cc = !state.cc;
    ccBtn.setAttribute('aria-pressed', state.cc ? 'true' : 'false');
    announce(state.cc ? 'Captions on.' : 'Captions off.');
    delete ui.cap;
    updateUi();
  });
  cover.addEventListener('click', function (e) { e.stopPropagation(); play(); root.focus({ preventScroll: true }); });
  stage.addEventListener('click', function () {
    /* in hands-on mode a click on the picture is a click in the app */
    if (!GUIDE.on) toggle();
  });
  root.addEventListener('keydown', function (e) {
    if (e.target === typeIn) return;
    var onChrome = e.target !== root && e.target !== stage;
    var k = e.key;
    if (state.waiting && !onChrome && (k === 'Enter' || k === ' ')) { e.preventDefault(); showMe(state.waiting); return; }
    if (onChrome && k !== 'k' && k !== 'K') return;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(state.t + 5); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(state.t - 5); }
    else if (k === 'Home') { e.preventDefault(); seek(0); }
    else if (k === 'End') { e.preventDefault(); seek(dur()); }
    else if ((k === 'c' || k === 'C') && WARP.on) { e.preventDefault(); ccBtn.click(); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); soundBtn.click(); }
  });

  /* Autoplay (muted) once the tour is mostly in view; pause when it leaves. */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      var e = ents[ents.length - 1];
      state.visible = e.isIntersecting && e.intersectionRatio >= 0.45;
      if (state.visible) {
        if (!reduce && options.autoplay !== false && !state.userPaused && !state.ended && !state.waiting && !state.playing && (state.t < 0.05 || state.autoPaused)) play();
      } else if (state.playing && !(e.isIntersecting && e.intersectionRatio > 0.1)) {
        pause(false); state.autoPaused = true;
      }
    }, { threshold: [0, 0.1, 0.45, 0.8] });
    io.observe(root);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPrompt();
    if (document.hidden && state.playing) { pause(false); state.autoPaused = true; }
  });
  setMode(state.mode);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  resize();
  /* no autoplay (reduced motion, or asked for): open on the start card */
  if (GUIDE.on && (reduce || options.autoplay === false)) { state.started = true; arrive(GATES[0]); }
  else if (!GUIDE.on && reduce) state.t = dur();
  updateUi();
  setTimeout(function () { state.coverReady = true; updateUi(); }, 700);
  /* warm caches (text metrics, paths, font fallbacks) while the page is idle,
   * so the first pass through each scene never stutters */
  (function warm() {
    var wc = document.createElement('canvas');
    wc.width = 192; wc.height = 108;
    var wctx = wc.getContext('2d'), stops = [8, 12.3, 16, 20.5, 24, 30.3, 33.5, 38.5, 45.5], i = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 60); };
    function step(dl) {
      var was = GUIDE.on, wasW = WARP.on;
      GUIDE.on = false; WARP.on = false;
      while (i < stops.length && dl.timeRemaining() > 4) { try { renderFrame(wctx, stops[i++], 0.1); } catch (e) { i = stops.length; } }
      GUIDE.on = was; WARP.on = wasW;
      if (i < stops.length) idle(step);
    }
    idle(step);
  })();
  var api = {
    play: play, pause: function () { pause(true); }, seek: seek, showMe: function () { if (state.waiting) showMe(state.waiting); },
    setMode: setMode, get mode() { return state.mode; },
    get time() { return state.t; }, get playing() { return state.playing; },
    get duration() { return dur(); }, get filmDuration() { return FILM_DURATION; }, get ended() { return state.ended; },
    get sound() { return state.sound; }, get captions() { return state.cc; },
    get voiceEnd() { return state.audio && state.audio.voiceEnd || 0; },
    /* for tests: the narrated mix the player built (an AudioBuffer), once ready */
    get narrationMix() { return state.audio && state.audio.narr || null; },
    get waiting() { return state.waiting ? state.waiting.id : null; },
    get dragging() { return !!state.drag; },
    /* for tests: Harper's hands-on prompts (loaded?, the one playing, all started so far) */
    get promptsReady() { return !!(state.audio && state.audio.prompts); },
    get prompt() { return state.audio && state.audio.prompt ? state.audio.prompt.id : null; },
    get spoken() { return spoken.slice(); }
  };
  host.__ptr = api;
  return api;
}

/* ---- score rendering off the main thread ---- */
var _scoreCache = {};
function renderScoreAsync(sr, kind, voice, cb) {
  var key = sr + ':' + kind + (voice ? ':voice' : '');
  if (_scoreCache[key]) { cb(_scoreCache[key]); return; }
  function payloadWith(v) {
    if (kind === 'sfx') return { sampleRate: sr, duration: DURATION, cues: SFX, finale: FINALE, music: false };
    var p = { sampleRate: sr, duration: FILM_AUDIO_DURATION, cues: FILM_SFX, finale: FILM_FINALE, plan: FILM_PLAN, titleTimes: FILM_TITLES };
    if (v) p.voice = { data: v, gain: VOICE_MIX.gain, bedDb: VOICE_MIX.bedDb };
    return p;
  }
  var payload = payloadWith(voice);
  var done = function (res) { _scoreCache[key] = res; cb(res); };
  try {
    var src = 'self.onmessage=function(e){var r=(' + renderSoundtrack.toString() + ')(e.data);' +
      'self.postMessage(r,[r.left.buffer,r.right.buffer]);};';
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    var w = new Worker(url);
    w.onmessage = function (e) { URL.revokeObjectURL(url); w.terminate(); done(e.data); };
    w.onerror = function () { URL.revokeObjectURL(url); w.terminate(); setTimeout(function () { done(renderSoundtrack(payload)); }, 0); };
    /* hand the worker its own copy of the voice, keep ours for the fallback */
    var vcopy = voice ? voice.slice(0) : null;
    w.postMessage(payloadWith(vcopy), vcopy ? [vcopy.buffer] : []);
  } catch (err) {
    setTimeout(function () { done(renderSoundtrack(payload)); }, 0);
  }
}

var TRANSCRIPT_SHORT = 'An interactive tour of Pandion Plots, which works by three rules. It stops at each step so you can do it ' +
  'yourself, or show you; Just watch plays it straight through, narrated, with captions. Rule 1: to change something, click it. ' +
  'Clicking a bar opens its settings under the chart; picking a color recolors that series, and clicking the ' +
  'axis title lets you type a new one. Rule 2: to move something, drag it. Dragging a bar past its neighbor ' +
  'swaps the two groups in every category, and dragging the legend places it anywhere. Rule 3: to add something, click the Add button. The ' +
  'Add menu puts data points on the chart, and a significance bracket dragged onto two bars computes its own test. ' +
  'Click to change, drag to move, click plus to add.';
