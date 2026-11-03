/* Site pings (Nov 2026, worker/README.md "What is counted"). Three empty
 * POSTs that carry no body, no cookie and no identifier, so the usage page
 * can say where visitors go:
 *   page:<id>          once, when the page loads (gallery.html -> gallery,
 *                      the home page -> home, the guide at /docs/ -> docs);
 *   time:<id>:<band>   once, the first time the page goes into the background
 *                      or away: under 10 seconds, under a minute, under five
 *                      minutes, or five minutes or more. Four bands and no
 *                      seconds, on purpose;
 *   tour:<id>:start    the first time a Learn film's play button turns to
 *   tour:<id>:done     Pause, and the first time it turns to Replay. The
 *                      films label that one button themselves, so nothing
 *                      in the players changes.
 * Same two gates as the app's launch ping: the pandionplots.com hostname
 * and navigator.webdriver false, so a local build, a file:// copy and every
 * headless probe send nothing. Every send is a sendBeacon that nothing waits
 * for; the Worker answers 204 whatever happens. */
(() => {
  try {
    if (!/(^|\.)pandionplots\.com$/i.test(location.hostname)) return;
    if (navigator.webdriver || typeof navigator.sendBeacon !== "function") return;
  } catch (e) { return; }
  const send = (kind) => { try { navigator.sendBeacon("/api/hit/" + kind); } catch (e) {} };

  let id = location.pathname.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "").replace(/\/index$/, "");
  if (!id) id = "home";
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return;   // only the site's own pages
  send("page:" + id);

  const t0 = Date.now();
  let timed = false;
  const leave = () => {
    if (timed) return;
    timed = true;
    const s = (Date.now() - t0) / 1000;
    send("time:" + id + ":" + (s < 10 ? "lt10" : s < 60 ? "lt60" : s < 300 ? "lt300" : "ge300"));
  };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") leave(); });
  window.addEventListener("pagehide", leave);

  /* The Learn films. Each mounts into a frame carrying data-pandion-<film>
   * and keeps one play button whose aria-label it sets to Play, Pause or
   * Replay as it goes (also inside the home page's tour windows, where the
   * film mounts only after the window opens, so the frames are watched
   * from the start and the button can arrive later). */
  const FILMS = { "three-rules": "three-rules", "data-workspace": "data", "charts": "charts",
                  "notebook": "notebook", "layouts": "layouts" };
  const watch = (frame, film) => {
    const sent = {};
    const note = (label) => {
      const what = label === "Pause" ? "start" : label === "Replay" ? "done" : null;
      if (what && !sent[what]) { sent[what] = true; send("tour:" + film + ":" + what); }
    };
    const look = (node) => {
      if (!node || node.nodeType !== 1) return;
      if (node.tagName === "BUTTON") note(node.getAttribute("aria-label"));
      const btns = node.querySelectorAll ? node.querySelectorAll("button[aria-label]") : [];
      for (let i = 0; i < btns.length; i++) note(btns[i].getAttribute("aria-label"));
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") look(r.target);
        else for (const n of r.addedNodes) look(n);
      }
    }).observe(frame, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
  };
  const arm = () => {
    for (const key of Object.keys(FILMS)) {
      const frames = document.querySelectorAll("[data-pandion-" + key + "]");
      for (let i = 0; i < frames.length; i++) watch(frames[i], FILMS[key]);
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
  else arm();
})();

(() => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav-links");

  if (!toggle || !nav) {
    return;
  }

  const closeMenu = (returnFocus = false) => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    if (returnFocus) {
      toggle.focus();
    }
  };

  toggle.addEventListener("click", () => {
    const willOpen = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      closeMenu(true);
    }
  });

  const desktop = window.matchMedia("(min-width: 761px)");
  const resetAtDesktop = (event) => {
    if (event.matches) {
      closeMenu();
    }
  };

  if (desktop.addEventListener) {
    desktop.addEventListener("change", resetAtDesktop);
  } else {
    desktop.addListener(resetAtDesktop);
  }
})();
