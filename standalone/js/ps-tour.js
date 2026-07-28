/* ps-tour.js - "Show me how" walkthroughs.
 *
 * A walkthrough moves a simulated cursor over the REAL chart, narrates each
 * move, and performs the real interaction, so the real panels roll out and
 * the real chart changes. There is no video: the lesson is the software.
 *
 * Three facts about the engine shape everything below.
 *
 *  1. Synthetic clicks work, but only with real coordinates and detail:1.
 *     The engine drops synthesized clicks at (0,0) with detail===0 (a Qt
 *     WebEngine artefact it has to defend against), so a lazy
 *     el.dispatchEvent(new MouseEvent("click")) is silently swallowed.
 *
 *  2. Aim with document.elementFromPoint, not at the element itself. The
 *     engine floats invisible HTML hit strips above the SVG; an axis click
 *     has to land on the strip, not on the <line> underneath it.
 *
 *  3. Resolve targets LAZILY and prefer the first VISIBLE match. Every
 *     commit rebuilds the panel DOM, and the engine keeps retired chrome in
 *     the document (there are two [data-field="max"] inputs, and the first
 *     in document order is a hidden legacy popover).
 *
 * Tours are data. Adding one is a few lines at the bottom of this file; the
 * targets are semantic (data-role / data-kind / data-field), never
 * coordinates, so they survive layout changes.
 */
(function () {
  "use strict";

  var EASE = "cubic-bezier(.33,0,.2,1)";
  var MOVE_MS = 750;   // cursor travel
  var BEAT_MS = 450;   // pause after arriving, before the click
  var READ_MS = 55;    // reading time per character of narration

  function reduceMotion() {
    try {
      if (document.body.classList.contains("ps-reduce-motion")) return true;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (ignore) { return false; }
  }

  /* ------------------------------------------------------------ overlay */
  var root, cursor, ring, caption, capText, capStep, capBar, btnSkip, btnExit;

  function css(node, styles) {
    for (var k in styles) if (Object.prototype.hasOwnProperty.call(styles, k))
      node.style[k] = styles[k];
    return node;
  }
  function mk(tag, styles, parent) {
    var node = document.createElement(tag);
    node.className = "ignore-html";
    if (styles) css(node, styles);
    (parent || root).appendChild(node);
    return node;
  }

  function buildOverlay() {
    root = document.createElement("div");
    root.className = "ignore-html";
    root.setAttribute("data-role", "ps-tour-layer");
    css(root, {
      position: "fixed", inset: "0", zIndex: "13400",
      pointerEvents: "none", fontFamily: "inherit"
    });
    document.body.appendChild(root);

    ring = mk("div", {
      position: "fixed", left: "0", top: "0", width: "0", height: "0",
      border: "3px solid rgba(45,121,205,0.85)", borderRadius: "8px",
      boxShadow: "0 0 0 4px rgba(45,121,205,0.18)", opacity: "0",
      transition: reduceMotion() ? "opacity 120ms linear" : "all 380ms " + EASE,
      pointerEvents: "none"
    });

    cursor = mk("div", {
      position: "fixed", left: "0", top: "0", width: "26px", height: "26px",
      transform: "translate(-100px,-100px)", opacity: "0",
      transition: reduceMotion() ? "none" : "transform " + MOVE_MS + "ms " + EASE,
      pointerEvents: "none", filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))"
    });
    cursor.innerHTML =
      '<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">' +
      '<path d="M4 2 L4 20 L9 15.5 L12.5 23 L15.5 21.5 L12 14.5 L19 14.5 Z" ' +
      'fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

    caption = mk("div", {
      position: "fixed", left: "50%", bottom: "26px",
      transform: "translateX(-50%) translateY(14px)",
      minWidth: "420px", maxWidth: "min(680px, 92vw)",
      background: "rgba(18,26,38,0.96)", color: "#fff", borderRadius: "12px",
      padding: "13px 16px", boxShadow: "0 10px 34px rgba(0,0,0,.34)",
      pointerEvents: "auto", opacity: "0",
      transition: "opacity 260ms ease, transform 260ms " + EASE,
      fontSize: "14.5px", lineHeight: "1.5"
    });
    caption.setAttribute("role", "status");
    caption.setAttribute("aria-live", "polite");

    var row = mk("div", { display: "flex", alignItems: "flex-start", gap: "12px" }, caption);
    capStep = mk("div", {
      flex: "0 0 auto", fontSize: "11px", fontWeight: "700", letterSpacing: ".07em",
      textTransform: "uppercase", color: "#8fc0f4", paddingTop: "3px", minWidth: "50px"
    }, row);
    capText = mk("div", { flex: "1 1 auto" }, row);

    var acts = mk("div", { flex: "0 0 auto", display: "flex", gap: "6px" }, row);
    function actionBtn(label, title) {
      var b = mk("button", {
        background: "rgba(255,255,255,.12)", color: "#fff", border: "0",
        borderRadius: "7px", padding: "5px 10px", fontSize: "12.5px",
        cursor: "pointer", fontWeight: "600", fontFamily: "inherit"
      }, acts);
      b.type = "button";
      b.textContent = label;
      b.setAttribute("data-tip", title || label);
      return b;
    }
    btnSkip = actionBtn("Skip", "Move straight to the next step");
    btnExit = actionBtn("Exit", "Stop the walkthrough");
    btnSkip.onclick = function () { state.skip = true; };
    btnExit.onclick = exit;

    capBar = mk("div", {
      height: "3px", background: "#8fc0f4", borderRadius: "2px",
      marginTop: "10px", width: "0%", opacity: ".75",
      transition: "width 300ms linear"
    }, caption);
  }

  /* ------------------------------------------------------------ helpers */
  function sleep(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }

  function waitFor(fn, timeout) {
    var t0 = Date.now(), limit = timeout || 4000;
    return new Promise(function (resolve) {
      (function tick() {
        var v = null;
        try { v = fn(); } catch (ignore) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > limit) return resolve(null);
        window.setTimeout(tick, 60);
      })();
    });
  }

  function visible(node) {
    return (node && node.isConnected &&
            (node.offsetParent !== null || node.ownerSVGElement)) ? node : null;
  }
  function firstVisible(selector) {
    var all = document.querySelectorAll(selector);
    for (var i = 0; i < all.length; i++) if (visible(all[i])) return all[i];
    return null;
  }

  // Target specs: a CSS selector string, {role}, {title} (button tooltip),
  // {text} (exact visible label) or {biggest} (largest match, e.g. a bar).
  function resolve(spec) {
    if (!spec) return null;
    if (spec.nodeType === 1) return spec.isConnected ? spec : null;
    if (typeof spec === "string") return firstVisible(spec);
    if (spec.role) return firstVisible('[data-role="' + spec.role + '"]');
    if (spec.title) {
      var btns = document.querySelectorAll("button,[role=button]");
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].getAttribute("title") || "").indexOf(spec.title) === 0 &&
            visible(btns[i])) return btns[i];
      }
      return null;
    }
    if (spec.text) {
      var re = new RegExp("^" + String(spec.text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      var all = document.querySelectorAll(spec.within || "button,[data-kind],[data-field],div,span");
      for (var j = 0; j < all.length; j++) {
        if (all[j].children.length === 0 && re.test((all[j].textContent || "").trim()) &&
            visible(all[j])) return all[j];
      }
      return null;
    }
    if (spec.biggest) {
      var best = null, bestArea = 0;
      var cands = document.querySelectorAll(spec.biggest);
      for (var k = 0; k < cands.length; k++) {
        var r = cands[k].getBoundingClientRect(), a = r.width * r.height;
        if (a > bestArea && r.width > 2 && r.height > 2) { bestArea = a; best = cands[k]; }
      }
      return best;
    }
    return null;
  }

  // The CLICK POINT is the true geometric centre. An axis line is zero
  // pixels wide and its hit strip only a few pixels either side, so padding
  // the rect first pushes the click clean off the strip.
  function rectOf(node) {
    var r = node.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      left: r.left, top: r.top,
      w: Math.max(r.width, 2), h: Math.max(r.height, 2)   // ring size only
    };
  }

  function showRing(node) {
    if (!node) { ring.style.opacity = "0"; return; }
    var r = rectOf(node);
    css(ring, {
      left: (r.left - 5) + "px", top: (r.top - 5) + "px",
      width: (r.w + 10) + "px", height: (r.h + 10) + "px", opacity: "1"
    });
  }
  function hideRing() { if (ring) ring.style.opacity = "0"; }

  async function moveTo(x, y) {
    cursor.style.opacity = "1";
    cursor.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
    await sleep(reduceMotion() ? 90 : MOVE_MS);
  }

  function ripple(x, y) {
    if (reduceMotion()) return;
    var d = mk("div", {
      position: "fixed", left: (x - 13) + "px", top: (y - 13) + "px",
      width: "26px", height: "26px", borderRadius: "50%",
      border: "2px solid rgba(45,121,205,.9)", background: "rgba(45,121,205,.18)",
      transform: "scale(.4)", opacity: "1", pointerEvents: "none",
      transition: "transform 480ms " + EASE + ", opacity 480ms ease"
    });
    window.requestAnimationFrame(function () {
      d.style.transform = "scale(2.1)"; d.style.opacity = "0";
    });
    window.setTimeout(function () { d.remove(); }, 520);
  }

  // Real coordinates and detail:1: anything less is dropped by the engine's
  // synthesized-click guard.
  function fire(node, x, y) {
    var down = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: 0, buttons: 1, detail: 1,
      pointerId: 1, pointerType: "mouse", isPrimary: true
    };
    var up = Object.assign({}, down, { buttons: 0 });
    node.dispatchEvent(new PointerEvent("pointerover", down));
    node.dispatchEvent(new PointerEvent("pointerenter", down));
    node.dispatchEvent(new MouseEvent("mouseover", down));
    node.dispatchEvent(new PointerEvent("pointermove", down));
    node.dispatchEvent(new MouseEvent("mousemove", down));
    node.dispatchEvent(new PointerEvent("pointerdown", down));
    node.dispatchEvent(new MouseEvent("mousedown", down));
    node.dispatchEvent(new PointerEvent("pointerup", up));
    node.dispatchEvent(new MouseEvent("mouseup", up));
    node.dispatchEvent(new MouseEvent("click", up));
  }

  async function pointAt(spec) {
    var node = await waitFor(function () { return resolve(spec); }, 3500);
    if (!node) { MISSES.push(JSON.stringify(spec)); return null; }
    try { node.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (ignore) {}
    await sleep(60);
    var r = rectOf(node);
    showRing(node);
    await moveTo(r.cx, r.cy);
    return node;
  }

  async function clickAt(spec) {
    var node = await pointAt(spec);
    if (!node) return null;
    await sleep(reduceMotion() ? 120 : BEAT_MS);
    var r = rectOf(node);
    ripple(r.cx, r.cy);
    var top = document.elementFromPoint(r.cx, r.cy);
    if (top && top !== node && !top.contains(node) && !node.contains(top)) {
      // Usually correct and important: this is the engine's invisible hit
      // strip sitting over the SVG. Refuse only a full overlay, where
      // aiming there would teach the wrong thing.
      var tr = top.getBoundingClientRect();
      var covers = (tr.width * tr.height) /
                   ((window.innerWidth || 1) * (window.innerHeight || 1));
      if (covers > 0.5) top = node;
      // A CONTROL is its own hit surface, so never hand its click to whatever
      // happens to sit at those coordinates. This retarget exists for SVG
      // geometry under the engine's HTML chrome, and it was silently breaking
      // the axis-range walkthrough: the engine's axis hit strip (a small
      // absolutely-positioned div, well under the full-overlay threshold)
      // covers the Y-axis panel's Range button, so the click meant for Range
      // went to the strip, the Range fields never opened, and the walkthrough
      // then reported the LATER steps as the failure.
      else if (node.tagName && !node.ownerSVGElement &&
               /^(BUTTON|INPUT|SELECT|TEXTAREA|A|LABEL|OPTION)$/
                 .test(node.tagName) ) top = node;
    }
    fire(top || node, r.cx, r.cy);
    await sleep(240);
    return node;
  }

  /* ---------------------------------------------------------- narration */
  var state = { running: false, skip: false, abort: false };
  var MISSES = [];

  async function say(text, index, total) {
    capStep.textContent = total ? (index + " / " + total) : "";
    capText.textContent = text;
    caption.style.opacity = "1";
    caption.style.transform = "translateX(-50%) translateY(0)";
    var ms = Math.max(1400, Math.min(6200, text.length * READ_MS));
    capBar.style.transition = "none";
    capBar.style.width = "0%";
    await sleep(20);
    capBar.style.transition = "width " + ms + "ms linear";
    capBar.style.width = "100%";
    var t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (state.skip || state.abort) { state.skip = false; break; }
      await sleep(70);
    }
  }

  async function runStep(step, index, total) {
    if (state.abort) return;

    // Silent setup: put the chart into the state the lesson teaches FROM.
    if (step.setup) {
      try { await step.setup(); } catch (ignore) {}
      return;
    }
    if (step.say && !step.point && !step.click && !step.type) {
      await say(step.say, index, total);
      return;
    }
    if (step.point) {
      if (step.say) { say(step.say, index, total); await sleep(560); }
      await pointAt(step.point);
      if (step.say) await sleep(Math.max(600, step.say.length * READ_MS - 560));
      return;
    }
    if (step.click) {
      if (step.say) { say(step.say, index, total); await sleep(560); }
      await clickAt(step.click);
      if (step.hold) await sleep(step.hold);
      if (step.say) await sleep(Math.max(500, step.say.length * READ_MS - 1100));
      return;
    }
    if (step.type) {
      if (step.say) { say(step.say, index, total); await sleep(500); }
      var field = await pointAt(step.type.into);
      if (field) {
        await sleep(240);
        var fr = rectOf(field);
        ripple(fr.cx, fr.cy);
        field.focus();
        field.value = "";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        var val = String(step.type.value);
        for (var i = 0; i < val.length; i++) {
          field.value = val.slice(0, i + 1);
          field.dispatchEvent(new Event("input", { bubbles: true }));
          await sleep(reduceMotion() ? 20 : 150);
        }
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      await sleep(step.hold || 1100);
      if (step.say) await sleep(600);
      return;
    }
  }

  /* --------------------------------------------------------------- API */
  function chartContext() {
    var mod = "", gt = "";
    try { var c = window.PS_SHELL.chart(); mod = (c && c.module) || ""; } catch (ignore) {}
    try { var p = window.PS_SHELL.buildPayload(); gt = (p && p.graphType) || ""; } catch (ignore) {}
    return { module: mod, graphType: gt };
  }

  function availableTours() {
    var ctx = chartContext(), out = [];
    for (var key in TOURS) {
      if (!Object.prototype.hasOwnProperty.call(TOURS, key)) continue;
      var t = TOURS[key];
      if (t.applies && !t.applies(ctx)) continue;
      out.push({ key: key, tour: t });
    }
    return out;
  }

  async function play(which) {
    var tour = (typeof which === "string") ? TOURS[which] : which;
    if (!tour || state.running) return;
    if (!root) buildOverlay();
    MISSES = [];
    state.abort = false; state.skip = false; state.running = true;

    try {
      if (window.PS_SHELL && window.PS_SHELL.workspace() !== "chart")
        window.PS_SHELL.setWorkspace("chart");
    } catch (ignore) {}
    await sleep(320);

    var shownSteps = tour.steps.filter(function (s) { return !s.setup; }).length;
    var shown = 0;
    for (var i = 0; i < tour.steps.length; i++) {
      if (state.abort) break;
      if (!tour.steps[i].setup) shown++;
      await runStep(tour.steps[i], shown, shownSteps);
    }
    hideRing();
    if (!state.abort && tour.done) await say(tour.done, shown, shownSteps);
    if (cursor) cursor.style.opacity = "0";
    state.running = false;
    if (MISSES.length && window.console)
      console.warn("[ps-tour] steps whose target was not found:", MISSES);
  }

  function exit() {
    state.abort = true;
    state.running = false;
    hideRing();
    if (cursor) cursor.style.opacity = "0";
    if (caption) {
      caption.style.opacity = "0";
      caption.style.transform = "translateX(-50%) translateY(14px)";
    }
  }

  // Fills the "Show me how" dialog list. Scored so a typed question finds
  // the walkthrough: exact phrase beats partial word matches.
  function renderList(query) {
    var list = document.getElementById("ps-tour-list");
    if (!list) return;
    var q = String(query || "").trim().toLowerCase();
    var rows = availableTours().map(function (entry) {
      var hay = (entry.tour.title + " " + entry.tour.asks.join(" ")).toLowerCase();
      var score = 1;
      if (q) {
        if (hay.indexOf(q) !== -1) score = 3;
        else {
          var words = q.split(/\s+/).filter(Boolean);
          var hits = 0;
          for (var i = 0; i < words.length; i++)
            if (hay.indexOf(words[i]) !== -1) hits++;
          score = hits ? 1 + hits / words.length : 0;
        }
      }
      return { entry: entry, score: score };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });

    list.innerHTML = "";
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "ps-tour-empty";
      empty.textContent = q
        ? "No walkthrough for that yet. The user guide covers it in full."
        : "No walkthrough fits this chart type yet.";
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ps-tour-item";
      btn.setAttribute("data-tour", r.entry.key);
      var steps = r.entry.tour.steps.filter(function (s) { return !s.setup; }).length;
      var name = document.createElement("span");
      name.className = "ps-tour-item-name";
      name.textContent = r.entry.tour.title;
      var meta = document.createElement("span");
      meta.className = "ps-tour-item-meta";
      meta.textContent = steps + " steps on this chart";
      btn.appendChild(name);
      btn.appendChild(meta);
      list.appendChild(btn);
    });
  }

  /* ------------------------------------------------------------- tours */
  function isCompare(ctx) {
    return ctx.module === "plotbuilder" || ctx.module === "rmplotbuilder";
  }
  function hasValueAxis(ctx) {
    if (ctx.module === "corrplotbuilder" || ctx.module === "likertplotbuilder") return false;
    return ctx.graphType !== "pie" && ctx.graphType !== "donut";
  }

  var TOURS = {

    "error-bars": {
      title: "Add error bars",
      asks: ["add error bars", "show uncertainty", "standard error",
             "confidence interval", "standard deviation", "whiskers"],
      applies: function (ctx) {
        return isCompare(ctx) &&
          (ctx.graphType === "bar" || ctx.graphType === "line" || ctx.graphType === "dot");
      },
      steps: [
        { setup: async function () {
            // Teach from "no error bars", whatever the chart had before.
            try { if (window.setOption) window.setOption("errorBarType", "none"); } catch (ignore) {}
            await sleep(1600);
        } },
        { say: "This chart shows an average for each group. Right now nothing on it tells you how sure we are of those averages." },
        { click: { title: "Add to chart" },
          say: "Everything you can add to a chart lives behind the plus button." },
        { click: '[data-kind="ovl_errorbars"]', hold: 1500,
          say: "Choose Error bars." },
        { point: '[data-eb-btn="eb-type"]',
          say: "They are drawn, and the panel underneath opens on Type, because the first thing worth knowing is what the whiskers actually mean." }
      ],
      done: "Standard error is the default. Click Type to switch to a standard deviation or a 95 percent confidence interval."
    },

    "axis-range": {
      title: "Change the range of an axis",
      asks: ["change the axis range", "set the maximum", "set the minimum",
             "axis starts at zero", "rescale the axis", "axis limits", "y axis scale"],
      applies: hasValueAxis,
      steps: [
        { say: "The value axis picks its own top. Suppose you want it to stop at a round number instead." },
        { click: { role: "y-axis-line" }, hold: 900,
          say: "Click the axis itself. In Pandion Plots you edit a thing by clicking on the thing." },
        { click: '[data-ya-btn="line-range"]', hold: 700,
          say: "The panel that opens has a Range button. That is where the numbers live." },
        { point: '[data-field="max"]',
          say: "Three boxes: the minimum, the maximum, and the step between ticks." },
        { type: { into: '[data-field="max"]', value: "140" }, hold: 1600,
          say: "Type the new maximum. The chart follows as you type." }
      ],
      done: "The same three boxes work on either axis. Clear a box to hand the choice back to the chart."
    },

    "one-bar-color": {
      title: "Change the color of one bar",
      asks: ["change a color", "recolor one bar", "different colour",
             "colour one group", "change bar color"],
      applies: function (ctx) { return ctx.graphType === "bar"; },
      steps: [
        { say: "Nothing in Pandion Plots is styled from a menu. You click the thing you want to change." },
        { click: { biggest: "[data-bar-cat]" }, hold: 1100,
          say: "Click a bar. Its panel opens below, on Color, because that is what people usually want." },
        { point: '[data-field="bs-bar-scope-btn"][data-mode="group"]',
          say: "First look at the top right: this says whether you are about to change THIS bar or ALL bars." },
        { click: '[data-bs-palette="#dd7e2b"][data-bs-palette-target="fill-chip"]', hold: 1400,
          say: "Pick a color. Only the bar you clicked changes." }
      ],
      done: "Switch the scope to All bars and the same swatch would recolor the whole series. Undo puts it back."
    },

    "check-graph": {
      title: "Check my chart for problems",
      asks: ["check my chart", "is my chart misleading", "problems", "mistakes",
             "review my graph", "colorblind safe", "is this ok"],
      steps: [
        { say: "Pandion Plots can read your chart back to you and flag the things that mislead people." },
        { click: { title: "Help & shortcuts" }, hold: 800,
          say: "Open the question-mark button on the toolbar." },
        { click: '[data-helpnav="graphLint"]', hold: 1800,
          say: "Choose Check graph. It runs a rubric against this chart: truncated axes, unlabelled axes, colors that merge for colorblind readers, and more." },
        { say: "Warnings come first, then the checks it passed. Hover any of them to see what it looked for." }
      ],
      done: "This is the fastest way to catch a chart that is technically correct but reads wrong."
    }
  };

  window.PS_TOUR = {
    play: play,
    exit: exit,
    isRunning: function () { return state.running; },
    renderList: renderList,
    tours: TOURS,
    available: availableTours,
    misses: function () { return MISSES.slice(); }
  };
})();
