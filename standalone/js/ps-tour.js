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
  // (the reading timer is gone: cards hold until the reader advances)

  function reduceMotion() {
    try {
      if (document.body.classList.contains("ps-reduce-motion")) return true;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (ignore) { return false; }
  }

  /* ------------------------------------------------------------ overlay */
  var root, cursor, ring, caption, capText, capStep, capBar;
  var btnBack, btnNext, btnExit;

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
      pointerEvents: "none",
      // The page sets no global border-box, so without this the 3px
      // border draws OUTSIDE the width showRing computes: the ring's
      // footprint grew 6px past the math, all of it on the bottom and
      // right (Torry's screenshots, Aug 2026 - every highlight sat with
      // its target in the upper left and the slack lower right).
      boxSizing: "border-box"
    });
    ring.setAttribute("data-role", "ps-tour-ring");

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

    // A side card, not a bottom banner (Torry, Aug 2026): the bottom is
    // where the panels the tour explains OPEN, so a bottom caption sat on
    // top of the very thing it was teaching.
    caption = mk("div", {
      position: "fixed", right: "22px", top: "50%",
      transform: "translateY(-50%)",
      width: "330px", maxWidth: "88vw",
      background: "rgba(18,26,38,0.96)", color: "#fff", borderRadius: "12px",
      padding: "13px 16px", boxShadow: "0 10px 34px rgba(0,0,0,.34)",
      pointerEvents: "auto", opacity: "0",
      transition: "opacity 260ms ease",
      fontSize: "14px", lineHeight: "1.5"
    });
    caption.setAttribute("role", "status");
    caption.setAttribute("aria-live", "polite");

    var head = mk("div", { display: "flex", alignItems: "center", gap: "8px" }, caption);
    capStep = mk("div", {
      flex: "0 0 auto", fontSize: "11px", fontWeight: "700", letterSpacing: ".07em",
      textTransform: "uppercase", color: "#8fc0f4"
    }, head);
    capStep.setAttribute("data-role", "ps-tour-step");

    var acts = mk("div", {
      flex: "0 0 auto", display: "flex", gap: "6px", marginLeft: "auto"
    }, head);
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
    // Back rewinds and RE-EXECUTES (see play), Next skips ahead, Exit
    // leaves at once. Arrow keys mirror the two nav buttons.
    btnBack = actionBtn("\u2039 Back", "Replay from the previous step");
    btnNext = actionBtn("Next \u203a", "Skip ahead to the next step");
    btnExit = actionBtn("Exit", "Stop the walkthrough");
    btnBack.onclick = function () { state.nav = -1; };
    btnNext.onclick = function () { state.nav = 1; };
    btnExit.onclick = exit;

    capText = mk("div", { marginTop: "8px" }, caption);
    capText.setAttribute("data-role", "ps-tour-text");

    capBar = mk("div", {
      height: "3px", background: "#8fc0f4", borderRadius: "2px",
      marginTop: "10px", width: "0%", opacity: ".75",
      transition: "width 300ms linear"
    }, caption);

    // Pressing Back/Next/Exit is META-input, not an interaction with the
    // page - but the engine's transient menus dismiss on any TRUSTED
    // pointerdown outside themselves, so the reader's own Next press
    // closed the "+" menu the previous card had just opened (Torry's
    // screenshot, Aug 2026). And blocking ONLY pointerdown is worse than
    // blocking nothing: the app then sees ups without downs and clicks
    // against stale press state. So the WHOLE press family is hidden at
    // WINDOW capture (fires before every document-level listener,
    // whatever their registration order); the buttons themselves need
    // only the CLICK, which is allowed through to the button and then
    // stopped from bubbling onward at the card boundary below. Scoped to
    // the card's buttons so dragging the card still propagates.
    ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(function (t) {
      window.addEventListener(t, function (e) {
        if (state.running && caption && caption.contains(e.target)
            && e.target.closest && e.target.closest("button"))
          e.stopPropagation();
      }, true);
    });
    caption.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("button")) e.stopPropagation();
    });

    // A running demonstration is not corruptible by an idle click
    // (Torry, Aug 2026: "I can still click and kind of disrupt what's
    // going on"): trusted pointer input OUTSIDE the tour layer is
    // swallowed while a tour runs. The card's buttons and drag live
    // inside the layer; wheel scrolling and the keyboard are untouched
    // (Escape and the arrows keep working); the tour's own synthetic
    // dispatches are untrusted and pass. Exit is always one click away.
    ["pointerdown", "pointerup", "mousedown", "mouseup",
     "click", "dblclick", "contextmenu"].forEach(function (t) {
      window.addEventListener(t, function (e) {
        if (!state.running || !e.isTrusted) return;
        if (root && root.contains(e.target)) return;
        e.stopPropagation();
        e.preventDefault();
      }, true);
    });

    // Grab the card anywhere but its buttons and move it out of the way
    // (Torry, Aug 2026). The position sticks for the rest of the session.
    caption.style.cursor = "grab";
    caption.style.userSelect = "none";
    caption.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      var r = caption.getBoundingClientRect();
      caption.style.left = r.left + "px";
      caption.style.top = r.top + "px";
      caption.style.right = "auto";
      caption.style.transform = "none";
      var sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top;
      caption.style.cursor = "grabbing";
      try { caption.setPointerCapture(e.pointerId); } catch (ignore) {}
      function mv(ev) {
        var nx = Math.max(4, Math.min(window.innerWidth - r.width - 4,
                                      ox + ev.clientX - sx));
        var ny = Math.max(4, Math.min(window.innerHeight - 48,
                                      oy + ev.clientY - sy));
        caption.style.left = nx + "px";
        caption.style.top = ny + "px";
      }
      function up(ev) {
        caption.style.cursor = "grab";
        caption.removeEventListener("pointermove", mv);
        caption.removeEventListener("pointerup", up);
        try { caption.releasePointerCapture(ev.pointerId); } catch (ignore) {}
      }
      caption.addEventListener("pointermove", mv);
      caption.addEventListener("pointerup", up);
    });
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
  // WHERE to aim a click on an element. The centre is usually right,
  // but on a long thin element the exact centre can coincide with a
  // SMALLER hit zone that wins the point: Torry's 0-to-800 axis put the
  // 400 tick's hit strip exactly at the line's midpoint, the click
  // opened the Ticks panel, and the Range card found nothing - the tour
  // worked or failed depending on the tick count. Sample a few points
  // along the major axis and prefer the one whose hit-surface belongs
  // to the WHOLE element (the axis strip spans the full line; a tick
  // zone covers a sliver). Centre is tried first, so ties keep it.
  function pickAim(node) {
    var nr = node.getBoundingClientRect();
    // An SVG axis line is ZERO pixels wide - the very element this scan
    // exists for. Clamp like rectOf does instead of bailing (the first
    // shape bailed here, fell back to dead centre, and the whole scan
    // never ran).
    var nw = Math.max(nr.width, 2), nh = Math.max(nr.height, 2);
    var tall = nh >= nw;
    var nodeArea = Math.max(1, nw * nh);
    // The engine routes an axis click by TICK PROXIMITY (clicked-part
    // tab routing): landing near a tick opens the Ticks section, not the
    // Line section the tour teaches. Ticks carry stable roles, so gather
    // their centres and steer the aim between them.
    var tickCs = [];
    try {
      var role = node.getAttribute && node.getAttribute("data-role");
      var tickRole = role === "y-axis-line" ? "y-tick"
                   : role === "x-axis-line" ? "x-tick" : null;
      if (tickRole) {
        var ticks = document.querySelectorAll('[data-role="' + tickRole + '"]');
        for (var t = 0; t < ticks.length; t++) {
          var tb = ticks[t].getBoundingClientRect();
          tickCs.push(tall ? tb.top + tb.height / 2 : tb.left + tb.width / 2);
        }
      }
    } catch (ignore) {}
    function nearTick(v) {
      for (var t2 = 0; t2 < tickCs.length; t2++)
        if (Math.abs(v - tickCs[t2]) < 14) return true;
      return false;
    }
    var best = null;
    // A FINE scan, not a handful of pretty fractions: the first attempt
    // used 0.5/0.38/0.62/0.26/0.74 - and on an 800-unit axis with ticks
    // every 100, ticks sit at EIGHTHS, so every one of those samples
    // landed within a few pixels of a tick zone. Steps of ~3-6% are
    // finer than any plausible tick pitch; the early exit below stops
    // at the first point whose hit-surface spans the element.
    var fr = [0.5, 0.47, 0.53, 0.43, 0.57, 0.39, 0.61, 0.34, 0.66,
              0.29, 0.71, 0.23, 0.77, 0.18, 0.82];
    for (var i = 0; i < fr.length; i++) {
      var x = tall ? nr.left + nr.width / 2 : nr.left + nw * fr[i];
      var y = tall ? nr.top + nh * fr[i] : nr.top + nr.height / 2;
      if (nearTick(tall ? y : x)) continue;
      var win = null;
      var stack = document.elementsFromPoint(x, y);
      for (var s = 0; s < stack.length; s++) {
        if (root && root.contains(stack[s])) continue;
        win = stack[s];
        break;
      }
      var score = 0;
      if (win) {
        if (win === node || node.contains(win)) score = 1;
        else {
          var wr = win.getBoundingClientRect();
          var ox = Math.max(0, Math.min(nr.left + nw, wr.right) - Math.max(nr.left, wr.left));
          var oy = Math.max(0, Math.min(nr.top + nh, wr.bottom) - Math.max(nr.top, wr.top));
          score = Math.min(1, (ox * oy) / nodeArea);
          // "Spans the element" must not reward "is vastly bigger than
          // the element": the chart svg geometrically contains every
          // mark inside it, so it scored a perfect 1 for ANY buried
          // target. A real hit strip is at most a few times the
          // element's size; beyond that the winner is just scenery.
          var winArea = Math.max(1, wr.width * wr.height);
          if (winArea > nodeArea * 8) score *= (nodeArea * 8) / winArea;
        }
      }
      if (!best || score > best.score + 1e-9) best = { x: x, y: y, score: score };
      // A hit-surface covering half the element is the whole-element
      // strip, not a sliver: good enough, stop scanning.
      if (best.score >= 0.5) break;
    }
    return best;
  }
  var lastAim = null;
  // How long a NORMAL step searches for its target before reporting
  // lost. First attempt: short - a missing target should heal in about
  // a second, not after a dead 3.5s stare (Torry's "decent delay before
  // it kicks in"). The post-heal retry gets the full budget, since a
  // rebuilt UI may honestly still be settling.
  var findBudget = 3500;

  // "Visible" via offsetParent is not enough: the engine keeps retired
  // chrome in the document (see the header), and a long session can hold
  // a STALE TWIN of a menu item whose rect sits buried under the chart.
  // The fire log that caught it read "svg:@924,221" where the menu item
  // should have been (Aug 2026). A candidate must be HIT-TESTABLE at its
  // own centre; with a single candidate the fallback keeps old behavior.
  function hitVisible(node) {
    var r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var stack = document.elementsFromPoint(r.left + r.width / 2,
                                           r.top + r.height / 2);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (root && root.contains(el)) continue;   // tour chrome overlays don't count
      return el === node || node.contains(el) || el.contains(node);
    }
    return false;
  }
  function firstVisible(selector) {
    var all = document.querySelectorAll(selector);
    var fallback = null;
    for (var i = 0; i < all.length; i++) {
      if (!visible(all[i])) continue;
      if (!fallback) fallback = all[i];
      if (hitVisible(all[i])) return all[i];
    }
    return fallback;
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
      var tFall = null;
      for (var i = 0; i < btns.length; i++) {
        if ((btns[i].getAttribute("title") || "").indexOf(spec.title) === 0 &&
            visible(btns[i])) {
          if (!tFall) tFall = btns[i];
          if (hitVisible(btns[i])) return btns[i];
        }
      }
      return tFall;
    }
    if (spec.text) {
      var re = new RegExp("^" + String(spec.text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      var all = document.querySelectorAll(spec.within || "button,[data-kind],[data-field],div,span");
      var xFall = null;
      for (var j = 0; j < all.length; j++) {
        if (all[j].children.length === 0 && re.test((all[j].textContent || "").trim()) &&
            visible(all[j])) {
          if (!xFall) xFall = all[j];
          if (hitVisible(all[j])) return all[j];
        }
      }
      return xFall;
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
    // The minimum size clamp must grow SYMMETRICALLY: growing rightward
    // only pushed the ring 1px off a zero-width axis line, which inside
    // a 12px ring left 0.5px of clearance on one side and 2.5px on the
    // other - the line visually fused with the ring's border and read
    // as "the ring sits too far right" (Torry, Aug 2026).
    var w = Math.max(r.width, 2), h = Math.max(r.height, 2);
    return {
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      left: r.left - (w - r.width) / 2,
      top: r.top - (h - r.height) / 2,
      w: w, h: h   // ring size only
    };
  }

  // What the chrome is ANCHORED to, so a scroll can re-pin it: the ring
  // and cursor are position:fixed with coordinates stamped at point
  // time, and the chart scrolled out from under them (Torry, Aug 2026).
  var ringNode = null;
  var cursorAnchor = null;

  function showRingRect(r, fast) {
    ring.style.transitionDuration = fast ? "120ms" : "";
    css(ring, {
      left: (r.left - 5) + "px", top: (r.top - 5) + "px",
      width: (r.w + 10) + "px", height: (r.h + 10) + "px", opacity: "1"
    });
  }
  function showRing(node, fast) {
    if (!node) { ring.style.opacity = "0"; ringNode = null; return; }
    ringNode = node;
    var r = rectOf(node);
    // Tell the watcher this rect is the KNOWN target, or its first frame
    // would read the mid-glide ring as drift and snap it to the end.
    lastRingKey = (r.left | 0) + "," + (r.top | 0) + ","
                + (r.w | 0) + "," + (r.h | 0);
    showRingRect(r, fast);
  }
  function hideRing() {
    if (ring) ring.style.opacity = "0";
    ringNode = null;
    cursorAnchor = null;
  }

  // Keep the fixed-position chrome pinned to its anchors: a per-frame
  // geometry watcher, not event listeners - scroll and resize events
  // miss layout REFLOW (a panel opening below reshapes the chart with
  // neither firing; Torry's screenshot, Aug 2026), and only a watcher
  // notices the anchor VANISHING, in which case the ring hides instead
  // of highlighting a place that no longer exists. One rect read per
  // frame per anchor; writes only when something moved.
  var watchRaf = 0;
  var lastRingKey = "";
  function anchorVisible(n) {
    return n && n.isConnected && (n.offsetParent !== null || n.ownerSVGElement);
  }
  function watchFrame() {
    watchRaf = state.running ? window.requestAnimationFrame(watchFrame) : 0;
    if (!state.running) return;
    if (ringNode && ring) {
      if (!anchorVisible(ringNode)) {
        if (ring.style.opacity !== "0") ring.style.opacity = "0";
      } else {
        var r = rectOf(ringNode);
        var key = (r.left | 0) + "," + (r.top | 0) + "," + (r.w | 0) + "," + (r.h | 0);
        if (key !== lastRingKey || ring.style.opacity !== "1") {
          lastRingKey = key;
          ring.style.transitionDuration = "0ms";
          showRingRect(r, false);
          window.requestAnimationFrame(function () {
            ring.style.transitionDuration = "";
          });
        }
      }
    }
    if (cursorAnchor && anchorVisible(cursorAnchor.node) && cursor
        && cursor.style.opacity === "1") {
      var ar = cursorAnchor.node.getBoundingClientRect();
      var ax = ar.left + ar.width * cursorAnchor.fx;
      var ay = ar.top + ar.height * cursorAnchor.fy;
      var want = "translate(" + (ax - 3) + "px," + (ay - 2) + "px)";
      if (cursor.__gb2Want !== want) {
        // Only re-pin when the ANCHOR moved; the cursor's own travel
        // animation sets the same transform target it is easing toward.
        if (cursor.__gb2Want !== undefined) {
          cursor.style.transitionDuration = "0ms";
          cursor.style.transform = want;
          window.requestAnimationFrame(function () {
            cursor.style.transitionDuration = "";
          });
        }
        cursor.__gb2Want = want;
      }
    }
  }
  function armScrollSync() {
    if (!watchRaf) watchRaf = window.requestAnimationFrame(watchFrame);
  }

  async function moveTo(x, y, fast) {
    cursor.style.opacity = "1";
    cursor.style.transitionDuration = reduceMotion() ? "" : (fast ? "130ms" : "");
    cursor.style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
    await (reduceMotion() ? sleep(90) : (fast ? sleep(140) : navSleep(MOVE_MS)));
  }

  function ripple(x, y) {
    if (reduceMotion()) return;
    var d = mk("div", {
      position: "fixed", left: (x - 13) + "px", top: (y - 13) + "px",
      width: "26px", height: "26px", borderRadius: "50%",
      boxSizing: "border-box",
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

  async function pointAt(spec, fast) {
    // Exit means NOW: a step in flight when the user leaves must not
    // repaint the ring or move the cursor on its way out.
    if (state.abort) return null;
    var node = await waitFor(function () { return resolve(spec); },
                             fast ? 3500 : findBudget);
    if (state.abort) return null;
    if (!node) return null;   // the play loop decides what a miss MEANS
    try { node.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (ignore) {}
    await sleep(fast ? 20 : 60);
    var r = rectOf(node);
    var aim = pickAim(node) || { x: r.cx, y: r.cy };
    lastAim = aim;
    var nr = node.getBoundingClientRect();
    cursorAnchor = {
      node: node,
      fx: nr.width > 0 ? (aim.x - nr.left) / nr.width : 0.5,
      fy: nr.height > 0 ? (aim.y - nr.top) / nr.height : 0.5
    };
    // New anchor: let the travel animation own the first leg (the
    // watcher's first frame must not read the glide as drift).
    if (cursor) cursor.__gb2Want = undefined;
    showRing(node, fast);
    await moveTo(aim.x, aim.y, fast);
    return node;
  }

  async function clickAt(spec, fast) {
    var node = await pointAt(spec, fast);
    if (!node) return null;
    await (reduceMotion() ? sleep(120) : (fast ? sleep(90) : navSleep(BEAT_MS)));
    // Re-verify at FIRE time: the app can re-render between the point and
    // the click (the standalone's delayed echo rebuilt the widget DOM and
    // hid the open menu mid-card - the fire-log read "svg:" where the
    // menu item had been). VISIBILITY is the discriminator: a vanished
    // target reports lost so the heal can act. Deliberately NOT a
    // hit-test - an axis line is covered by its HTML hit strip BY
    // DESIGN, and the stack-retarget below exists exactly for that.
    if (!visible(node)) {
      var re = resolve(spec);
      if (re && visible(re)) {
        node = re;
        showRing(node, fast);
      } else {
        return null;
      }
    }
    var r = rectOf(node);
    // Fire where the cursor went: the aim point pointAt chose, refreshed
    // if the fire-time re-aim above swapped the node.
    var aim = lastAim || { x: r.cx, y: r.cy };
    ripple(aim.x, aim.y);
    // The tour's own chrome must NEVER receive a demonstrated click: the
    // card is draggable and can sit over the very menu the tour is about
    // to use (found via the probe's dragged-card case, Aug 2026 - the
    // card swallowed the menu-item click and the step silently failed).
    var top = null;
    var stack = document.elementsFromPoint(aim.x, aim.y);
    for (var si = 0; si < stack.length; si++) {
      if (root && root.contains(stack[si])) continue;
      top = stack[si];
      break;
    }
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
    // Debug trail: WHAT the tour actually fired at, kept short. A click
    // that resolves to the wrong element is invisible in every other
    // signal (no miss, no error - just a step that silently did nothing).
    try {
      var _tgt = top || node;
      (window.__tourFireLog = window.__tourFireLog || []).push(
        (_tgt.tagName || "?") + ":" +
        ((_tgt.getAttribute && (_tgt.getAttribute("data-kind")
          || _tgt.getAttribute("data-role") || _tgt.getAttribute("title"))) || "") +
        "@" + Math.round(aim.x) + "," + Math.round(aim.y));
      if (window.__tourFireLog.length > 40) window.__tourFireLog.shift();
    } catch (_eLog) {}
    fire(top || node, aim.x, aim.y);
    await (fast ? sleep(140) : navSleep(240));
    return node;
  }

  /* ------------------------------------------------------------- cards */
  // nav: 0 = holding, 1 = the Next button / ArrowRight, -1 = Back /
  // ArrowLeft. Set by the controls, consumed once per card by play()'s
  // loop. There is NO reading timer (Torry, Aug 2026: a timed card feels
  // like "a clock on them" - students get however long they need): a
  // card shows its text, performs its action, then HOLDS until the
  // reader chooses Back, Next, or Exit.
  var state = { running: false, nav: 0, abort: false };
  var MISSES = [];
  // Generation token against ZOMBIE loops: exit() sets abort, but a new
  // play() resets it - and the OLD tour's async loop, parked in an await,
  // could resume alongside the new one, the two alternately consuming
  // nav presses (the every-other-Next-press-is-dead field bug, Aug
  // 2026). Every checkpoint compares its own generation; a stale loop
  // returns without touching shared UI.
  var playGen = 0;

  // A press is NEVER wiped, only consumed - and this is the single
  // place it is consumed. The old reset-at-card-start erased any press
  // that landed between cards (during a setup, or on a replay's stale
  // card while the tour was still warming up): the press felt dead and
  // the NEXT one worked, Torry's every-other-click field report, Aug
  // 2026. The bisect that found it: fresh play fine, drag fine, replay
  // alone lost the first press.
  function waitNav(gen) {
    return new Promise(function (resolve) {
      (function tick() {
        if (state.nav || state.abort || gen !== playGen) {
          var nav = state.nav;
          state.nav = 0;
          return resolve(nav);
        }
        window.setTimeout(tick, 40);
      })();
    });
  }

  // A WATCHABLE wait (cursor travel, the beat before a click, a settle
  // hold): falls through the moment the reader presses Back or Next, so
  // navigation is immediate - but only the WAITING is skippable, never
  // the work around it. The click still fires; the state still lands
  // (Torry, round 5: "Next truly should have just skipped to the next
  // thing, which would mean it would open up where it should be").
  function navSleep(ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        if (state.nav || state.abort || Date.now() - t0 >= ms) return resolve();
        window.setTimeout(tick, 40);
      })();
    });
  }

  // The progress bar shows POSITION in the tour, not time left on a
  // reading clock.
  function showCard(text, index, total) {
    capStep.textContent = total ? (index + " / " + total) : "";
    capText.textContent = text || "";
    caption.style.opacity = "1";
    capBar.style.transition = "width 220ms ease";
    capBar.style.width = (total ? Math.round((index / total) * 100) : 0) + "%";
  }

  // fast = a rewind replay in flight (see play): the step EXECUTES for
  // real - menus re-open, clicks re-fire - at sprint pace, so the rewind
  // reads as "redoing it". In normal mode a step shows its card and
  // performs its action; the HOLD for the reader lives in play()'s loop.
  async function runStep(step, index, total, fast) {
    if (state.abort) return;

    // Silent setup: put the chart into the state the lesson teaches FROM.
    if (step.setup) {
      try { await step.setup(); } catch (ignore) {}
      return;
    }
    if (fast) {
      // One steady line while the sprint redoes the steps - per-card
      // text flashing read as jank (Torry, Aug 2026).
      capStep.textContent = total ? (index + " / " + total) : "";
      capText.textContent = "Redoing the earlier steps...";
      caption.style.opacity = "1";
      if (step.doneMsg) { hideRing(); return; }
    } else {
      showCard(step.say, index, total);
      if (step.doneMsg) { hideRing(); return; }
    }
    if (fast) {
      if (step.point) { await pointAt(step.point, true); return; }
      if (step.click) {
        await clickAt(step.click, true);
        if (step.hold) await sleep(Math.min(step.hold, 320));
        return;
      }
      if (step.type) {
        var ff = await pointAt(step.type.into, true);
        if (ff) {
          ff.focus();
          ff.value = String(step.type.value);
          ff.dispatchEvent(new Event("input", { bubbles: true }));
          ff.dispatchEvent(new Event("change", { bubbles: true }));
          ff.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
        await sleep(Math.min(step.hold || 1100, 320));
        return;
      }
      return;
    }
    if (step.point) {
      if (!await pointAt(step.point)) return "lost";
      return;
    }
    if (step.click) {
      if (!await clickAt(step.click)) return "lost";
      // hold is SETTLE time now (watch the menu open), never reading time
      if (step.hold) await navSleep(Math.min(step.hold, 600));
      return;
    }
    if (step.type) {
      var field = await pointAt(step.type.into);
      if (!field) return "lost";
      if (field) {
        await navSleep(240);
        var fr = rectOf(field);
        ripple(fr.cx, fr.cy);
        field.focus();
        field.value = "";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        var val = String(step.type.value);
        for (var i = 0; i < val.length; i++) {
          field.value = val.slice(0, i + 1);
          field.dispatchEvent(new Event("input", { bubbles: true }));
          await (reduceMotion() ? sleep(20) : navSleep(150));
        }
        field.dispatchEvent(new Event("change", { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      await navSleep(Math.min(step.hold || 600, 600));
      return;
    }
  }

  // Arrow keys mirror the Back/Next buttons; Escape exits. Capture phase
  // so the app underneath never sees them while a walkthrough is playing.
  function tourKeys(e) {
    if (!state.running) return;
    if (e.key === "ArrowLeft") {
      state.nav = -1; e.preventDefault(); e.stopPropagation();
    } else if (e.key === "ArrowRight") {
      state.nav = 1; e.preventDefault(); e.stopPropagation();
    } else if (e.key === "Escape") {
      exit(); e.preventDefault(); e.stopPropagation();
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
    // Running is TRUE from the first instant - a caller asking during
    // the warm-up below must hear the truth, or it reads the tour as
    // already over (the spam-probe race, Aug 2026).
    state.running = true;
    armScrollSync();
    // Drain any zombie loop from an exited tour BEFORE resetting abort:
    // give its 40ms checkpoints a moment to observe the abort and die.
    playGen++;
    state.abort = true;
    await sleep(90);
    MISSES = [];
    // nav deliberately NOT reset: the consume-only rule is absolute. A
    // press landing during this warm-up (the drain, the setup) belongs
    // to the reader and is honored at the first card's hold.
    state.abort = false;
    var gen = ++playGen;
    if (capStep) capStep.textContent = "";
    if (capText) capText.textContent = "";

    try {
      if (window.PS_SHELL && window.PS_SHELL.workspace() !== "chart")
        window.PS_SHELL.setWorkspace("chart");
    } catch (ignore) {}
    window.addEventListener("keydown", tourKeys, true);
    await sleep(140);

    // Scrub semantics: every step EXECUTES exactly once, the first time
    // the tour reaches it (maxDone tracks that frontier). Back rewinds
    // the pointer; any step at or behind the frontier replays in review
    // mode (narration + pointing, no actions), so stepping back and
    // forward can never mutate the chart twice. With the controls
    // untouched this walks the steps linearly, exactly as before.
    // The closing message rides the loop as a real step so Back works
    // from it too (it used to play outside the loop, where a Back press
    // broke its wait and ended the tour - Torry's report, Aug 2026).
    // It COUNTS like a card, because it IS one: it holds, Back works
    // from it - a tour with four teaching cards and a closing card says
    // 5 / 5 on the last, not a second 4 / 4 (Torry, Aug 2026: "I would
    // expect the number to be the actual number of cards").
    var seq = tour.steps.slice();
    if (tour.done) seq.push({ say: tour.done, doneMsg: true });
    var shownSteps = 0, shownIndex = [];
    for (var s = 0; s < seq.length; s++)
      shownIndex[s] = seq[s].setup ? 0 : ++shownSteps;

    // Back rewinds and RE-EXECUTES from the top, fast, up to the target
    // step, then resumes at normal pace. Tours normalize their own
    // starting state (the setup steps), so replaying is safe by
    // construction - and real re-execution is the only way the menus and
    // panels a later step depends on are genuinely there again. Nav
    // presses during the fast sprint are ignored (it lasts a moment).
    var i = 0, fastUntil = -1, retried = {};
    while (i < seq.length) {
      if (state.abort || gen !== playGen) break;
      var fast = i < fastUntil;
      if (seq[i].setup) {
        await runStep(seq[i], 0, 0, fast);
        i++;
        continue;
      }
      // A card being RETRIED after a heal acts at sprint speed: the echo
      // that killed its target strikes the same ~1.2s animation window
      // every time, so the retry wins by being briefer than the churn.
      // It still HOLDS for reading afterward (quickAct, not sprint).
      var quickAct = fast || !!retried[i];
      findBudget = retried[i] ? 3500 : 1300;
      var lost = await runStep(seq[i], shownIndex[i], shownSteps, quickAct);
      if (state.abort || gen !== playGen) break;
      if (!fast && lost === "lost" && !state.nav) {
        if (!retried[i]) {
          // The target is gone (a menu closed, a panel moved on). Rebuild
          // reality the same way Back does - rewind and RE-EXECUTE from
          // the top, fast - then retry this card live. Once per visit.
          retried[i] = 1;
          fastUntil = i;
          i = 0;
          continue;
        }
        // Even a full rebuild could not produce the target: say so
        // honestly and hold. NEVER narrate success that did not happen.
        MISSES.push(JSON.stringify(seq[i].point || seq[i].click ||
                                   (seq[i].type && seq[i].type.into) || ""));
        capText.textContent = "This step could not find what it needed on " +
          "your chart. Back replays the walkthrough from the start. " +
          "Next skips past this step.";
      } else if (!fast && lost !== "lost") {
        retried[i] = 0;
      }
      // The card holds here, indefinitely, until Back / Next / Exit. A
      // press DURING the action pre-arms the choice; the action itself
      // always completes first.
      var nav = 0;
      if (!fast) nav = await waitNav(gen);
      if (state.abort || gen !== playGen) break;
      if (!fast && nav < 0) {
        var p = i - 1;
        while (p >= 0 && seq[p].setup) p--;
        // Nowhere further back: the current step is the target - Back on
        // the first step means "do that again".
        fastUntil = (p >= 0) ? p : i;
        i = 0;
        continue;
      }
      i++;
    }
    // A stale generation owns NOTHING: a newer play() has the UI.
    if (gen !== playGen) return;
    window.removeEventListener("keydown", tourKeys, true);
    hideRing();
    if (cursor) cursor.style.opacity = "0";
    // The tour only ends when the reader leaves it, and the card leaves
    // WITH it - a dead card with live-looking buttons was the round-4
    // field report.
    if (caption) caption.style.opacity = "0";
    state.running = false;
    if (MISSES.length && window.console)
      console.warn("[ps-tour] steps whose target was not found:", MISSES);
  }

  function exit() {
    playGen++;
    state.abort = true;
    state.running = false;
    window.removeEventListener("keydown", tourKeys, true);
    hideRing();
    if (cursor) cursor.style.opacity = "0";
    if (caption) caption.style.opacity = "0";
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
            // BOTH pipelines, deliberately (the two-pass field bug, Aug
            // 2026): the HOST setOption alone changes the store behind
            // the engine's back, so the engine still believes the OLD
            // value and the lesson's own re-enable commit no-ops against
            // that stale belief - the store never changes and the tour
            // narrates error bars that are not there. The ENGINE call
            // aligns its belief; the HOST call paints instantly.
            try {
              if (window.__gb2_setOption) window.__gb2_setOption("errorBarType", "none");
              if (window.setOption) window.setOption("errorBarType", "none");
            } catch (ignore) {}
            await sleep(500);
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
      // The scope lesson lives on OPACITY, not Color: on a grouped chart
      // the engine hides the This/All toggle on the Color strip BY
      // DESIGN (color is series identity; one-click all-bars-one-color
      // would falsify the legend and trip the same-color check), so the
      // old step 3 pointed at a hidden button there (Torry's field
      // report, Aug 2026). The narration makes no claim about color's
      // relationship to the switch, which differs grouped vs ungrouped.
      steps: [
        { setup: async function () {
            // The bar panel remembers the tab and strip you last used.
            // The lesson teaches from Bars -> Color, so start there:
            // without this, a reader who last visited any other strip
            // gets a panel that contradicts the narration, and the color
            // swatch the tour clicks sits hidden behind a collapsed
            // strip (found when one probe case left Opacity sticky and
            // the next case's swatch click silently did nothing).
            try {
              window.__gb2_bsActiveTab = "bar";
              window.__gb2_bsActiveStripBar = "bar-color";
            } catch (ignore) {}
        } },
        { say: "Nothing in Pandion Plots is styled from a menu. You click the thing you want to change." },
        { click: { biggest: "[data-bar-cat]" }, hold: 1100,
          say: "Click a bar. Its panel opens below, on Color, because that is what people usually want." },
        // RED, not orange: #dd7e2b IS the default palette's second series
        // color, so on a grouped chart the demo recolored one series to
        // exactly the other's color - two indistinguishable series, in a
        // tour whose closing line promises an honest legend (Torry's
        // screenshot, Aug 2026). Red collides only on charts with three
        // or more series, where it is slot three.
        { click: '[data-bs-palette="#c2242c"][data-bs-palette-target="fill-chip"]', hold: 1400,
          say: "Pick a color. Only the bar you clicked changes." },
        { click: '[data-bs-btn="bar-opacity"]', hold: 900,
          say: "Other style controls ask a question first: change THIS bar, or ALL bars?" },
        { point: '[data-field="bs-bar-scope-btn"]',
          say: "The switch lives up here. Set to All bars, a change restyles every bar at once. Leave it on This bar for now." }
      ],
      done: "Opacity, patterns, borders and corners all follow the This bar / All bars switch. Color changes one series at a time on grouped charts, so the legend always stays honest. Undo puts the color back."
    },

    "check-graph": {
      title: "Check my chart for problems",
      asks: ["check my chart", "is my chart misleading", "problems", "mistakes",
             "review my graph", "colorblind safe", "is this ok"],
      steps: [
        { say: "Pandion Plots can read your chart back to you and flag the things that mislead people." },
        { click: '[data-ps-menu="help"]', hold: 800,
          say: "Open the Help menu at the top of the window." },
        { click: { text: "Check my chart" }, hold: 1800,
          say: "Choose Check my chart. It runs a rubric against this chart: truncated axes, unlabelled axes, colors that merge for colorblind readers, and more." },
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
