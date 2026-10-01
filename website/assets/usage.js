// The usage counters on the site (Sep 2026, worker/README.md).
//
// Three small jobs, each present only where its markup is:
//   1. a[data-count="<kind>"]: the download buttons send one empty ping on
//      click (POST /api/hit/<kind>), so the portable file served from this
//      site can be counted like the GitHub-served installers are.
//   2. [data-role="foot-count"]: the home page's settled footer line ("Browser
//      app used N times since <date>"), filled
//      from GET /api/counts and shown only once it has a number.
//   3. [data-role="usage-table"]: the About table, filled from /api/counts
//      (launches, the portable file) and from GitHub's Releases API (every
//      installer and .jmo, summed across releases, earliest asset date as
//      "since"). Either source failing leaves dashes and shows the status
//      line; the page never waits on them.
//   4. [data-role="usage-chart"] (Oct 2026): every row of that table opens
//      its history as a chart, from GET /api/daily: by day, week or month,
//      over the last week, month, three months, year or everything, with
//      the count under the pointer (or the arrow keys) and the numbers in a
//      table. The download rows' history starts when the site began noting
//      GitHub's running totals every hour (worker/index.js).
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
    var history = setupHistory(table, ALIASES);
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
          history.arm(row);
        }
        fill(row, s.since, s.count);
      });
    }).catch(fail);
  }

  // 4. The history behind each row. Built once for the table; returns arm()
  //    so the rows the GitHub map adds later get the same button.
  function setupHistory(table, ALIASES) {
    var panel = document.querySelector('[data-role="usage-chart"]');
    if (!panel) return { arm: function () {} };
    var q = function (role) { return panel.querySelector('[data-role="' + role + '"]'); };
    var titleEl = q('uc-title'), totalEl = q('uc-total'), plot = q('uc-plot'),
        noteEl = q('uc-note'), live = q('uc-live'), rowsEl = q('uc-rows'),
        periodHead = q('uc-period-head');
    var rangeBtns = panel.querySelectorAll('[data-range]');
    var binBtns = panel.querySelectorAll('[data-bin]');
    var DAY = 86400000;
    var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'];
    var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var RANGES = { '7': 7, '30': 30, '90': 90, '365': 365, 'all': 0 };
    var RANGE_WORDS = { '7': 'in the last 7 days', '30': 'in the last 30 days',
      '90': 'in the last 90 days', '365': 'in the last year' };
    // One browser that opens the app on three days is three browser-days:
    // a single day's point counts browsers, a week or a month adds days.
    var NOUNS = {
      'launch': { day: ['start', 'starts'], span: ['start', 'starts'] },
      'launch-day': { day: ['browser', 'browsers'], span: ['browser-day', 'browser-days'] },
      'portable': { day: ['download click', 'download clicks'], span: ['download click', 'download clicks'] }
    };
    var DOWNLOAD_NOUN = { day: ['download', 'downloads'], span: ['download', 'downloads'] };
    var ICON = '<svg class="uc-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path d="M1.5 12.5 5.5 8l3 2 6-6.5" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var state = { row: null, range: '30', bin: null, daily: null, loading: null, failed: false };
    var view = null;

    function arm(row) {
      if (!row || row.getAttribute('data-uc-armed')) return;
      var cell = row.querySelector('td');
      if (!cell) return;
      row.setAttribute('data-uc-armed', '1');
      row.classList.add('uc-armed');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'usage-row-btn';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'usage-chart');
      btn.innerHTML = ICON;
      var txt = document.createElement('span');
      txt.className = 'uc-txt';
      txt.textContent = cell.textContent.trim();
      btn.appendChild(txt);
      cell.textContent = '';
      cell.appendChild(btn);
      btn.addEventListener('click', function () { toggle(row); });
      // The whole row is a target for the pointer; the button is the one
      // for the keyboard and for assistive technology.
      row.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button, a')) return;
        toggle(row);
      });
    }
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), arm);

    function setOpen(row, on) {
      row.classList.toggle('uc-open', on);
      var b = row.querySelector('.usage-row-btn');
      if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    function toggle(row) {
      if (state.row === row) return close();
      if (state.row) setOpen(state.row, false);
      state.row = row;
      setOpen(row, true);
      titleEl.textContent = row.querySelector('.uc-txt').textContent;
      panel.hidden = false;
      render();
      load().then(function () { if (state.row === row) render(); },
                  function () { if (state.row === row) render(); });
      if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      if (state.row) setOpen(state.row, false);
      state.row = null;
      view = null;
      panel.hidden = true;
    }
    q('uc-close').addEventListener('click', function () {
      var row = state.row;
      close();
      var b = row && row.querySelector('.usage-row-btn');
      if (b) b.focus();
    });

    function load() {
      if (state.daily) return Promise.resolve(state.daily);
      if (!state.loading) {
        state.failed = false;
        state.loading = fetch('/api/daily').then(function (r) {
          if (!r.ok) throw new Error('daily ' + r.status);
          return r.json();
        }).then(function (j) { state.daily = j; return j; }, function (e) {
          // Let the next click try again.
          state.loading = null;
          state.failed = true;
          throw e;
        });
      }
      return state.loading;
    }

    // ---- dates, all in UTC: a counter's day runs midnight to midnight UTC
    function dayMs(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
    function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
    function todayMs() { return dayMs(new Date().toISOString()); }
    function dShort(ms) { var d = new Date(ms); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
    function dLong(ms) {
      var d = new Date(ms);
      return WEEKDAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    }
    function yearOf(ms) { return new Date(ms).getUTCFullYear(); }

    // The row's days from the first counted day to today, zeros included:
    // a day the counter ran and nobody came is a zero, not a gap.
    function seriesFor(row) {
      var daily = state.daily || {}, kind = row.getAttribute('data-kind');
      var asset = row.getAttribute('data-asset'), byDay = {}, start;
      function add(list) {
        (list || []).forEach(function (p) { byDay[p[0]] = (byDay[p[0]] || 0) + (Number(p[1]) || 0); });
      }
      if (kind) {
        add((daily.hits || {})[kind]);
        start = daily.hitsSince;
      } else {
        var dl = daily.downloads || {};
        Object.keys(dl).forEach(function (name) {
          if ((ALIASES[name] || name) === asset) add(dl[name]);
        });
        start = daily.downloadsSince;
      }
      if (!start) return null;
      var from = dayMs(start), to = todayMs(), days = [];
      Object.keys(byDay).forEach(function (k) { to = Math.max(to, dayMs(k)); });
      for (var t = from; t <= to; t += DAY) days.push({ t: t, n: byDay[isoOf(t)] || 0 });
      return { from: from, to: to, days: days };
    }
    function windowOf(series) {
      var n = RANGES[state.range], from = n ? series.to - (n - 1) * DAY : series.from;
      var clipped = n > 0 && from < series.from;
      if (from < series.from) from = series.from;
      return { from: from, to: series.to, clipped: clipped,
        days: series.days.filter(function (d) { return d.t >= from; }) };
    }
    function binStart(t, bin) {
      if (bin === 'day') return t;
      var d = new Date(t);
      if (bin === 'week') return t - ((d.getUTCDay() + 6) % 7) * DAY;   // weeks start on Monday
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    function binned(win, bin) {
      var out = [], cur = null;
      win.days.forEach(function (d) {
        var k = binStart(d.t, bin);
        if (!cur || cur.key !== k) { cur = { key: k, from: d.t, to: d.t, n: 0 }; out.push(cur); }
        cur.to = d.t;
        cur.n += d.n;
      });
      return out;
    }
    function defaultBin(win) {
      if (state.range === '365') return 'week';
      if (state.range !== 'all') return 'day';
      return win.days.length <= 92 ? 'day' : win.days.length <= 400 ? 'week' : 'month';
    }
    // A grouping that leaves fewer than two points says nothing a single
    // number would not, so it is offered only when it gives two or more.
    function usable(win, bin) { return bin === 'day' || binned(win, bin).length >= 2; }

    function noun(row, bin, n) {
      var set = NOUNS[row.getAttribute('data-kind')] || DOWNLOAD_NOUN;
      var pair = bin === 'day' ? set.day : set.span;
      return n === 1 ? pair[0] : pair[1];
    }
    function binTitle(b, bin, today) {
      var soFar = b.to === today ? ', so far' : '';
      if (bin === 'day') return dLong(b.from) + (b.from === today ? ', so far' : '');
      if (b.from === b.to) return dLong(b.from) + soFar;
      if (bin === 'month') {
        var d = new Date(b.from), last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
        if (new Date(b.from).getUTCDate() === 1 && (b.to === last || b.to === today)) {
          return MONTHS_LONG[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + soFar;
        }
      }
      return dShort(b.from) + (yearOf(b.from) !== yearOf(b.to) ? ' ' + yearOf(b.from) : '') +
        ' to ' + dShort(b.to) + ' ' + yearOf(b.to) + soFar;
    }
    function axisLabel(b, bin, prev) {
      var y = yearOf(b.key), showYear = !prev || yearOf(prev.key) !== y;
      if (bin === 'month') return MONTHS[new Date(b.key).getUTCMonth()] + (showYear ? ' ' + y : '');
      return dShort(b.from) + (showYear && prev ? ' ' + y : '');
    }
    function niceStep(max) {
      if (max <= 4) return 1;
      var rough = max / 4, mag = Math.pow(10, Math.floor(Math.log10(rough))), r = rough / mag;
      return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
    }

    function message(text) {
      view = null;
      plot.textContent = '';
      var p = document.createElement('p');
      p.className = 'uc-empty';
      p.textContent = text;
      plot.appendChild(p);
      plot.removeAttribute('aria-label');
    }
    function syncButtons(win, bin) {
      Array.prototype.forEach.call(rangeBtns, function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-range') === state.range ? 'true' : 'false');
      });
      Array.prototype.forEach.call(binBtns, function (b) {
        var name = b.getAttribute('data-bin');
        b.disabled = !win || !usable(win, name);
        b.setAttribute('aria-pressed', name === bin ? 'true' : 'false');
      });
    }

    function render() {
      var row = state.row;
      if (!row) return;
      var isDownload = !row.getAttribute('data-kind');
      totalEl.textContent = '';
      rowsEl.textContent = '';
      if (!state.daily) {
        syncButtons(null, null);
        noteEl.textContent = '';
        message(state.failed ? 'The history could not be loaded right now.' : 'Loading the history\u2026');
        return;
      }
      var series = seriesFor(row);
      noteEl.textContent = isDownload
        ? 'GitHub keeps only a running total for each file, so the site checks it every hour and records how much it grew. ' +
          (series ? 'This history starts on ' + fmtDate(isoOf(series.from)) + '; the count in the table includes every download before it. '
                  : 'This chart fills in after the first check. ') +
          'Days run midnight to midnight UTC.'
        : 'Days run midnight to midnight UTC.';
      if (!series) { syncButtons(null, null); message('No history yet.'); return; }
      var win = windowOf(series);
      var bin = state.bin && usable(win, state.bin) ? state.bin : defaultBin(win);
      syncButtons(win, bin);
      var bins = binned(win, bin), sum = 0;
      // Only a visitor's clock running behind the server's can leave a
      // window with no days in it; say so rather than draw nothing.
      if (!bins.length) { message('No history yet.'); return; }
      bins.forEach(function (b) { sum += b.n; });

      var big = document.createElement('b');
      big.textContent = fmtN(sum);
      totalEl.appendChild(big);
      var began = isDownload ? 'download history began ' : 'counting began ';
      totalEl.appendChild(document.createTextNode(' ' + noun(row, 'span', sum) + ' ' +
        (state.range === 'all' ? 'since ' + fmtDate(isoOf(win.from))
          : RANGE_WORDS[state.range] + (win.clipped ? ' (' + began + fmtDate(isoOf(series.from)) + ')' : ''))));

      periodHead.textContent = bin === 'day' ? 'Day' : bin === 'week' ? 'Week' : 'Month';
      var today = todayMs();
      bins.slice().reverse().forEach(function (b) {
        var tr = document.createElement('tr'), a = document.createElement('td'), c = document.createElement('td');
        a.textContent = binTitle(b, bin, today);
        c.textContent = fmtN(b.n);
        tr.appendChild(a); tr.appendChild(c);
        rowsEl.appendChild(tr);
      });
      draw(row, bins, bin, today);
    }

    var SVGNS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs, parent) {
      var e = document.createElementNS(SVGNS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
    function draw(row, bins, bin, today) {
      plot.textContent = '';
      var W = Math.max(240, Math.round(plot.clientWidth || 600));
      var H = W < 480 ? 210 : 250;
      var max = 0;
      bins.forEach(function (b) { if (b.n > max) max = b.n; });
      var step = niceStep(max), top = Math.max(step, Math.ceil(max / step) * step), ticks = [];
      for (var v = 0; v <= top; v += step) ticks.push(v);
      var widest = Math.max.apply(null, ticks.map(function (t) { return fmtN(t).length; }));
      var M = { l: Math.round(widest * 7.4 + 14), r: 16, t: 14, b: 30 };
      var pw = W - M.l - M.r, ph = H - M.t - M.b, n = bins.length;
      var X = function (i) { return n === 1 ? M.l + pw / 2 : M.l + (i * pw) / (n - 1); };
      var Y = function (val) { return M.t + ph - (val / top) * ph; };
      var svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' }, plot);
      ticks.forEach(function (t) {
        el('line', { x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t), stroke: t === 0 ? '#c3cfdc' : '#edf1f6' }, svg);
        el('text', { x: M.l - 8, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#5f6f80' }, svg).textContent = fmtN(t);
      });
      var K = Math.max(2, Math.floor(pw / 78)), idx = [];
      if (n <= K) for (var i = 0; i < n; i++) idx.push(i);
      else for (var j = 0; j < K; j++) { var at = Math.round(j * (n - 1) / (K - 1)); if (idx.indexOf(at) < 0) idx.push(at); }
      idx.forEach(function (i, k) {
        var anchor = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
        el('text', { x: X(i), y: H - 9, 'text-anchor': anchor, 'font-size': 12, fill: '#5f6f80' }, svg)
          .textContent = axisLabel(bins[i], bin, k ? bins[idx[k - 1]] : null);
      });
      var pts = bins.map(function (b, i) { return X(i).toFixed(1) + ' ' + Y(b.n).toFixed(1); });
      if (n > 1) {
        var line = 'M' + pts.join(' L');
        el('path', { d: line + ' L' + X(n - 1).toFixed(1) + ' ' + Y(0) + ' L' + X(0).toFixed(1) + ' ' + Y(0) + ' Z',
          fill: 'rgba(65, 116, 153, 0.12)' }, svg);
        el('path', { d: line, fill: 'none', stroke: '#417499', 'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-role': 'uc-line' }, svg);
      }
      if (n <= 45) bins.forEach(function (b, i) {
        el('circle', { cx: X(i), cy: Y(b.n), r: n === 1 ? 4.5 : 3, fill: '#417499', 'data-role': 'uc-point' }, svg);
      });
      var cross = el('line', { y1: M.t, y2: M.t + ph, stroke: '#8a97a6', 'stroke-dasharray': '3 3', visibility: 'hidden' }, svg);
      var dot = el('circle', { r: 5.5, fill: '#fff', stroke: '#417499', 'stroke-width': 2.5, visibility: 'hidden' }, svg);
      var tip = document.createElement('div');
      tip.className = 'uc-tip';
      tip.setAttribute('data-role', 'uc-tip');
      // Visual only: the arrow keys announce the same words through the
      // live region, so a screen reader is not read the box twice.
      tip.setAttribute('aria-hidden', 'true');
      tip.hidden = true;
      plot.appendChild(tip);
      plot.setAttribute('aria-label', 'Chart of ' + titleEl.textContent + ', by ' + bin);
      view = { row: row, bins: bins, bin: bin, today: today, X: X, Y: Y, M: M, pw: pw, W: W,
        cross: cross, dot: dot, tip: tip, active: -1 };
    }

    function show(i, announce) {
      if (!view) return;
      var b = view.bins[i], x = view.X(i), y = view.Y(b.n);
      view.active = i;
      view.cross.setAttribute('x1', x); view.cross.setAttribute('x2', x);
      view.cross.setAttribute('visibility', 'visible');
      view.dot.setAttribute('cx', x); view.dot.setAttribute('cy', y);
      view.dot.setAttribute('visibility', 'visible');
      var count = fmtN(b.n) + ' ' + noun(view.row, view.bin, b.n), when = binTitle(b, view.bin, view.today);
      view.tip.textContent = '';
      var strong = document.createElement('b');
      strong.textContent = count;
      view.tip.appendChild(strong);
      view.tip.appendChild(document.createTextNode(when));
      view.tip.hidden = false;
      var half = view.tip.offsetWidth / 2 + 2;
      view.tip.style.left = Math.min(Math.max(x, half), view.W - half) + 'px';
      // Above the point, or below it when there is no room above: the box
      // must never cover the point it describes.
      var below = y - 10 < view.tip.offsetHeight + 2;
      view.tip.classList.toggle('uc-tip-below', below);
      view.tip.style.top = (below ? y + 12 : y - 10) + 'px';
      if (announce) live.textContent = count + ', ' + when;
    }
    function hide() {
      if (!view) return;
      view.active = -1;
      view.cross.setAttribute('visibility', 'hidden');
      view.dot.setAttribute('visibility', 'hidden');
      view.tip.hidden = true;
    }
    plot.addEventListener('pointermove', function (e) {
      if (!view) return;
      var x = e.clientX - plot.getBoundingClientRect().left, n = view.bins.length;
      var i = n === 1 ? 0 : Math.round((x - view.M.l) / view.pw * (n - 1));
      show(Math.min(n - 1, Math.max(0, i)), false);
    });
    plot.addEventListener('pointerleave', function () { if (document.activeElement !== plot) hide(); });
    plot.addEventListener('focus', function () { if (view && view.active < 0) show(view.bins.length - 1, true); });
    plot.addEventListener('blur', hide);
    plot.addEventListener('keydown', function (e) {
      if (!view) return;
      var last = view.bins.length - 1, i = view.active < 0 ? last : view.active;
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowRight') i = Math.min(last, i + 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = last;
      else return;
      e.preventDefault();
      show(i, true);
    });
    Array.prototype.forEach.call(rangeBtns, function (b) {
      b.addEventListener('click', function () { state.range = b.getAttribute('data-range'); render(); });
    });
    Array.prototype.forEach.call(binBtns, function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.bin = b.getAttribute('data-bin');
        render();
      });
    });
    // Redraw at the new width when the column changes size.
    var lastW = 0;
    if (window.ResizeObserver) new ResizeObserver(function () {
      var w = Math.round(plot.clientWidth);
      if (w && w !== lastW && view) { lastW = w; render(); }
      else lastW = w;
    }).observe(plot);
    return { arm: arm };
  }
})();
