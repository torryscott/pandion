/* The homepage's "Beyond the chart" cards: a plain click opens that
 * workspace's two-minute tour in a window over the page, and the tour's
 * script loads on the first open. Each link still points at the
 * workspace's Learn page, so a new-tab click, or a browser without
 * <dialog>, lands on the same tour there. Closing the window pauses the
 * tour (it stops when out of view) and returns focus to the link. */
(function () {
  var SRC = {
    data: 'assets/data-workspace/pandion-data-workspace.min.js',
    notebook: 'assets/notebook/pandion-notebook.min.js',
    layouts: 'assets/layouts-workspace/pandion-layouts.min.js'
  };
  var loaded = {};

  function wire(d) {
    var downOnBackdrop = false;
    d.querySelector('.td-close').addEventListener('click', function () { d.close(); });
    /* the backdrop closes the window, but only for a press that began
     * there: a drag in the tour that ends outside the window must not */
    d.addEventListener('pointerdown', function (e) { downOnBackdrop = e.target === d; });
    d.addEventListener('click', function (e) {
      if (e.target === d && downOnBackdrop) d.close();
      downOnBackdrop = false;
    });
    d.addEventListener('close', function () {
      var a = d.gbOpener;
      d.gbOpener = null;
      if (!a || !document.contains(a)) return;
      try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); }
    });
  }

  function init() {
    var links = document.querySelectorAll('a[data-tour]');
    for (var i = 0; i < links.length; i++) {
      var d = document.getElementById('tour-' + links[i].getAttribute('data-tour'));
      if (d && typeof d.showModal === 'function') links[i].setAttribute('aria-haspopup', 'dialog');
    }
    var ds = document.querySelectorAll('dialog.tour-dialog');
    for (var j = 0; j < ds.length; j++) wire(ds[j]);
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-tour]') : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var k = a.getAttribute('data-tour'), d = document.getElementById('tour-' + k);
    if (!d || typeof d.showModal !== 'function' || d.open) return;
    e.preventDefault();
    d.gbOpener = a;
    d.showModal();
    if (!loaded[k] && SRC[k]) {
      loaded[k] = true;
      var s = document.createElement('script');
      s.src = SRC[k];
      document.body.appendChild(s);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
