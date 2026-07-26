#!/usr/bin/env python3
"""Bundle the whole website into ONE double-clickable preview file.

    python3 website/build-preview.py

Writes website/pandion-site-preview.html - every page, every design
variant, and every asset inlined as a data URI, so it can be opened from
disk (or emailed) with no web server and no repo around it. The five
pages keep conflicting CSS (.brand, .hero) so each is rendered in its own
iframe via a Blob URL rather than concatenated into one document.

This is a REVIEW artifact, not the deployable site: the "Try it" links
are inert here (the app is a separate 3.4 MB file). Deploy website/.
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
MIME = {'.svg': 'image/svg+xml', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}

PAGES = [
    ('index',   'index.html',   'Home'),
    ('gallery', 'gallery.html', 'Gallery'),
    ('about',   'about.html',   'About'),
    ('v2',      'v2.html',      'Landing: dark'),
    ('v3',      'v3.html',      'Landing: editorial'),
]

_asset_cache = {}


def data_uri(rel):
    """assets/foo.png -> data:image/png;base64,..."""
    if rel in _asset_cache:
        return _asset_cache[rel]
    p = ROOT / rel
    if not p.exists():
        raise SystemExit('missing asset: %s' % rel)
    mime = MIME.get(p.suffix.lower())
    if not mime:
        raise SystemExit('unknown asset type: %s' % rel)
    uri = 'data:%s;base64,%s' % (
        mime, base64.b64encode(p.read_bytes()).decode('ascii'))
    _asset_cache[rel] = uri
    return uri


# Runs INSIDE each previewed page: routes in-page navigation up to the
# shell and explains the deliberately inert app links.
INJECT = """
<script>
(function () {
  function note(msg) {
    var d = document.getElementById('ps-preview-note');
    if (!d) {
      d = document.createElement('div');
      d.id = 'ps-preview-note';
      d.style.cssText = 'position:fixed;left:50%;bottom:22px;' +
        'transform:translateX(-50%);z-index:99999;max-width:min(92vw,560px);' +
        'padding:12px 18px;border-radius:9px;background:#22364d;color:#fff;' +
        'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
        'box-shadow:0 10px 30px rgba(0,0,0,0.3);text-align:center';
      document.body.appendChild(d);
    }
    d.textContent = msg;
    d.style.display = 'block';
    clearTimeout(window.__psNoteT);
    window.__psNoteT = setTimeout(function () { d.style.display = 'none'; }, 4200);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    if (a.hasAttribute('data-goto')) {
      e.preventDefault();
      parent.postMessage({ ps: 'goto', page: a.getAttribute('data-goto'),
        hash: a.getAttribute('data-hash') || '' }, '*');
      return;
    }
    if (a.hasAttribute('data-app')) {
      e.preventDefault();
      note('The app is not bundled into this preview. On the real site ' +
           'this opens Pandion Plots; to try it now, open ' +
           'standalone/dist/pandion-plots.html.');
    }
  }, true);
  window.addEventListener('message', function (e) {
    if (e.data && e.data.ps === 'hash' && e.data.hash) {
      var t = document.getElementById(e.data.hash);
      if (t) t.scrollIntoView();
    }
  });
})();
</script>
"""


def prepare(html):
    """Inline assets, reroute internal links, keep external links usable."""
    # assets -> data URIs (src= and href=, e.g. the favicon link)
    def sub_asset(m):
        return '%s="%s"' % (m.group(1), data_uri(m.group(2)))
    html, n_assets = re.subn(r'(src|href)="(assets/[^"]+)"', sub_asset, html)

    # internal page links -> shell navigation
    html = html.replace('href="index.html#downloads"',
                        'href="#" data-goto="index" data-hash="downloads"')
    for key, fname, _ in PAGES:
        html = html.replace('href="%s"' % fname, 'href="#" data-goto="%s"' % key)
    # the app is a separate 3.4 MB build; inert here, explained on click
    html = html.replace('href="app/"', 'href="#" data-app="1"')
    # external links must escape the iframe
    html = re.sub(r'<a ([^>]*href="https?://[^"]+")', r'<a target="_blank" \1', html)

    html = html.replace('</body>', INJECT + '</body>')
    return html, n_assets


docs = {}
for key, fname, _label in PAGES:
    src = (ROOT / fname).read_text(encoding='utf-8')
    out, n = prepare(src)
    docs[key] = base64.b64encode(out.encode('utf-8')).decode('ascii')
    print('%-9s %2d assets inlined, %d KB' % (fname, n, len(out) // 1024))

tabs = '\n'.join(
    '      <button type="button" data-page="%s"%s>%s</button>'
    % (k, ' class="sep"' if k == 'v2' else '', label)
    for k, _f, label in PAGES)

shell = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pandion Plots - website preview</title>
<link rel="icon" type="image/svg+xml" href="__FAVICON__">
<style>
  html, body { margin: 0; height: 100%%; }
  body {
    display: flex; flex-direction: column; background: #22364d;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
  }
  .bar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 9px 14px; background: #192E49; color: #cfdae8;
  }
  .bar strong {
    display: flex; align-items: center; gap: 8px;
    color: #fff; font-size: 14px; margin-right: 6px;
  }
  .bar strong img { width: 22px; height: 22px; }
  .bar button {
    -webkit-appearance: none; appearance: none; font: inherit;
    font-weight: 600; font-size: 13px; color: #cfdae8; cursor: pointer;
    background: transparent; border: 1px solid rgba(255,255,255,0.22);
    border-radius: 7px; padding: 6px 13px;
  }
  .bar button:hover { color: #fff; border-color: rgba(255,255,255,0.5); }
  .bar button[aria-pressed="true"] {
    color: #192E49; background: #E3A12E; border-color: #E3A12E;
  }
  .bar button.sep { margin-left: 14px; }
  .bar .hint { margin-left: auto; color: #8ea3bd; font-size: 12px; }
  iframe { flex: 1; width: 100%%; border: 0; background: #fff; }
</style>
</head>
<body>
  <div class="bar">
    <strong><img src="__FAVICON__" alt="">Website preview</strong>
%s
    <span class="hint">Gallery and About are styled to match the current
      design. Try-it links are inert in this preview.</span>
  </div>
  <iframe id="stage" title="Website preview"></iframe>
<script>
var DOCS = __DOCS__;
var stage = document.getElementById('stage');
var urls = {}, current = null;
function urlFor(page) {
  if (!urls[page]) {
    var html = decodeURIComponent(escape(atob(DOCS[page])));
    urls[page] = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  }
  return urls[page];
}
function show(page, hash) {
  if (!DOCS[page]) return;
  var btns = document.querySelectorAll('.bar button');
  for (var i = 0; i < btns.length; i++)
    btns[i].setAttribute('aria-pressed',
      btns[i].getAttribute('data-page') === page ? 'true' : 'false');
  if (page !== current) { current = page; stage.src = urlFor(page); }
  if (hash) {
    stage.addEventListener('load', function once() {
      stage.removeEventListener('load', once);
      stage.contentWindow.postMessage({ ps: 'hash', hash: hash }, '*');
    });
  }
}
document.querySelector('.bar').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-page]');
  if (b) show(b.getAttribute('data-page'), '');
});
window.addEventListener('message', function (e) {
  if (e.data && e.data.ps === 'goto') show(e.data.page, e.data.hash);
});
show('index', '');
</script>
</body>
</html>
""" % tabs

shell = shell.replace('__FAVICON__', data_uri('assets/favicon.svg'))
shell = shell.replace('__DOCS__', '{%s}' % ','.join(
    '"%s":"%s"' % (k, v) for k, v in docs.items()))

out = ROOT / 'pandion-site-preview.html'
out.write_text(shell, encoding='utf-8')
print('\nwrote %s - %.1f MB' % (out, out.stat().st_size / 1048576))
