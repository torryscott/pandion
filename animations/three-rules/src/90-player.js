/* The player: a responsive canvas, a chapter bar, sound on demand.
 *
 *   <div data-pandion-three-rules></div>
 *
 * Plays muted when it scrolls into view (never under reduced motion),
 * pauses when it leaves, and ends on the recap frame. Sound is off until
 * asked for; the score is then rendered in a worker in well under a
 * second and kept in sync with the picture. */

var PLAYER_CSS = [
  '.ptr{position:relative;border:1px solid #dde5ee;border-radius:12px;overflow:hidden;background:#fff;',
  'box-shadow:0 10px 28px rgba(25,46,73,.10);color:#22364d;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
  '.ptr:focus-visible{outline:3px solid #375CA0;outline-offset:3px}',
  '.ptr-stage{position:relative;aspect-ratio:16/9;background:linear-gradient(#fff,#f4f7fb);cursor:pointer}',
  '.ptr-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
  '.ptr-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
  'background:rgba(251,252,254,.35);transition:opacity .25s ease;border:0;padding:0;margin:0;width:100%;cursor:pointer}',
  '.ptr-cover[hidden]{display:none}',
  '.ptr-cover{animation:ptrfade .25s ease}',
  '@keyframes ptrfade{from{opacity:0}to{opacity:1}}',
  '.ptr-cover span{display:inline-flex;align-items:center;gap:12px;padding:14px 26px 14px 20px;border-radius:999px;',
  'background:#192E49;color:#fff;font-weight:700;font-size:17px;box-shadow:0 12px 30px rgba(25,46,73,.28);transition:transform .15s ease,background .15s ease}',
  '.ptr-cover:hover span{background:#24405f;transform:translateY(-1px)}',
  '.ptr-cover svg{width:22px;height:22px}',
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
  '.ptr-chaps{flex:1 1 auto;display:flex;gap:4px;min-width:0}',
  '.ptr-chap{position:relative;flex:1 1 0;min-width:30px;min-height:32px;border:0;background:none;padding:6px 0 0;margin:0;cursor:pointer;text-align:left;color:#5f6f80;font:inherit}',
  '.ptr-track{display:block;height:6px;border-radius:3px;background:#e3eaf3;overflow:hidden}',
  '.ptr-fill{display:block;height:100%;width:0;background:#375CA0;border-radius:3px}',
  '.ptr-lbl{display:block;margin-top:6px;font-size:12.5px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ptr-chap[aria-current="true"] .ptr-lbl{color:#192E49}',
  '.ptr-chap:hover .ptr-lbl{color:#375CA0}',
  '.ptr-time{flex:0 0 auto;font-size:12.5px;font-variant-numeric:tabular-nums;color:#5f6f80;min-width:34px;text-align:right}',
  '.ptr-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
  '@media (max-width:560px){.ptr-bar{gap:10px;padding:8px 10px}.ptr-lbl{font-size:11.5px}.ptr-time{display:none}',
  '.ptr-chap:not([aria-current="true"]) .ptr-lbl{visibility:hidden}.ptr-btn{width:34px;height:34px}}'
].join('');

var ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 3.5v4.4h4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  busy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
};

var POSTER_T = 3.2;

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
  var label = options.label || 'Animation: the three rules of Pandion Plots';
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
  var stage = document.createElement('div');
  stage.className = 'ptr-stage';
  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  var cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'ptr-cover';
  cover.innerHTML = '<span><i class="ptr-i-play" style="display:contents">' + ICONS.play + '</i><i class="ptr-i-replay" style="display:none">' + ICONS.replay + '</i><b>Play the tour</b></span>';
  stage.appendChild(cover);
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
    (function (tt, t1, btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        /* pointer clicks seek to that spot in the chapter; keyboard jumps to its start */
        var to = tt;
        if (e.detail > 0 && e.clientX) {
          var r = btn.getBoundingClientRect();
          var f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
          to = f < 0.06 ? tt : tt + f * (t1 - tt);
        }
        seek(to); play();
      });
    })(c.t, end, b);
    chaps.appendChild(b);
    chapEls.push({ el: b, fill: b.querySelector('.ptr-fill'), t0: c.t, t1: end });
  }
  var timeEl = document.createElement('span');
  timeEl.className = 'ptr-time';
  timeEl.setAttribute('aria-hidden', 'true');
  var soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'ptr-btn';
  soundBtn.setAttribute('aria-pressed', 'false');
  soundBtn.setAttribute('aria-label', 'Sound');
  soundBtn.title = 'Sound';
  soundBtn.innerHTML = ICONS.soundOff;
  bar.appendChild(playBtn); bar.appendChild(chaps); bar.appendChild(timeEl); bar.appendChild(soundBtn);
  root.appendChild(bar);
  host.appendChild(root);

  var ctx = canvas.getContext('2d');
  var state = {
    t: reduce ? DURATION : 0, playing: false, ended: false, userPaused: false, autoPaused: false, reduce: reduce,
    clock0: 0, t0: 0, visible: false, sound: false, audio: null, audioBusy: false, raf: 0, dpr: 1, w: 0
  };

  function resize() {
    var r = stage.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.width * 9 / 16 * dpr));
    state.compact = r.width < 700;
    root.classList.toggle('ptr-compact', state.compact);
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
    state.w = w;
    draw();
  }
  var poster = null;
  function draw() {
    if (!canvas.width) return;
    RENDER_OPTS.compact = !!state.compact;
    /* before the first play, show the finished title instead of a blank frame */
    var idle = !state.playing && !state.started;
    var tt = (idle && state.t < 0.05) ? POSTER_T : Math.min(state.t, DURATION);
    if (idle && state.reduce) tt = DURATION;
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
    if (state.compact) {
      var cp = captionForTime(t);
      setOnce('cap', cp.lead + '|' + cp.text, function () {
        capEl.textContent = '';
        var b = document.createElement('b'); b.textContent = cp.lead + (cp.text ? '.' : '');
        capEl.appendChild(b);
        capEl.appendChild(document.createTextNode(cp.text));
      });
    }
    /* no button over the final frame: it is the summary, so keep it clear */
    var coverState = state.playing || state.ended || (state.reduce && !state.started) || !state.coverReady ? 'hide' : (state.started && t > 0.05 ? 'resume' : 'start');
    setOnce('cover', coverState, function (v) {
      cover.hidden = v === 'hide';
      if (v === 'hide') return;
      cover.querySelector('b').textContent = v === 'resume' ? 'Resume' : 'Watch the three rules';
      cover.querySelector('.ptr-i-play').style.display = v === 'ended' ? 'none' : 'contents';
      cover.querySelector('.ptr-i-replay').style.display = v === 'ended' ? 'contents' : 'none';
      cover.setAttribute('aria-label', v === 'ended' ? 'Watch again' : 'Play');
    });
    setOnce('btn', state.playing ? 'pause' : state.ended ? 'replay' : 'play', function (v) {
      playBtn.innerHTML = ICONS[v];
      var lbl = v === 'pause' ? 'Pause' : v === 'replay' ? 'Replay' : 'Play';
      playBtn.setAttribute('aria-label', lbl);
      playBtn.title = lbl;
    });
  }
  /* one clock at a time: the audio clock while the score plays (so picture
   * and sound cannot drift), the page clock otherwise */
  function now() {
    if (state.clock === 'audio' && state.audio && state.audio.ctx)
      return state.t0 + Math.max(0, state.audio.ctx.currentTime - state.clock0);
    return state.t0 + (performance.now() / 1000 - state.clock0);
  }
  function rebase() { state.t0 = state.t; state.clock0 = performance.now() / 1000; state.clock = 'perf'; }
  function loop() {
    state.raf = 0;
    if (!state.playing) return;
    state.t = now();
    if (state.t >= DURATION) { state.t = DURATION; state.playing = false; state.ended = true; stopAudio(); rebase(); }
    draw();
    if (state.playing) state.raf = requestAnimationFrame(loop);
  }
  function play() {
    if (state.playing) return;
    if (state.ended || state.t >= DURATION || (!state.started && state.reduce)) { state.t = 0; state.ended = false; }
    if (!state.started && state.posterValid) state.posterFade = performance.now() / 1000;
    state.playing = true; state.started = true; state.userPaused = false; state.autoPaused = false;
    rebase();
    if (state.sound) startAudio();
    if (!state.raf) state.raf = requestAnimationFrame(loop);
    updateUi();
  }
  function pause(user) {
    if (!state.playing) return;
    state.t = now();
    state.playing = false;
    if (user) { state.userPaused = true; state.coverReady = true; }
    stopAudio();
    rebase();
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    draw();
  }
  function seek(t) {
    var was = state.playing;
    if (was) { stopAudio(); }
    state.t = clamp(t, 0, DURATION);
    state.ended = state.t >= DURATION;
    rebase();
    if (was && state.sound) startAudio();
    draw();
  }
  function toggle() { if (state.playing) pause(true); else play(); }

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
  function startAudio() {
    var A = state.audio;
    if (!A || !A.buffer) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
    stopAudio();
    var src = A.ctx.createBufferSource();
    src.buffer = A.buffer;
    var g = A.ctx.createGain();
    src.connect(g);
    g.connect(A.gain);
    var off = Math.max(0, state.t);
    state.t0 = state.t;
    state.clock0 = A.ctx.currentTime + 0.03;
    state.clock = 'audio';
    g.gain.setValueAtTime(0, state.clock0);
    g.gain.linearRampToValueAtTime(1, state.clock0 + 0.03);
    src.start(state.clock0, off);
    A.src = src; A.srcGain = g;
  }
  function setSoundUi() {
    soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    soundBtn.classList.toggle('ptr-busy', state.audioBusy);
    soundBtn.innerHTML = state.audioBusy ? ICONS.busy : state.sound ? ICONS.soundOn : ICONS.soundOff;
    soundBtn.title = state.sound ? 'Sound on' : 'Sound off';
  }
  function ensureAudio(cb) {
    if (state.audio && state.audio.buffer) { cb(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ac = new AC();
    var gain = ac.createGain();
    gain.gain.value = 0.9;
    gain.connect(ac.destination);
    state.audio = { ctx: ac, gain: gain, buffer: null, src: null };
    state.audioBusy = true; setSoundUi();
    renderScoreAsync(ac.sampleRate, function (res) {
      var bufr = ac.createBuffer(2, res.left.length, res.sampleRate);
      bufr.copyToChannel ? bufr.copyToChannel(res.left, 0) : bufr.getChannelData(0).set(res.left);
      bufr.copyToChannel ? bufr.copyToChannel(res.right, 1) : bufr.getChannelData(1).set(res.right);
      state.audio.buffer = bufr;
      state.audioBusy = false; setSoundUi();
      cb();
    });
  }
  soundBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (state.audioBusy) return;
    if (state.playing) { state.t = now(); stopAudio(); rebase(); }
    state.sound = !state.sound;
    setSoundUi();
    if (state.sound) {
      ensureAudio(function () {
        if (!state.sound) return;
        if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
        if (state.playing) { state.t = now(); rebase(); startAudio(); }
        else if (state.ended || state.t >= DURATION || state.t < 0.05) play();
      });
      /* resume inside the gesture so Safari unlocks audio */
      if (state.audio && state.audio.ctx && state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
    }
  });

  playBtn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  cover.addEventListener('click', function (e) { e.stopPropagation(); play(); root.focus({ preventScroll: true }); });
  stage.addEventListener('click', function () { toggle(); });
  root.addEventListener('keydown', function (e) {
    if (e.target !== root && e.target !== stage) {
      if (e.key !== 'k' && e.key !== 'K') return;
    }
    var k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(state.t + 5); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(state.t - 5); }
    else if (k === 'Home') { e.preventDefault(); seek(0); }
    else if (k === 'End') { e.preventDefault(); seek(DURATION); }
    else if (k === 'm' || k === 'M') { e.preventDefault(); soundBtn.click(); }
  });

  /* Autoplay (muted) once the film is mostly in view; pause when it leaves. */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      var e = ents[ents.length - 1];
      state.visible = e.isIntersecting && e.intersectionRatio >= 0.45;
      if (state.visible) {
        if (!reduce && options.autoplay !== false && !state.userPaused && !state.ended && (!state.playing) && (state.t < 0.05 || state.autoPaused)) play();
      } else if (state.playing && !(e.isIntersecting && e.intersectionRatio > 0.1)) {
        pause(false); state.autoPaused = true;
      }
    }, { threshold: [0, 0.1, 0.45, 0.8] });
    io.observe(root);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.playing) { pause(false); state.autoPaused = true; }
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);
  resize();
  updateUi();
  /* only offer the big button if playback has not started on its own */
  setTimeout(function () { state.coverReady = true; updateUi(); }, 700);
  /* warm caches (text metrics, paths, font fallbacks) while the page is idle,
   * so the first pass through each scene never stutters */
  (function warm() {
    var wc = document.createElement('canvas');
    wc.width = 192; wc.height = 108;
    var wctx = wc.getContext('2d'), stops = [8, 12.3, 16, 20.5, 24, 30.3, 33.5, 38.5, 45.5], i = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 60); };
    function step(dl) {
      while (i < stops.length && dl.timeRemaining() > 4) { try { renderFrame(wctx, stops[i++], 0.1); } catch (e) { i = stops.length; } }
      if (i < stops.length) idle(step);
    }
    idle(step);
  })();
  var api = { play: play, pause: function () { pause(true); }, seek: seek, get time() { return state.t; }, get playing() { return state.playing; } };
  host.__ptr = api;
  return api;
}

/* ---- score rendering off the main thread ---- */
var _scoreCache = {};
function renderScoreAsync(sr, cb) {
  if (_scoreCache[sr]) { cb(_scoreCache[sr]); return; }
  var payload = { sampleRate: sr, duration: DURATION, cues: SFX, finale: FINALE };
  var done = function (res) { _scoreCache[sr] = res; cb(res); };
  try {
    var src = 'self.onmessage=function(e){var r=(' + renderSoundtrack.toString() + ')(e.data);' +
      'self.postMessage(r,[r.left.buffer,r.right.buffer]);};';
    var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    var w = new Worker(url);
    w.onmessage = function (e) { URL.revokeObjectURL(url); w.terminate(); done(e.data); };
    w.onerror = function () { URL.revokeObjectURL(url); w.terminate(); setTimeout(function () { done(renderSoundtrack(payload)); }, 0); };
    w.postMessage(payload);
  } catch (err) {
    setTimeout(function () { done(renderSoundtrack(payload)); }, 0);
  }
}

var TRANSCRIPT_SHORT = 'Pandion Plots works by three rules. Rule 1: to change something, click it. ' +
  'Clicking a bar opens its settings under the chart; picking a color recolors that series, and clicking the ' +
  'axis title lets you type a new one. Rule 2: to move something, drag it. Dragging a pair of bars reorders the ' +
  'categories, and dragging the legend places it anywhere. Rule 3: to add something, click the Add button. The ' +
  'Add menu puts data points on the chart, and a significance bracket dragged onto two bars computes its own test. ' +
  'Click to change, drag to move, click plus to add.';
