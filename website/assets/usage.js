// The usage counters on the site (Sep 2026, worker/README.md).
//
// Three small jobs, each present only where its markup is:
//   1. a[data-count="<kind>"]: the download buttons send one empty ping on
//      click (POST /api/hit/<kind>), so the portable file served from this
//      site can be counted like the GitHub-served installers are.
//   2. [data-role="foot-count"]: the home page's settled footer line, filled
//      from GET /api/counts and shown only once it has a number.
//   3. [data-role="usage-table"]: the About table, filled from /api/counts
//      (launches, the portable file) and from GitHub's Releases API (every
//      installer and .jmo, summed across releases, earliest asset date as
//      "since"). Either source failing leaves dashes and shows the status
//      line; the page never waits on them.
(function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
    if (isNaN(d.getTime())) return '-';
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function fmtN(n) { return Number(n).toLocaleString('en-US'); }
  function ping(kind) {
    try { if (navigator.sendBeacon) navigator.sendBeacon('/api/hit/' + kind); } catch (e) {}
  }
  function counts() {
    return fetch('/api/counts').then(function (r) {
      if (!r.ok) throw new Error('counts ' + r.status);
      return r.json();
    });
  }

  // 1. Download buttons.
  var links = document.querySelectorAll('a[data-count]');
  Array.prototype.forEach.call(links, function (a) {
    a.addEventListener('click', function () { ping(a.getAttribute('data-count')); });
  });

  // 2. The footer line.
  var foot = document.querySelector('[data-role="foot-count"]');
  if (foot) {
    counts().then(function (c) {
      var e = c && c.launch;
      if (!e || !(Number(e.count) >= 0)) return;
      foot.querySelector('[data-role="foot-count-n"]').textContent = fmtN(e.count);
      foot.querySelector('[data-role="foot-count-since"]').textContent = fmtDate(e.since);
      foot.hidden = false;
    }).catch(function () {});
  }

  // 3. The About table.
  var table = document.querySelector('[data-role="usage-table"]');
  if (table) {
    var status = document.querySelector('[data-role="usage-status"]');
    function fail() { if (status) status.hidden = false; }
    function fill(row, since, n) {
      var tds = row.querySelectorAll('td');
      tds[2].textContent = fmtDate(since);
      tds[3].textContent = fmtN(n);
    }
    counts().then(function (c) {
      Array.prototype.forEach.call(table.querySelectorAll('tr[data-kind]'), function (row) {
        var e = c[row.getAttribute('data-kind')];
        if (e && Number(e.count) >= 0) fill(row, e.since, e.count);
      });
    }).catch(fail);

    // GitHub serves the installers and the jamovi module; the release
    // assets carry a download count each. Update feeds, differential-update
    // files and the macOS auto-update archive are not in this map, so
    // they never show. Releases before the rename (plotstudio-*.jmo) fold
    // into the jamovi 2.7 rows: same module, earlier name.
    var LABELS = {
      'Pandion-Plots-macOS.dmg': 'Desktop app for macOS (.dmg)',
      'Pandion-Plots-Windows-x64.exe': 'Desktop app for Windows (.exe)',
      'pandion-macos-arm64-jamovi28.jmo': 'jamovi module, macOS (Apple silicon), jamovi 28',
      'pandion-macos-arm64.jmo': 'jamovi module, macOS (Apple silicon), jamovi 2.7',
      'pandion-macos-x64-jamovi28.jmo': 'jamovi module, macOS (Intel), jamovi 28',
      'pandion-macos-x64.jmo': 'jamovi module, macOS (Intel), jamovi 2.7',
      'pandion-win-x64-jamovi28.jmo': 'jamovi module, Windows, jamovi 28',
      'pandion-win-x64.jmo': 'jamovi module, Windows, jamovi 2.7'
    };
    var ALIASES = {
      'plotstudio-macos-arm64.jmo': 'pandion-macos-arm64.jmo',
      'plotstudio-win-x64.jmo': 'pandion-win-x64.jmo'
    };
    fetch('https://api.github.com/repos/torryscott/pandion/releases?per_page=100', {
      headers: { 'Accept': 'application/vnd.github+json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('github ' + r.status);
      return r.json();
    }).then(function (rels) {
      var sums = {};
      (rels || []).forEach(function (rel) {
        (rel.assets || []).forEach(function (a) {
          var name = ALIASES[a.name] || a.name;
          if (!LABELS[name]) return;
          var s = sums[name] || (sums[name] = { count: 0, since: null });
          s.count += Number(a.download_count) || 0;
          var at = a.created_at || '';
          if (at && (!s.since || at < s.since)) s.since = at;
        });
      });
      var body = table.querySelector('tbody');
      Object.keys(LABELS).forEach(function (name) {
        var s = sums[name];
        if (!s) return;
        var row = table.querySelector('tr[data-asset="' + name + '"]');
        if (!row) {
          // A release added a file the page has no row for yet (the Intel
          // builds): give it one from the map, in map order.
          row = document.createElement('tr');
          row.setAttribute('data-asset', name);
          row.innerHTML = '<td></td><td>GitHub Releases</td><td>-</td><td>-</td>';
          row.querySelector('td').textContent = LABELS[name];
          body.appendChild(row);
        }
        fill(row, s.since, s.count);
      });
    }).catch(fail);
  }
})();
