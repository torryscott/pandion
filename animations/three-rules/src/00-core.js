/* Pandion Plots: "Three rules" animation.
 * Core utilities: math, easing, springs, color, seeded random, text.
 * Every frame is a pure function of time, so nothing here keeps state
 * between frames except caches that never change what is drawn. */

var STAGE_W = 1920, STAGE_H = 1080;

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function seg(t, a, b) { return b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1); }
function smooth(t) { return t * t * (3 - 2 * t); }
function smoother(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function pulse(t, a, b, c, d) { return seg(t, a, b) * (1 - seg(t, c, d)); }

/* Cubic-bezier easing identical to CSS timing functions. */
function cubicBezier(x1, y1, x2, y2) {
  var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  function sx(t) { return ((ax * t + bx) * t + cx) * t; }
  function sy(t) { return ((ay * t + by) * t + cy) * t; }
  function dx(t) { return (3 * ax * t + 2 * bx) * t + cx; }
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var t = x, i;
    for (i = 0; i < 8; i++) {
      var e = sx(t) - x, d = dx(t);
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    var lo = 0, hi = 1; t = x;
    for (i = 0; i < 30; i++) {
      var v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

var Ease = {
  lin: function (t) { return t; },
  inQuad: function (t) { return t * t; },
  outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
  inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  inCubic: function (t) { return t * t * t; },
  outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
  inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
  inOutQuart: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
  outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
  inOutQuint: function (t) { return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2; },
  outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
  inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
  inOutExpo: function (t) {
    if (t <= 0) return 0; if (t >= 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  outBack: function (t) { var s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  outBackSoft: function (t) { var s = 1.1; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  /* Minimum-jerk profile: how a hand actually moves a mouse. */
  minJerk: function (t) { return t * t * t * (10 + t * (-15 + 6 * t)); },
  /* House curves. */
  standard: cubicBezier(0.2, 0, 0, 1),
  emphasized: cubicBezier(0.3, 0, 0, 1),
  smooth: cubicBezier(0.65, 0, 0.35, 1),
  glide: cubicBezier(0.45, 0, 0.2, 1),
  settle: cubicBezier(0.16, 1, 0.3, 1)
};

/* Damped spring step response, x(0)=0 -> 1. `p` is seconds since start. */
function spring(p, freq, damping) {
  if (p <= 0) return 0;
  var w = 2 * Math.PI * (freq || 2.4), z = damping == null ? 0.42 : damping;
  if (z >= 1) return 1 - Math.exp(-w * p) * (1 + w * p);
  var wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * p) * (Math.cos(wd * p) + (z * w / wd) * Math.sin(wd * p));
}

/* Deterministic random. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash01(n) {
  var x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/* ---------- color ---------- */
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(c) {
  function p(v) { v = Math.round(clamp(v, 0, 255)); return (v < 16 ? '0' : '') + v.toString(16); }
  return '#' + p(c[0]) + p(c[1]) + p(c[2]);
}
function rgba(hex, a) {
  var c = hexToRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : +a.toFixed(4)) + ')';
}
function srgbToLin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function linToSrgb(v) { v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return v * 255; }
function rgbToOk(c) {
  var r = srgbToLin(c[0]), g = srgbToLin(c[1]), b = srgbToLin(c[2]);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function okToRgb(o) {
  var l = o[0] + 0.3963377774 * o[1] + 0.2158037573 * o[2];
  var m = o[0] - 0.1055613458 * o[1] - 0.0638541728 * o[2];
  var s = o[0] - 0.0894841775 * o[1] - 1.2914855480 * o[2];
  l = l * l * l; m = m * m * m; s = s * s * s;
  return [linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
          linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
          linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
var _mixCache = {};
function mixOk(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  var k = a + b + (Math.round(t * 400));
  if (_mixCache[k]) return _mixCache[k];
  var A = rgbToOk(hexToRgb(a)), B = rgbToOk(hexToRgb(b));
  var out = rgbToHex(okToRgb([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]));
  _mixCache[k] = out;
  return out;
}
function lighten(hex, amt) { return mixOk(hex, '#ffffff', amt); }
function darken(hex, amt) { return mixOk(hex, '#000000', amt); }

/* ---------- brand + app tokens ---------- */
var C = {
  navy: '#192E49', cobalt: '#375CA0', wing: '#417499', sky: '#3E6DA9', amber: '#E3A12E',
  ink: '#22364d', muted: '#5f6f80', line: '#dde5ee', wash: '#f4f7fb', kicker: '#8a6414',
  glow: '#e8f0fa', dot: '#814850', slate: '#646e76', birdEye: '#eef4fc',
  /* app */
  appbar: '#192e49', appbarLine: '#0f1d31', page: '#eef1f5', rail: '#f4f7fb', border: '#d8dde4',
  setup: '#fafbfc', selBlue: '#1a5fb4', hoverBlue: '#4a90e2', tabBlue: '#1a5fb4',
  toolText: '#546372', btnText: '#303b47', btnBorder: '#cbd1d8',
  /* chart defaults (the shipped jewel palette) */
  east: '#2d5c94', west: '#902634', teal: '#5bb1ba', axis: '#222222'
};
var JEWEL = ['#2d5c94', '#902634', '#e18e4c', '#597b2f', '#faca59', '#32295e', '#5bb1ba', '#d35a80'];
var UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
var CHART_FONT = 'Helvetica, Arial, sans-serif';

function fnt(size, weight, family) {
  return (weight || 400) + ' ' + (+size.toFixed(2)) + 'px ' + (family || UI_FONT);
}

/* Text width cache: measuring is the priciest canvas call we make. */
var _twCache = {};
function textW(ctx, s, font) {
  var k = font + '|' + s;
  var v = _twCache[k];
  if (v == null) { ctx.font = font; v = ctx.measureText(s).width; _twCache[k] = v; }
  return v;
}
/* Width with CSS-style letter spacing (px per glyph gap). */
function spacedW(ctx, s, font, ls) { return textW(ctx, s, font) + ls * Math.max(0, s.length - 1); }
function fillSpaced(ctx, s, x, y, ls, align) {
  if (!ls) { ctx.textAlign = align || 'left'; ctx.fillText(s, x, y); return; }
  var w = spacedW(ctx, s, ctx.font, ls);
  var cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (var i = 0; i < s.length; i++) {
    ctx.fillText(s[i], cx, y);
    cx += textW(ctx, s[i], ctx.font) + ls;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  var rr = typeof r === 'number' ? [r, r, r, r] : r;
  var tl = Math.min(rr[0], w / 2, h / 2), tr = Math.min(rr[1], w / 2, h / 2),
      br = Math.min(rr[2], w / 2, h / 2), bl = Math.min(rr[3], w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
  ctx.closePath();
}

/* Points on a gentle arc between two points (for cursor and flight paths). */
function arcPoint(ax, ay, bx, by, t, bend) {
  var mx = (ax + bx) / 2, my = (ay + by) / 2;
  var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / d, ny = dx / d;
  var cx = mx + nx * d * (bend || 0), cy = my + ny * d * (bend || 0);
  var u = 1 - t;
  return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
}
