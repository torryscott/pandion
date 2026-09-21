/* ps-tours.js - workspace tours (Sep 20 2026, Torry's "Tours" item).
 *
 * ORIENTATION, not walkthroughs. A tour spotlights one landmark at a time
 * and says in a sentence what it is for. It never clicks anything, moves a
 * cursor, or changes the chart. That is the whole difference from the
 * "Show me how" walkthroughs that left the app on Sep 16 2026: those drove
 * the real engine through synthetic clicks, and the engine's rules for
 * synthetic input made them mislead. A spotlight can only be wrong about
 * WHERE a thing is, and it re-measures that on every animation frame.
 *
 * Shape: tours are data (TOURS, at the bottom). A step is a target and two
 * lines of copy. Targets are resolved LAZILY on every frame and take the
 * first VISIBLE match, because the engine rebuilds its toolbar on every
 * option echo and keeps retired chrome in the document. A step marked
 * optional is skipped when its target is not on screen (the inspector is
 * a drawer on narrow windows). The overlay lives outside #psroot and
 * carries ignore-html, so no copy, export or Notebook snapshot can contain
 * it. While a tour is open the pointer cannot reach the app underneath;
 * keys: Right or Enter next, Left back, Escape exits, Tab stays in the card.
 *
 * The shell wires the entry points (Help menu, the chart's empty state)
 * and exposes the few things a tour's prepare step needs: the workspace
 * switch, the chart-help state, opening an example, dismissing the coach.
 */
(function () {
  "use strict";

  var Z_PAD = 6;                         // breathing room around a landmark
  var GAP = 14;                          // card distance from the spotlight
  var SEEN_KEY = "psstandalone.tours.seen.v1";
  var TOURS = {};
  var ui = null;                         // overlay nodes, built once
  var live = null;                       // { id, tour, i, rect, raf, opener }

  function S() { return window.PS_SHELL || {}; }

  /* ----------------------------------------------------------- helpers */
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    try {
      var cs = window.getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
    } catch (ignore) {}
    return true;
  }
  function firstVisible(sel) {
    var list;
    try { list = document.querySelectorAll(sel); } catch (e) { return null; }
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }
  function resolveTargets(step) {
    var specs = step && step.target ? [].concat(step.target) : [];
    var out = [];
    for (var i = 0; i < specs.length; i++) {
      var el = typeof specs[i] === "function" ? specs[i]() : firstVisible(specs[i]);
      if (el && visible(el)) out.push(el);
    }
    return out;
  }
  function unionRect(els) {
    var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (var i = 0; i < els.length; i++) {
      var q = els[i].getBoundingClientRect();
      l = Math.min(l, q.left); t = Math.min(t, q.top);
      r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }
  function readSeen() {
    try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function markSeen(id) {
    var s = readSeen(); s[id] = 1;
    try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function setBox(node, x, y, w, h) {
    node.style.left = Math.round(x) + "px";
    node.style.top = Math.round(y) + "px";
    node.style.width = Math.round(w) + "px";
    node.style.height = Math.round(h) + "px";
  }

  /* ----------------------------------------------------------- overlay */
  function build() {
    if (ui) return ui;
    var root = document.createElement("div");
    root.id = "ps-tour";
    root.className = "ps-tour ignore-html";
    root.hidden = true;
    root.innerHTML =
      '<div class="ps-tour-spot" aria-hidden="true"></div>' +
      '<div class="ps-tour-card" role="dialog" aria-labelledby="ps-tour-title" ' +
        'aria-describedby="ps-tour-body">' +
        '<div class="ps-tour-arrow" aria-hidden="true"></div>' +
        '<div class="ps-tour-head">' +
          '<span class="ps-tour-eyebrow" id="ps-tour-eyebrow"></span>' +
          '<button type="button" class="ps-tour-exit" id="ps-tour-exit" ' +
            'aria-label="Exit tour" title="Exit tour (Esc)">&times;</button>' +
        '</div>' +
        '<strong id="ps-tour-title"></strong>' +
        '<p id="ps-tour-body"></p>' +
        '<p class="ps-tour-note" id="ps-tour-note" hidden></p>' +
        '<div class="ps-tour-foot">' +
          '<div class="ps-tour-dots" id="ps-tour-dots" aria-hidden="true"></div>' +
          '<div class="ps-tour-actions">' +
            '<button type="button" class="ps-btn" id="ps-tour-back">Back</button>' +
            '<button type="button" class="ps-btn ps-primary" id="ps-tour-next">Next</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ps-tour-live" aria-live="polite" id="ps-tour-live"></div>';
    document.body.appendChild(root);
    ui = {
      root: root,
      spot: root.querySelector(".ps-tour-spot"),
      card: root.querySelector(".ps-tour-card"),
      arrow: root.querySelector(".ps-tour-arrow"),
      eyebrow: root.querySelector("#ps-tour-eyebrow"),
      title: root.querySelector("#ps-tour-title"),
      body: root.querySelector("#ps-tour-body"),
      note: root.querySelector("#ps-tour-note"),
      dots: root.querySelector("#ps-tour-dots"),
      back: root.querySelector("#ps-tour-back"),
      next: root.querySelector("#ps-tour-next"),
      exit: root.querySelector("#ps-tour-exit"),
      liveRegion: root.querySelector("#ps-tour-live")
    };
    ui.back.addEventListener("click", back);
    ui.next.addEventListener("click", next);
    ui.exit.addEventListener("click", function () { exit(); });
    // The overlay owns the pointer for the tour's duration. A press on the
    // scrim does nothing (predictable beats clever), and preventDefault
    // keeps focus in the card so the keys keep working.
    root.addEventListener("pointerdown", function (e) {
      if (!e.target.closest || !e.target.closest(".ps-tour-card")) e.preventDefault();
    });
    return ui;
  }

  function place() {
    if (!live || !ui) return;
    var step = live.tour.steps[live.i];
    var els = resolveTargets(step);
    var r = els.length ? unionRect(els) : null;
    // Mid-rebuild (the engine re-renders its toolbar on every echo) the
    // target can be absent for a frame: hold the last known spot rather
    // than flashing the card to the centre and back.
    if (!r && step.target && live.rect) r = live.rect;
    live.rect = r;
    var vw = window.innerWidth, vh = window.innerHeight;
    var card = ui.card, cw = card.offsetWidth, ch = card.offsetHeight;
    var left, top, side = "";
    if (r) {
      ui.spot.style.display = "";
      ui.root.classList.remove("ps-tour-nospot");
      setBox(ui.spot, r.left - Z_PAD, r.top - Z_PAD,
             r.width + 2 * Z_PAD, r.height + 2 * Z_PAD);
      var below = r.bottom + Z_PAD + GAP, above = r.top - Z_PAD - GAP - ch;
      if (below + ch <= vh - 10) { top = below; side = "top"; }
      else if (above >= 10) { top = above; side = "bottom"; }
      else if (r.right + Z_PAD + GAP + cw <= vw - 10) {
        left = r.right + Z_PAD + GAP; side = "left";
      } else if (r.left - Z_PAD - GAP - cw >= 10) {
        left = r.left - Z_PAD - GAP - cw; side = "right";
      }
      if (side === "top" || side === "bottom")
        left = Math.max(10, Math.min(vw - cw - 10, r.left - Z_PAD));
      else if (side === "left" || side === "right")
        top = Math.max(10, Math.min(vh - ch - 10, r.top - Z_PAD));
      else {   // nowhere beside it: float over the middle of the window
        left = Math.max(10, (vw - cw) / 2); top = Math.max(10, (vh - ch) / 2);
      }
    } else {
      ui.spot.style.display = "none";
      ui.root.classList.add("ps-tour-nospot");
      var host = document.getElementById("psroot");
      var hr = host && visible(host) ? host.getBoundingClientRect()
        : { left: 0, top: 0, width: vw, height: vh };
      left = Math.max(10, Math.min(vw - cw - 10, hr.left + (hr.width - cw) / 2));
      top = Math.max(10, Math.min(vh - ch - 10, hr.top + (hr.height - ch) / 2));
    }
    var key = [Math.round(left), Math.round(top), side, r ? Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height) : "-"].join("|");
    if (key === live.posKey) return;   // nothing moved: write nothing
    live.posKey = key;
    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";
    ui.arrow.setAttribute("data-side", side);
    if (side === "top" || side === "bottom") {
      var ax = Math.max(18, Math.min(cw - 18, (r.left + r.width / 2) - left)) - 6;
      ui.arrow.style.left = Math.round(ax) + "px"; ui.arrow.style.top = "";
    } else if (side === "left" || side === "right") {
      var ay = Math.max(18, Math.min(ch - 18, (r.top + r.height / 2) - top)) - 6;
      ui.arrow.style.top = Math.round(ay) + "px"; ui.arrow.style.left = "";
    }
  }
  function tick() {
    if (!live) return;
    place();
    live.raf = window.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------- steps */
  function show(i, dir) {
    var steps = live.tour.steps, n = steps.length;
    dir = dir || 1;
    // An optional step whose landmark is not on screen is skipped in the
    // direction of travel, never shown pointing at nothing.
    while (i >= 0 && i < n && steps[i].optional && !resolveTargets(steps[i]).length) i += dir;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    live.i = i; live.rect = null; live.posKey = "";
    var step = steps[i];
    ui.eyebrow.textContent = live.tour.title + " \u00b7 " + (i + 1) + " of " + n;
    ui.title.textContent = step.title || "";
    ui.body.textContent = step.body || "";
    // A note from the prepare step (it opened the example) rides the first
    // card only: the user should know the chart on screen is not theirs.
    ui.note.textContent = i === 0 && live.note ? live.note : "";
    ui.note.hidden = !(i === 0 && live.note);
    var dots = "";
    for (var k = 0; k < n; k++) dots += '<span class="' + (k === i ? "ps-on" : "") + '"></span>';
    ui.dots.innerHTML = dots;
    ui.back.disabled = i === 0;
    ui.next.textContent = i === n - 1 ? "Done" : "Next";
    ui.liveRegion.textContent = "Step " + (i + 1) + " of " + n + ". " +
      (step.title ? step.title + ". " : "") + (step.body || "");
    place();
    try { ui.next.focus({ preventScroll: true }); } catch (e) { try { ui.next.focus(); } catch (ignore) {} }
  }
  function next() {
    if (!live) return;
    if (live.i >= live.tour.steps.length - 1) { exit(true); return; }
    show(live.i + 1, 1);
  }
  function back() {
    if (!live || live.i === 0) return;
    show(live.i - 1, -1);
  }
  function onKey(e) {
    if (!live) return;
    var k = e.key;
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); exit(); return; }
    if (k === "ArrowRight") { e.preventDefault(); e.stopPropagation(); next(); return; }
    if (k === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); back(); return; }
    if (k === "Tab") {
      // Focus stays inside the card: exit, back, next, and around again.
      var f = [ui.exit, ui.back, ui.next].filter(function (b) { return !b.disabled; });
      var at = f.indexOf(document.activeElement);
      var to = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + f.length) % f.length;
      e.preventDefault(); e.stopPropagation();
      try { f[to].focus({ preventScroll: true }); } catch (ignore) {}
      return;
    }
    if (k === "Enter" && !(e.target && e.target.closest && e.target.closest(".ps-tour-card button"))) {
      e.preventDefault(); e.stopPropagation(); next();
    }
  }

  /* ------------------------------------------------------- start / end */
  function begin(id, tour, opener, note) {
    build();
    live = { id: id, tour: tour, i: 0, rect: null, raf: 0, opener: opener, posKey: "", note: note || "" };
    ui.root.classList.remove("ps-tour-anim");
    ui.root.hidden = false;
    window.addEventListener("keydown", onKey, true);
    show(0, 1);
    // Glide between steps, but never from wherever the card last sat.
    window.requestAnimationFrame(function () {
      if (live) ui.root.classList.add("ps-tour-anim");
      tick();
    });
  }
  function start(id) {
    var tour = TOURS[id];
    if (!tour) return false;
    if (live) exit(false);
    var opener = document.activeElement;
    var go = function (note) { begin(id, tour, opener, note); };
    if (tour.prepare) {
      tour.prepare(go, function (msg) {
        if (msg && S().toast) S().toast(msg);
      });
    } else go();
    return true;
  }
  function exit(done) {
    if (!live) return;
    var was = live;
    if (done || was.i > 0) markSeen(was.id);
    live = null;
    if (was.raf) window.cancelAnimationFrame(was.raf);
    window.removeEventListener("keydown", onKey, true);
    if (ui) { ui.root.hidden = true; ui.root.classList.remove("ps-tour-anim"); }
    var back = was.opener && was.opener.isConnected && visible(was.opener)
      ? was.opener : firstVisible("#psroot svg");
    if (back) { try { back.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ------------------------------------------------------ the tours */
  // Charts. Every landmark is a stable handle: the engine's own data-role
  // and aria-label attributes on the toolbar, the shell's ids elsewhere.
  function waitUntil(test, ms, cb) {
    var t0 = Date.now();
    (function poll() {
      if (test()) { cb(true); return; }
      if (Date.now() - t0 > ms) { cb(false); return; }
      window.setTimeout(poll, 60);
    })();
  }
  TOURS.charts = {
    title: "Charts tour",
    // Before the first card: be on the Charts workspace with a chart drawn.
    // No data at all means the built-in example is opened (the same thing
    // the empty state offers), so a brand-new user can take the tour from
    // a bare app. Data but no drawn chart is the one case the tour refuses:
    // the landmarks it points at do not exist yet, and pointing at nothing
    // would be the misleading tour this player exists to avoid.
    prepare: function (go, fail) {
      var s = S();
      if (s.workspace && s.setWorkspace && s.workspace() !== "chart") s.setWorkspace("chart");
      var state = s.chartHelpState ? s.chartHelpState() : "ready";
      var settle = function (note) {
        if (s.coachDismiss) s.coachDismiss();   // the first card says what the coach says
        window.setTimeout(function () { go(note); }, 40);
      };
      if (state === "ready") { settle(); return; }
      var hasData = s.tableHasData ? s.tableHasData() : true;
      if (!hasData && s.openExample) {
        s.openExample("dose");
        waitUntil(function () { return s.chartHelpState() === "ready"; }, 5000, function (ok) {
          if (ok) settle("The Dose response example is open so there is a chart to point at.");
          else fail("The example chart did not draw. Try the tour again in a moment.");
        });
        return;
      }
      fail(state === "none" ? "Create a chart first, then take the tour."
                            : "Assign variables so this chart draws, then take the tour.");
    },
    // The stops follow the Sep 19 2026 write-up in the Craft item, in its
    // order: the setup rail, the chart, the toolbar left to right, the
    // checks in the status line, Export, and the Help menu to close.
    steps: [
      { target: "#ps-slots", optional: true,
        title: "Chart setup",
        body: "Pick an Analysis, then drop a variable on each role. The roles are named by what they do: Category axis, Value axis. The chart redraws as you fill them." },
      { target: ['#psroot svg[data-role="gb2-chart-svg"]', "#psroot svg"],
        title: "One rule runs this room",
        body: "To change a thing, click the thing. A bar, a label, an axis, the legend: each opens its own small editor with only its settings." },
      { target: ['[data-role="graphtype-trigger"]', '[data-role="palette-trigger"]'],
        title: "Type and theme",
        body: "The toolbar's left end says what kind of chart this is. Click it to switch types without losing your styling. Theme holds the palettes and any looks you have saved." },
      { target: 'button[aria-label="Statistics"]',
        title: "The numbers",
        body: "Stats opens the statistics panel: the numbers behind the chart, comparisons between groups with brackets you can place, and Keep, which sends a result to the Notebook." },
      { target: ['button[aria-label$="hide elements"]', 'button[aria-label="Chart settings"]', '[data-role="setting-search-trigger"]'],
        title: "Hide, settings, find",
        body: "The eye hides parts of the chart and brings them back. Settings holds the whole-chart options. Find searches every setting by name when you cannot remember where one lives." },
      { target: 'button[aria-label="Add to chart"]',
        title: "Add to the chart",
        body: "Add puts things on the chart: error bars, data points, reference lines, brackets. Each opens its own panel once it is there." },
      { target: "#ps-status-check", optional: true,
        title: "Check my chart",
        body: "The status line at the bottom: every chart is checked for things that mislead, like a cut axis or colors that merge. Click it to read the list." },
      { target: "#ps-export", optional: true,
        title: "Export",
        body: "Export gives PDF, PNG and SVG at the chart's real size. Fit window on the toolbar only changes how big it looks here; the grip at the chart's corner sets the size that exports." },
      { target: '[data-ps-menu="help"]', optional: true,
        title: "Which graph?",
        body: "Not sure which chart fits your data? Which graph should I use? lives in the Help menu, with Check my chart, the glossary, and these tours." }
    ]
  };

  window.PS_TOURS = {
    start: start,
    exit: function () { exit(false); },
    next: next,
    back: back,
    active: function () { return live ? { id: live.id, step: live.i, of: live.tour.steps.length } : null; },
    seen: function (id) { return !!readSeen()[id]; },
    forget: function () { try { window.localStorage.removeItem(SEEN_KEY); } catch (e) {} },
    list: function () { return Object.keys(TOURS); },
    define: function (id, tour) { TOURS[id] = tour; }
  };
})();
