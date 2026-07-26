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
