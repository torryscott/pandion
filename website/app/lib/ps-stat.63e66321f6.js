// Pandion Plots standalone - numeric core (R-parity stat mirrors).
// Everything here mirrors the R functions the jamovi .b.R files call, at
// the 10-significant-digit precision jsonlite ships (digits = I(10)).
// Ported/adapted where noted from graphbuilder2.js's own client mirrors
// (which are R-parity-verified in the repo's probe fleet).
// Keep this file ASCII (escapes only) and never persist _-prefixed keys.

window.PSStat = (function () {
  "use strict";

  function sigR(x) {
    return (typeof x === "number" && isFinite(x)) ? Number(x.toPrecision(10)) : x;
  }
  function mean(v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i];
    return s / v.length;
  }
  function median(v) {
    var s = v.slice().sort(function (a, b) { return a - b; });
    var n = s.length;
    return (n % 2) ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function sdSample(v) {
    var n = v.length;
    if (n < 2) return NaN;
    var m = mean(v), ss = 0;
    for (var i = 0; i < n; i++) ss += (v[i] - m) * (v[i] - m);
    return Math.sqrt(ss / (n - 1));
  }

  // ---- gamma / beta machinery (Lanczos + Lentz continued fractions) ----
  function logGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betaCf(a, b, x) {
    var MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betaCf(a, b, x) / a;
    return 1 - bt * betaCf(b, a, 1 - x) / b;
  }

  // Regularized incomplete gamma P/Q for the chi-square distribution.
  function gammaSer(a, x) {
    var ap = a, sum = 1 / a, del = sum;
    for (var i = 0; i < 500; i++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  function gammaCf(a, x) {
    var FPMIN = 1e-300, b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (var i = 1; i <= 500; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c; h *= del;
      if (Math.abs(del - 1) < 3e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  }
  function gammaQ(a, x) {           // upper regularized (chi-sq survival)
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 1;
    if (x < a + 1) return 1 - gammaSer(a, x);
    return gammaCf(a, x);
  }
  // R pchisq(x, df, lower.tail = FALSE)
  function chisqUpperP(x, df) { return gammaQ(df / 2, x / 2); }
  // qchisq(p, 2) has the closed form -2 log(1 - p).
  function qchisq2(p) { return -2 * Math.log(1 - p); }

  // ---- t distribution ----
  function tCdf(t, df) {
    var ib = betaInc(df / 2, 0.5, df / (df + t * t));
    return t >= 0 ? 1 - ib / 2 : ib / 2;
  }

  // ---- qnorm: Wichura's AS 241, the algorithm R's qnorm uses --------------
  // Needed by Shapiro-Wilk for the expected normal order statistics. Verified
  // against R across the full range before it shipped.
  function qnorm(p) {
    if (!(p > 0)) return -Infinity;
    if (!(p < 1)) return Infinity;
    var q = p - 0.5, r, v;
    if (Math.abs(q) <= 0.425) {
      r = 0.180625 - q * q;
      return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r +
        67265.770927008700853) * r + 45921.953931549871457) * r +
        13731.693765509461125) * r + 1971.5909503065514427) * r +
        133.14166789178437745) * r + 3.387132872796366608) /
        (((((((5226.495278852854561 * r + 28729.085735721942674) * r +
        39307.89580009271061) * r + 21213.794301586595867) * r +
        5394.1960214247511077) * r + 687.1870074920579083) * r +
        42.313330701600911252) * r + 1);
    }
    r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p));
    if (r <= 5) {
      r -= 1.6;
      v = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r +
        0.24178072517745061177) * r + 1.27045825245236838258) * r +
        3.64784832476320460504) * r + 5.7694972214606914055) * r +
        4.6303378461565452959) * r + 1.42343711074968357734) /
        (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r +
        0.0151986665636164571966) * r + 0.14810397642748007459) * r +
        0.68976733498510000455) * r + 1.6763848301838038494) * r +
        2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      v = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r +
        0.0012426609473880784386) * r + 0.026532189526576123093) * r +
        0.29656057182850489123) * r + 1.7848265399172913358) * r +
        5.4637849111641143699) * r + 6.6579046435011037772) /
        (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r +
        1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r +
        0.0148753612908506148525) * r + 0.13692988092273580531) * r +
        0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -v : v;
  }
  // ---- Shapiro-Wilk: Royston AS R94, the algorithm behind R's -------------
  // shapiro.test. Punch list item 5: the shell shipped distNormality empty,
  // and the engine does not degrade silently - it printed
  // "n/a (needs 3-5000 values)" against the student's real cell name, telling
  // them their sample size was wrong when it was not. Verified equal to R's
  // shapiro.test (W < 1e-7, p < 1e-6) across n = 3, 5, 8, 11, 12, 24, 50, 200
  // and 1000, both branch boundaries, and a heavy-ties case.
  function swPoly(c, x) {
    var s = c[0], p = 1;
    for (var i = 1; i < c.length; i++) { p *= x; s += c[i] * p; }
    return s;
  }
  function shapiroWilk(values) {
    var x = [], i;
    for (i = 0; i < values.length; i++)
      if (typeof values[i] === "number" && isFinite(values[i])) x.push(values[i]);
    x.sort(function (a, b) { return a - b; });
    var n = x.length;
    if (n < 3 || n > 5000) return null;
    var m = new Array(n), ssumm2 = 0;
    for (i = 0; i < n; i++) { m[i] = qnorm((i + 1 - 0.375) / (n + 0.25)); ssumm2 += m[i] * m[i]; }
    var rsn = 1 / Math.sqrt(n), a = new Array(n), a1, a2, fac, lo, hi;
    if (n === 3) {
      a[0] = -Math.SQRT1_2; a[1] = 0; a[2] = Math.SQRT1_2;
    } else {
      var ssumm = Math.sqrt(ssumm2);
      a1 = -m[0] / ssumm + swPoly([0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056], rsn);
      if (n > 5) {
        a2 = -m[1] / ssumm + swPoly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], rsn);
        fac = Math.sqrt((ssumm2 - 2 * m[0] * m[0] - 2 * m[1] * m[1]) /
                        (1 - 2 * a1 * a1 - 2 * a2 * a2));
      } else {
        a2 = 0;
        fac = Math.sqrt((ssumm2 - 2 * m[0] * m[0]) / (1 - 2 * a1 * a1));
      }
      a[0] = -a1; a[n - 1] = a1;
      if (n > 5) { a[1] = -a2; a[n - 2] = a2; }
      lo = n > 5 ? 2 : 1; hi = n - 1 - lo;
      for (i = lo; i <= hi; i++) a[i] = m[i] / fac;
    }
    var mean = 0;
    for (i = 0; i < n; i++) mean += x[i];
    mean /= n;
    var num = 0, den = 0;
    for (i = 0; i < n; i++) { num += a[i] * x[i]; den += (x[i] - mean) * (x[i] - mean); }
    if (!(den > 0)) return null;
    var W = num * num / den;
    if (W > 1) W = 1;
    var p, g, mu, sig, y, ln;
    if (n === 3) {
      p = 1.90985931710274 * (Math.asin(Math.sqrt(W)) - 1.04719755119660);
      if (!(p > 0)) p = 0;
      if (p > 1) p = 1;
    } else if (n <= 11) {
      g = swPoly([-2.273, 0.459], n);
      mu = swPoly([0.5440, -0.39978, 0.025054, -6.714e-4], n);
      sig = Math.exp(swPoly([1.3822, -0.77857, 0.062767, -0.0020322], n));
      y = -Math.log(g - Math.log(1 - W));
      p = 1 - pnorm((y - mu) / sig);
    } else {
      ln = Math.log(n);
      mu = swPoly([-1.5861, -0.31082, -0.083751, 0.0038915], ln);
      sig = Math.exp(swPoly([-0.4803, -0.082676, 0.0030302], ln));
      y = Math.log(1 - W);
      p = 1 - pnorm((y - mu) / sig);
    }
    return { w: W, p: p, n: n };
  }

  function qt(p, df) {              // upper-half quantiles only (p > 0.5)
    var lo = 0, hi = 1;
    while (tCdf(hi, df) < p && hi < 1e12) hi *= 2;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  // Standard normal CDF P[X <= x]: a faithful port of R's nmath/pnorm.c
  // (Cody's rational approximations, ~1e-15). Upper tails: use pnorm(-x)
  // (the algorithm is exactly symmetric), never 1 - pnorm(x).
  var _PN_A = [2.2352520354606839287, 161.02823106855587881,
               1067.6894854603709582, 18154.981253343561249,
               0.065682337918207449113];
  var _PN_B = [47.20258190468824187, 976.09855173777669322,
               10260.932208618978205, 45507.789335026729956];
  var _PN_C = [0.39894151208813466764, 8.8831497943883759412,
               93.506656132177855979, 597.27027639480026226,
               2494.5375852903726711, 6848.1904505362823326,
               11602.651437647350124, 9842.7148383839780218,
               1.0765576773720192317e-8];
  var _PN_D = [22.266688044328115691, 235.38790178262499861,
               1519.377599407554805, 6485.558298266760755,
               18615.571640885098091, 34900.952721145977266,
               38912.003286093271411, 19685.429676859990727];
  var _PN_P = [0.21589853405795699, 0.1274011611602473639,
               0.022235277870649807, 0.001421619193227893466,
               2.9112874951168792e-5, 0.02307344176494017303];
  var _PN_Q = [1.28426009614491121, 0.468238212480865118,
               0.0659881378689285515, 0.00378239633202758244,
               7.29751555083966205e-5];
  function pnorm(x) {
    if (!isFinite(x)) return x > 0 ? 1 : 0;
    var M_SQRT_32 = 5.656854249492380195206754896838;
    var M_1_SQRT_2PI = 0.398942280401432677939946059934;
    var eps = 1.1102230246251565e-16 * 0.5;
    var xden, xnum, temp, del, xsq, i;
    var y = Math.abs(x);
    if (y <= 0.67448975) {
      if (y > eps) {
        xsq = x * x;
        xnum = _PN_A[4] * xsq;
        xden = xsq;
        for (i = 0; i < 3; i++) {
          xnum = (xnum + _PN_A[i]) * xsq;
          xden = (xden + _PN_B[i]) * xsq;
        }
      } else { xnum = xden = 0; }
      temp = x * (xnum + _PN_A[3]) / (xden + _PN_B[3]);
      return 0.5 + temp;
    }
    if (y <= M_SQRT_32) {
      xnum = _PN_C[8] * y;
      xden = y;
      for (i = 0; i < 7; i++) {
        xnum = (xnum + _PN_C[i]) * y;
        xden = (xden + _PN_D[i]) * y;
      }
      temp = (xnum + _PN_C[7]) / (xden + _PN_D[7]);
      xsq = Math.trunc(y * 16) / 16;
      del = (y - xsq) * (y + xsq);
      var cum = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * temp;
      return (x > 0) ? 1 - cum : cum;
    }
    if (-38.4674 < x && x < 8.2924) {
      xsq = 1 / (x * x);
      xnum = _PN_P[5] * xsq;
      xden = xsq;
      for (i = 0; i < 4; i++) {
        xnum = (xnum + _PN_P[i]) * xsq;
        xden = (xden + _PN_Q[i]) * xsq;
      }
      temp = xsq * (xnum + _PN_P[4]) / (xden + _PN_Q[4]);
      temp = (M_1_SQRT_2PI - temp) / y;
      xsq = Math.trunc(x * 16) / 16;
      del = (x - xsq) * (x + xsq);
      var cum2 = Math.exp(-xsq * xsq * 0.5) * Math.exp(-del * 0.5) * temp;
      return (x > 0) ? 1 - cum2 : cum2;
    }
    return x > 0 ? 1 : 0;
  }

  // ---- ranks + correlations (ported from graphbuilder2.js client mirrors) ----
  function ranks(a) {
    var n = a.length, idx = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (p, q) { return a[p] - a[q]; });
    var out = new Array(n); i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && a[idx[j + 1]] === a[idx[i]]) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) out[idx[k]] = avg;
      i = j + 1;
    }
    return out;
  }
  function pearsonR(xs, ys) {
    var n = xs.length, sx = 0, sy = 0, i;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    var mx = sx / n, my = sy / n, sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (!(sxx > 0) || !(syy > 0)) return null;
    return sxy / Math.sqrt(sxx * syy);
  }
  function hasTies(a) {
    var seen = {};
    for (var i = 0; i < a.length; i++) {
      if (seen[a[i]]) return true;
      seen[a[i]] = 1;
    }
    return false;
  }
  function pearsonTest(xs, ys) {
    var n = xs.length;
    var r = pearsonR(xs, ys);
    if (r == null || !isFinite(r)) return null;
    if (Math.abs(r) >= 1) return { r: r, p: 0 };
    var df = n - 2;
    if (df < 1) return { r: r, p: NaN };
    var t = r * Math.sqrt(df / (1 - r * r));
    // Direct tail (tCdf(-|t|) IS the incomplete-beta tail): the naive
    // 2*(1 - tCdf(|t|)) cancels to 0 below ~1e-16 where R still prints
    // the true tiny p.
    var p = 2 * tCdf(-Math.abs(t), df);
    return { r: r, p: Math.max(0, Math.min(1, p)) };
  }

  // Spearman: cor.test parity - a faithful port of R's spearman branch
  // (cor.test.R) + prho.c (AS 89): exact permutation distribution for
  // n <= 9, Edgeworth expansion for 9 < n <= 1290 (tie-free), and the
  // asymptotic t_{n-2} otherwise / with ties. Verified against R in the
  // parity probe.
  var _spearDistCache = {};
  function _spearDist(n) {          // counts of ise = sum d^2 over all perms
    if (_spearDistCache[n]) return _spearDistCache[n];
    var counts = {}, used = new Array(n + 1);
    function rec(pos, s) {
      if (pos > n) { counts[s] = (counts[s] || 0) + 1; return; }
      for (var v = 1; v <= n; v++) {
        if (used[v]) continue;
        used[v] = 1;
        var d = pos - v;
        rec(pos + 1, s + d * d);
        used[v] = 0;
      }
    }
    rec(1, 0);
    _spearDistCache[n] = counts;
    return counts;
  }
  function _pRho(is, n, lower) {    // prho.c: P[S >= is] or P[S < is]
    var pv = lower ? 0 : 1;
    if (n <= 1) return NaN;
    if (is <= 0) return pv;
    var n3 = n * (n * n - 1) / 3;
    if (is > n3) return 1 - pv;
    if (n <= 9) {
      var counts = _spearDist(n), nfac = 1, i;
      for (i = 2; i <= n; i++) nfac *= i;
      var ifr = 0, k;
      for (k in counts) {
        if (!Object.prototype.hasOwnProperty.call(counts, k)) continue;
        if (Number(k) >= is) ifr += counts[k];
      }
      return (lower ? nfac - ifr : ifr) / nfac;
    }
    var c1 = 0.2274, c2 = 0.2531, c3 = 0.1745, c4 = 0.0758, c5 = 0.1033,
        c6 = 0.3932, c7 = 0.0879, c8 = 0.0151, c9 = 0.0072, c10 = 0.0831,
        c11 = 0.0131, c12 = 4.6e-4;
    var y = n, b = 1 / y;
    var x = (6 * (is - 1) * b / (y * y - 1) - 1) * Math.sqrt(y - 1);
    var y2 = x * x;
    var u = x * b * (c1 + b * (c2 + c3 * b) +
        y2 * (-c4 + b * (c5 + c6 * b) -
              y2 * b * (c7 + c8 * b -
                        y2 * (c9 - c10 * b + y2 * b * (c11 - c12 * y2)))));
    var yv = u / Math.exp(y2 / 2);
    pv = (lower ? -yv : yv) + (lower ? pnorm(x) : pnorm(-x));
    return Math.max(0, Math.min(1, pv));
  }
  function spearmanTest(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var rho = pearsonR(ranks(xs), ranks(ys));
    if (rho == null || !isFinite(rho)) return null;
    var q = (n * n * n - n) * (1 - rho) / 6;
    var exact = !(hasTies(xs) || hasTies(ys));
    function pspearman(qq, lower) {
      if (n <= 1290 && exact)
        return _pRho(Math.round(qq) + 2 * (lower ? 1 : 0), n, lower);
      var den = n * (n * n - 1) / 6;
      var r2 = 1 - qq / den;
      var t = r2 / Math.sqrt((1 - r2 * r2) / (n - 2));
      // pt(t, df, lower.tail = !lower); the upper tail goes through
      // tCdf(-t) directly to avoid 1-minus cancellation.
      return lower ? tCdf(-t, n - 2) : tCdf(t, n - 2);
    }
    var p1 = (q > (n * n * n - n) / 6) ? pspearman(q, false) : pspearman(q, true);
    return { r: rho, p: Math.max(0, Math.min(1, Math.min(2 * p1, 1))) };
  }

  // Kendall tau-b + p, the graphbuilder2 _xyCorrClient port (full R
  // parity: exact tie-free n < 50 via the pkendall probability DP, else
  // the tie-corrected S-variance normal approximation).
  function _kendallExactP(q, n) {
    var dist = [1], j, k;
    for (j = 2; j <= n; j++) {
      var out = [], len = dist.length + j - 1, run = 0;
      for (k = 0; k < len; k++) {
        run += (k < dist.length ? dist[k] : 0);
        if (k - j >= 0) run -= dist[k - j];
        out.push(run / j);
      }
      dist = out;
    }
    var mid = n * (n - 1) / 4;
    function cum(u) {
      var s2 = 0, k2;
      for (k2 = 0; k2 <= u && k2 < dist.length; k2++) s2 += dist[k2];
      return Math.min(1, Math.max(0, s2));
    }
    var p1 = (q > mid) ? (1 - cum(q - 1)) : cum(q);
    return Math.min(1, 2 * p1);
  }
  function kendallTest(xs, ys) {
    var n = xs.length; if (n < 3) return null;
    var nc = 0, nd = 0, i, j;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      if (dx === 0 || dy === 0) continue;
      if ((dx > 0) === (dy > 0)) nc++; else nd++;
    }
    var S = nc - nd;
    function tieSizes(a) {
      var m = {}, out2 = [], k3;
      for (k3 = 0; k3 < a.length; k3++) m[a[k3]] = (m[a[k3]] || 0) + 1;
      for (k3 in m) if (Object.prototype.hasOwnProperty.call(m, k3) && m[k3] > 1) out2.push(m[k3]);
      return out2;
    }
    function sumTT(t, f) {
      var s3 = 0, q3;
      for (q3 = 0; q3 < t.length; q3++) s3 += f(t[q3]);
      return s3;
    }
    var xt = tieSizes(xs), yt = tieSizes(ys);
    var T0 = n * (n - 1) / 2;
    var T1 = sumTT(xt, function (t) { return t * (t - 1); }) / 2;
    var T2 = sumTT(yt, function (t) { return t * (t - 1); }) / 2;
    var den = Math.sqrt((T0 - T1) * (T0 - T2));
    var tau = den > 0 ? S / den : 0;
    var pk;
    if (n < 50 && !xt.length && !yt.length) {
      pk = _kendallExactP(nc, n);
    } else {
      var v0 = n * (n - 1) * (2 * n + 5);
      var vt = sumTT(xt, function (t) { return t * (t - 1) * (2 * t + 5); });
      var vu = sumTT(yt, function (t) { return t * (t - 1) * (2 * t + 5); });
      var s1x = sumTT(xt, function (t) { return t * (t - 1); });
      var s1y = sumTT(yt, function (t) { return t * (t - 1); });
      var s2x = sumTT(xt, function (t) { return t * (t - 1) * (t - 2); });
      var s2y = sumTT(yt, function (t) { return t * (t - 1) * (t - 2); });
      var vS = (v0 - vt - vu) / 18 +
          (s1x * s1y) / (2 * n * (n - 1)) +
          (s2x * s2y) / (9 * n * (n - 1) * (n - 2));
      var z = (vS > 0) ? S / Math.sqrt(vS) : 0;
      pk = 2 * pnorm(-Math.abs(z));
    }
    return { r: tau, p: Math.max(0, Math.min(1, pk)) };
  }
  function corrTest(xs, ys, method) {
    if (method === "spearman") return spearmanTest(xs, ys);
    if (method === "kendall") return kendallTest(xs, ys);
    return pearsonTest(xs, ys);
  }

  // ---- least squares fits with CI (graphbuilder2 _xyFitOLS port; the
  // centered-basis normal equations span the same column space as R's
  // poly() fit, so fitted values + CI match lm/predict analytically) ----
  function matInv(M, p) {
    var A = [], i, j;
    for (i = 0; i < p; i++) {
      A[i] = M[i].slice();
      for (j = 0; j < p; j++) A[i].push(i === j ? 1 : 0);
    }
    for (i = 0; i < p; i++) {
      var piv = i;
      for (j = i + 1; j < p; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
      if (Math.abs(A[piv][i]) < 1e-12) return null;
      var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp;
      var d = A[i][i];
      for (j = 0; j < 2 * p; j++) A[i][j] /= d;
      for (var r2 = 0; r2 < p; r2++) {
        if (r2 === i) continue;
        var f = A[r2][i];
        if (f === 0) continue;
        for (j = 0; j < 2 * p; j++) A[r2][j] -= f * A[i][j];
      }
    }
    var Inv = [];
    for (i = 0; i < p; i++) Inv[i] = A[i].slice(p);
    return Inv;
  }
  function olsFit(xs, ys, deg, level, xseq) {
    var n = xs.length, p = deg + 1, i, j, k;
    if (n < p) return null;
    var xbar = 0; for (i = 0; i < n; i++) xbar += xs[i]; xbar /= n;
    function basis(xc) {
      var b = [1], v = 1;
      for (var d = 1; d <= deg; d++) { v *= xc; b.push(v); }
      return b;
    }
    var XtX = [], Xty = [];
    for (i = 0; i < p; i++) { XtX[i] = []; for (j = 0; j < p; j++) XtX[i][j] = 0; Xty[i] = 0; }
    for (k = 0; k < n; k++) {
      var b = basis(xs[k] - xbar), yk = ys[k];
      for (i = 0; i < p; i++) { Xty[i] += b[i] * yk; for (j = 0; j < p; j++) XtX[i][j] += b[i] * b[j]; }
    }
    var Inv = matInv(XtX, p); if (!Inv) return null;
    var beta = [];
    for (i = 0; i < p; i++) { var sb = 0; for (j = 0; j < p; j++) sb += Inv[i][j] * Xty[j]; beta[i] = sb; }
    var rss = 0;
    for (k = 0; k < n; k++) {
      var b2 = basis(xs[k] - xbar), yh = 0;
      for (i = 0; i < p; i++) yh += beta[i] * b2[i];
      var e = ys[k] - yh; rss += e * e;
    }
    var dfres = n - p; if (dfres < 1) dfres = 1;
    var s2 = rss / dfres;
    var tcrit = qt(1 - (1 - level) / 2, dfres);
    var out = { xs: [], ys: [], lwrs: [], uprs: [] };
    for (var q = 0; q < xseq.length; q++) {
      var v = basis(xseq[q] - xbar), yh2 = 0;
      for (i = 0; i < p; i++) yh2 += beta[i] * v[i];
      var qf = 0;
      for (i = 0; i < p; i++) { var iv = 0; for (j = 0; j < p; j++) iv += Inv[i][j] * v[j]; qf += v[i] * iv; }
      var se = Math.sqrt(Math.max(0, s2 * qf));
      out.xs.push(xseq[q]); out.ys.push(yh2);
      out.lwrs.push(yh2 - tcrit * se); out.uprs.push(yh2 + tcrit * se);
    }
    return out;
  }
  // Simple linear regression pieces for the stats overlay + residuals.
  function linReg(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0;
    for (var i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    if (!(sxx > 0)) return null;
    var slope = sxy / sxx, intercept = my - slope * mx;
    var rss = 0, tss = 0;
    for (var k = 0; k < n; k++) {
      var e = ys[k] - (intercept + slope * xs[k]);
      rss += e * e; tss += (ys[k] - my) * (ys[k] - my);
    }
    return { slope: slope, intercept: intercept,
             r2: tss > 0 ? 1 - rss / tss : NaN, rss: rss,
             residuals: xs.map(function (x, i2) { return ys[i2] - (intercept + slope * x); }) };
  }
  // Loess port (graphbuilder2 _xyFitLoess): APPROXIMATE vs stats::loess
  // (documented preview-grade math; the standalone has no R to correct it).
  function loessFit(xs, ys, span, level, xseq) {
    var n = xs.length, i; if (n < 4) return null;
    var idx = []; for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return xs[a] - xs[b]; });
    var sx = [], sy = [];
    for (i = 0; i < n; i++) { sx.push(xs[idx[i]]); sy.push(ys[idx[i]]); }
    if (!(span > 0)) span = 0.75;
    var q = Math.max(3, Math.min(n, Math.floor(span * n + 0.5)));
    function localFit(x0, withVar) {
      var lo2 = 0, hi2 = n;
      while (lo2 < hi2) { var md = (lo2 + hi2) >> 1; if (sx[md] < x0) lo2 = md + 1; else hi2 = md; }
      var L = lo2, R = lo2;
      while (R - L < q && (L > 0 || R < n)) {
        if (L === 0) R++;
        else if (R === n) L--;
        else if ((x0 - sx[L - 1]) <= (sx[R] - x0)) L--;
        else R++;
      }
      var h = Math.max(x0 - sx[L], sx[R - 1] - x0);
      if (span > 1) h *= span;
      if (!(h > 0)) h = 1e-9;
      var P = 3, XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Xty = [0, 0, 0], used = [], a, c2;
      for (var u = L; u < R; u++) {
        var dd = Math.abs(sx[u] - x0) / h; if (dd >= 1) continue;
        var w = Math.pow(1 - dd * dd * dd, 3), dxc = sx[u] - x0, bb = [1, dxc, dxc * dxc];
        used.push({ w: w, b: bb, u: u });
        for (a = 0; a < P; a++) { Xty[a] += w * bb[a] * sy[u]; for (c2 = 0; c2 < P; c2++) XtX[a][c2] += w * bb[a] * bb[c2]; }
      }
      if (used.length < 3) {
        var sw = 0, swy = 0;
        for (var m = 0; m < used.length; m++) { sw += used[m].w; swy += used[m].w * sy[used[m].u]; }
        return { yhat: sw > 0 ? swy / sw : NaN, l2: NaN };
      }
      var Inv = matInv(XtX, P); if (!Inv) return { yhat: NaN, l2: NaN };
      var beta = [0, 0, 0];
      for (a = 0; a < P; a++) { var sa = 0; for (c2 = 0; c2 < P; c2++) sa += Inv[a][c2] * Xty[c2]; beta[a] = sa; }
      var yhat = beta[0], l2 = NaN;
      if (withVar) {
        l2 = 0;
        for (var m2 = 0; m2 < used.length; m2++) {
          var bi = used[m2].b, wi = used[m2].w;
          var r0 = Inv[0][0] * bi[0] + Inv[0][1] * bi[1] + Inv[0][2] * bi[2], li = wi * r0;
          l2 += li * li;
        }
      }
      return { yhat: yhat, l2: l2 };
    }
    var rss = 0, cnt = 0;
    for (i = 0; i < n; i++) {
      var f0 = localFit(sx[i], false);
      if (isFinite(f0.yhat)) { var e = sy[i] - f0.yhat; rss += e * e; cnt++; }
    }
    var pEff = Math.max(2, Math.min(n - 1, 1.2 * (n / q))), dfres = Math.max(1, cnt - pEff);
    var s2 = (cnt > 0) ? rss / dfres : 0, tcrit = qt(1 - (1 - level) / 2, dfres);
    var out = { xs: [], ys: [], lwrs: [], uprs: [] };
    for (var kk = 0; kk < xseq.length; kk++) {
      var f = localFit(xseq[kk], true);
      if (!isFinite(f.yhat)) continue;
      var se = isFinite(f.l2) ? Math.sqrt(Math.max(0, s2 * f.l2)) : 0;
      out.xs.push(xseq[kk]); out.ys.push(f.yhat);
      out.lwrs.push(f.yhat - tcrit * se); out.uprs.push(f.yhat + tcrit * se);
    }
    return out.xs.length >= 2 ? out : null;
  }

  // 2x2 symmetric covariance + eigen (closed form) for the ellipses.
  function cov2(xs, ys) {
    var n = xs.length;
    if (n < 2) return null;
    var mx = mean(xs), my = mean(ys), sxx = 0, syy = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      var dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    return { mx: mx, my: my,
             sxx: sxx / (n - 1), syy: syy / (n - 1), sxy: sxy / (n - 1) };
  }
  // Eigen of [[a,b],[b,c]], values DESCENDING (R eigen convention),
  // unit vectors.
  function eigen2(a, b, c) {
    var tr = a + c, det = a * c - b * b;
    var disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    function vec(l) {
      var vx, vy;
      if (Math.abs(b) > 1e-300) { vx = l - c; vy = b; }
      else if (a >= c) { vx = 1; vy = 0; }
      else { vx = 0; vy = 1; }
      var nrm = Math.sqrt(vx * vx + vy * vy);
      if (!(nrm > 0)) return [1, 0];
      return [vx / nrm, vy / nrm];
    }
    return { values: [l1, l2], vectors: [vec(l1), vec(l2)] };
  }

  return {
    sigR: sigR, mean: mean, median: median, sdSample: sdSample,
    logGamma: logGamma, betaInc: betaInc,
    tCdf: tCdf, qt: qt, pnorm: pnorm,
    chisqUpperP: chisqUpperP, qchisq2: qchisq2,
    qnorm: qnorm, shapiroWilk: shapiroWilk,
    ranks: ranks, pearsonR: pearsonR,
    pearsonTest: pearsonTest, spearmanTest: spearmanTest,
    kendallTest: kendallTest, corrTest: corrTest,
    matInv: matInv, olsFit: olsFit, linReg: linReg, loessFit: loessFit,
    cov2: cov2, eigen2: eigen2
  };
})();
