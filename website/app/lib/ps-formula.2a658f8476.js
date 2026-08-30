// Pandion Plots standalone - the computed-variable FORMULA engine
// (Tier 1). A small spreadsheet-flavored language evaluated per row:
//
//   MEAN(pre, post)                       across columns: a scale score
//   (score - VMEAN(score)) / VSD(score)   against the whole column
//   LOG10(rt)
//   IF(condition == "Control", "baseline", "dosed")
//   BIN(score, 4)
//   COALESCE(post, pre)
//   IF(CONTAINS(LOWER(arm), "control"), "Control", "Treatment")
//
// Column references are bare identifiers (backtick-quote names with
// spaces: `reaction time`). Row-wise functions: ABS SQRT LN LOG10 EXP
// ROUND(x[,digits]) FLOOR CEILING IF(test, then, else) BIN(col, k).
// Row-wise STATISTICS across columns: MEAN SUM MIN MAX take two or
// more arguments and combine them within each row (a scale score, a
// total); the optional ignore_missing = 1 scores a row from the
// values it has.
// Text functions: TRIM UPPER LOWER LEN CONTAINS(text, part).
// Missing-value functions: ISMISSING(x) COALESCE(a, b, ...).
// Whole-column aggregates (one number over a column's valid values,
// the V prefix): VMEAN VSD VMEDIAN VMIN VMAX VSUM, plus N - the
// argument must be a plain column reference.
// Operators: + - * / ^, comparisons == != (or =) < <= > >=,
// logic AND OR NOT (also && || !), parentheses, unary minus, string
// literals in double quotes.
//
// WHY TWO MEANS (Aug 2026, Torry's novice question): the average of
// two columns is the commonest computed variable there is, and under
// the old vocabulary the obvious MEAN(pre, post) was an error while
// MEAN(score) silently meant the COLUMN mean - the reverse of jamovi,
// so the same formula gave different numbers in the two apps. Row-wise
// MEAN + whole-column VMEAN now matches jamovi name for name. Formulas
// saved under the old vocabulary are rewritten at project load
// (migrateVocabulary below; snapshot version 4 marks the rewrite).
//
// MISSING PROPAGATES: any missing input makes the result missing. The
// exceptions are the constructs that exist to break that chain.
// ISMISSING always answers 1 or 0, COALESCE returns the first
// argument that is there (stopping at it, so the rest is never
// evaluated), IF evaluates only the taken branch, and a row-wise
// statistic given ignore_missing = 1 scores the row from the values
// that are present (a row with nothing present stays missing). The
// text functions do still propagate, they simply read their input as
// text instead of coercing it to a number.
//
// Missing is the single sentinel null. There is no separate error
// value, so a formula that cannot compute a row and a row with no data
// deliberately look the same.
//
// Text notes. CONTAINS is case sensitive, so fold with LOWER rather
// than have it guess for you. TRIM removes the spaces at each end and
// collapses the runs inside, the spreadsheet meaning of the name; the
// app already trims each end as it reads a value into a column, so the
// run inside is the part TRIM is really for here. LEN reads a number
// as the text the grid shows.
//
// Function and aggregate names are case-insensitive; column names are
// exact. Keep this file ASCII (escapes only).

window.PSFormula = (function () {
  "use strict";

  // "raw" marks a function that is dispatched BEFORE evalFn's numeric
  // prologue, so it sees its arguments exactly as they arrive. Two
  // things need that. ISMISSING and COALESCE must survive a missing
  // input, because breaking the propagation chain is their whole job.
  // The text functions must see a string, where the prologue's toNum
  // would read every label as missing and bail.
  var ROW_FN = {
    ABS: { n: 1 }, SQRT: { n: 1 }, LN: { n: 1 }, LOG10: { n: 1 },
    EXP: { n: 1 }, ROUND: { n: 1, max: 2 }, FLOOR: { n: 1 },
    CEILING: { n: 1 }, IF: { n: 3 }, BIN: { n: 2 },
    ISMISSING: { n: 1, raw: 1 }, COALESCE: { n: 1, max: Infinity, raw: 1 },
    TRIM: { n: 1, raw: 1 }, UPPER: { n: 1, raw: 1 }, LOWER: { n: 1, raw: 1 },
    LEN: { n: 1, raw: 1 }, CONTAINS: { n: 2, raw: 1 },
    // The row-wise statistics (jamovi's MEAN family): two or more
    // columns or expressions combined WITHIN each row. stat marks them
    // for the ignore_missing named argument and the teaching arity
    // error below.
    MEAN: { n: 2, max: Infinity, stat: 1 },
    SUM: { n: 2, max: Infinity, stat: 1 },
    MIN: { n: 2, max: Infinity, stat: 1 },
    MAX: { n: 2, max: Infinity, stat: 1 }
  };
  // Whole-column aggregates wear jamovi's V prefix. N stays N: it
  // counts a column's values under both vocabularies.
  var AGG_FN = { VMEAN: 1, VSD: 1, VMEDIAN: 1, VMIN: 1, VMAX: 1,
                 VSUM: 1, N: 1 };

  // ---- did-you-mean. An error that names the fix is the difference
  // between a user carrying on and a user giving up, and this engine
  // has a small closed vocabulary, so the suggestions can be exact
  // rather than fuzzy guesses.
  //
  // Names from other tools that mean something this language has. A
  // user who types the name they already know should be pointed at
  // ours instead of being told the idea is unavailable. Only mappings
  // that give the SAME answer are listed; TRUNC is not FLOOR for
  // negatives and STARTSWITH is not CONTAINS, so neither is here.
  var FN_ALIAS = {
    LOG: "LOG10 for base 10, or LN for natural log",
    AVERAGE: "MEAN(a, b, ...) row by row, or VMEAN(column) for the whole column",
    AVG: "MEAN(a, b, ...) row by row, or VMEAN(column) for the whole column",
    SD: "VSD", STDEV: "VSD", "STDEV.S": "VSD", STDDEV: "VSD",
    VSTDEV: "VSD", MEDIAN: "VMEDIAN", VMED: "VMEDIAN", VN: "N",
    COUNT: "N", COUNTA: "N",
    TOTAL: "SUM(a, b, ...) row by row, or VSUM(column) for the whole column",
    LENGTH: "LEN", NCHAR: "LEN",
    ISBLANK: "ISMISSING", ISNULL: "ISMISSING", ISNA: "ISMISSING",
    ISEMPTY: "ISMISSING",
    IFNA: "COALESCE", IFERROR: "COALESCE", IFNULL: "COALESCE",
    NVL: "COALESCE",
    POWER: "the ^ operator, as in score ^ 2",
    CEIL: "CEILING", STRIP: "TRIM",
    SEARCH: "CONTAINS", FIND: "CONTAINS", INSTR: "CONTAINS",
    GREPL: "CONTAINS",
    UPPERCASE: "UPPER", TOUPPER: "UPPER",
    LOWERCASE: "LOWER", TOLOWER: "LOWER"
  };
  // Optimal string alignment distance, which is Levenshtein plus the
  // adjacent transposition ("MAEN" for "MEAN") that is the commonest
  // typo there is. Names are short, so the full matrix costs nothing.
  function editDistance(a, b) {
    var m = a.length, n = b.length, i, j;
    if (!m) return n;
    if (!n) return m;
    var d = [];
    for (i = 0; i <= m; i++) { d.push(new Array(n + 1)); d[i][0] = i; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++)
      for (j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(d[i][j - 1] + 1, d[i - 1][j] + 1,
                         d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) &&
            a.charAt(i - 2) === b.charAt(j - 1))
          v = Math.min(v, d[i - 2][j - 2] + 1);
        d[i][j] = v;
      }
    return d[m][n];
  }
  // The nearest name worth naming, or null. Deliberately tight. A
  // wrong suggestion is worse than none, because the user then chases
  // it. One edit buys a short name, two a longer one; ties keep the
  // first candidate, which is table order.
  function nearestName(query, candidates) {
    var q = String(query || ""), best = null, bestD = Infinity;
    var cap = q.length <= 3 ? 1 : 2;
    for (var i = 0; i < candidates.length; i++) {
      var d = editDistance(q, String(candidates[i]));
      if (d < bestD) { bestD = d; best = candidates[i]; }
    }
    return bestD <= cap ? best : null;
  }
  function didYouMeanFn(fname) {
    var hint = FN_ALIAS[fname] ||
      nearestName(fname, Object.keys(ROW_FN).concat(Object.keys(AGG_FN)));
    return hint ? ". Did you mean " + hint + "?" : "";
  }
  function didYouMeanVar(name, knownColumns) {
    var cols = knownColumns || [], i;
    var lower = String(name).toLowerCase();
    for (i = 0; i < cols.length; i++)
      if (String(cols[i]).toLowerCase() === lower && cols[i] !== name)
        return ". Did you mean " + cols[i] +
               "? Variable names are case sensitive.";
    var up = String(name).toUpperCase();
    if (ROW_FN[up] || AGG_FN[up])
      return ". " + up + " is a function name, so it needs brackets after it.";
    var near = nearestName(name, cols);
    return near ? ". Did you mean " + near + "?" : "";
  }

  function tokenize(src) {
    var toks = [], i = 0, s = String(src || "");
    while (i < s.length) {
      var ch = s[i];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
      if (ch >= "0" && ch <= "9" || (ch === "." && s[i + 1] >= "0" && s[i + 1] <= "9")) {
        var m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
        toks.push({ t: "num", v: Number(m[0]) });
        i += m[0].length; continue;
      }
      if (ch === '"') {
        var j = i + 1, str = "";
        while (j < s.length && s[j] !== '"') { str += s[j]; j++; }
        if (j >= s.length) throw new Error("unclosed string");
        toks.push({ t: "str", v: str });
        i = j + 1; continue;
      }
      if (ch === "`") {
        var j2 = i + 1, name = "";
        while (j2 < s.length && s[j2] !== "`") { name += s[j2]; j2++; }
        if (j2 >= s.length) throw new Error("unclosed backtick name");
        if (!name) throw new Error("empty backtick name");
        toks.push({ t: "ident", v: name });
        i = j2 + 1; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var m2 = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
        var word = m2[0], up = word.toUpperCase();
        if (up === "AND" || up === "OR" || up === "NOT")
          toks.push({ t: "op", v: up.toLowerCase() });
        else toks.push({ t: "ident", v: word });
        i += word.length; continue;
      }
      var two = s.slice(i, i + 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=" ||
          two === "&&" || two === "||") {
        toks.push({ t: "op", v: two === "&&" ? "and" : two === "||" ? "or"
                    : two === "==" ? "=" : two });
        i += 2; continue;
      }
      if ("+-*/^()<>,=!".indexOf(ch) !== -1) {
        toks.push({ t: "op", v: ch === "!" ? "not" : ch });
        i++; continue;
      }
      throw new Error("unexpected character \"" + ch + "\"");
    }
    return toks;
  }

  // Pratt parser -> AST.
  function parseTokens(toks) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expectOp(v) {
      var tk = next();
      if (!tk || tk.t !== "op" || tk.v !== v)
        throw new Error("expected \"" + v + "\"");
    }
    var BINARY = {
      "or": 1, "and": 2,
      "=": 4, "!=": 4, "<": 4, "<=": 4, ">": 4, ">=": 4,
      "+": 5, "-": 5, "*": 6, "/": 6, "^": 8
    };
    function parseExpr(minBp) {
      var tk = next();
      if (!tk) throw new Error("unexpected end of formula");
      var left;
      if (tk.t === "num") left = { k: "num", v: tk.v };
      else if (tk.t === "str") left = { k: "str", v: tk.v };
      else if (tk.t === "ident") {
        if (peek() && peek().t === "op" && peek().v === "(") {
          var fname = tk.v.toUpperCase();
          next();   // (
          var args = [], ignoreMissing = null;
          // jamovi's named argument, accepted anywhere in the list:
          // ignore_missing = 1 (or 0). Recognized by NAME before the
          // expression parser runs, so it can never be misread as a
          // comparison against a column called ignore_missing.
          var parseOneArg = function () {
            var t1 = peek(), t2 = toks[pos + 1];
            if (t1 && t1.t === "ident" &&
                t1.v.toUpperCase() === "IGNORE_MISSING" &&
                t2 && t2.t === "op" && t2.v === "=") {
              pos += 2;
              var vt = next();
              if (!vt || vt.t !== "num" || (vt.v !== 0 && vt.v !== 1))
                throw new Error("ignore_missing takes 0 or 1");
              ignoreMissing = vt.v === 1;
              return;
            }
            args.push(parseExpr(0));
          };
          if (!(peek() && peek().t === "op" && peek().v === ")")) {
            parseOneArg();
            while (peek() && peek().t === "op" && peek().v === ",") {
              next(); parseOneArg();
            }
          }
          expectOp(")");
          var statSpec = ROW_FN[fname] && ROW_FN[fname].stat;
          if (ignoreMissing !== null && !statSpec)
            throw new Error("ignore_missing only applies to the row-wise " +
              "statistics MEAN, SUM, MIN and MAX");
          if (AGG_FN[fname]) {
            if (args.length !== 1 || args[0].k !== "col")
              throw new Error(fname + "() takes one column name");
            left = { k: "agg", fn: fname, col: args[0].name };
          } else if (ROW_FN[fname]) {
            var spec = ROW_FN[fname];
            var lo = spec.n, hi = spec.max || spec.n;
            // The teaching error for the commonest confusion: a
            // row-wise statistic handed ONE column. A bare "takes 2 or
            // more arguments" would explain the syntax without
            // revealing the concept, so name the whole-column form the
            // user probably wants, with their own column in it.
            if (spec.stat && args.length === 1) {
              var argName = args[0].k === "col" ? args[0].name : "column";
              throw new Error(fname + "(a, b, ...) works ACROSS columns, " +
                "row by row, so it needs at least two. For the " +
                (fname === "MEAN" ? "average" : fname === "SUM" ? "total"
                  : fname === "MIN" ? "smallest value" : "largest value") +
                " of the whole column, use V" + fname + "(" + argName + ")");
            }
            if (args.length < lo || args.length > hi)
              throw new Error(fname + "() takes " +
                (hi === Infinity ? lo + " or more"
                  : lo === hi ? String(lo) : lo + "-" + hi) + " argument" +
                (hi === 1 ? "" : "s"));
            if (fname === "BIN" && args[0].k !== "col")
              throw new Error("BIN() takes a column name first");
            left = { k: "fn", fn: fname, args: args };
            if (statSpec && ignoreMissing) left.ig = 1;
          } else {
            throw new Error("unknown function " + fname + "()" +
              didYouMeanFn(fname));
          }
        } else {
          left = { k: "col", name: tk.v };
        }
      } else if (tk.t === "op" && tk.v === "(") {
        left = parseExpr(0);
        expectOp(")");
      } else if (tk.t === "op" && tk.v === "-") {
        left = { k: "neg", a: parseExpr(7) };
      } else if (tk.t === "op" && tk.v === "not") {
        left = { k: "not", a: parseExpr(3) };
      } else {
        throw new Error("unexpected \"" + tk.v + "\"");
      }
      for (;;) {
        var op = peek();
        if (!op || op.t !== "op" || !(op.v in BINARY)) break;
        var bp = BINARY[op.v];
        if (bp <= minBp) break;
        next();
        // ^ is right-associative.
        var right = parseExpr(op.v === "^" ? bp - 1 : bp);
        left = { k: "bin", op: op.v, a: left, b: right };
      }
      return left;
    }
    var ast = parseExpr(0);
    if (pos < toks.length)
      throw new Error("unexpected \"" + toks[pos].v + "\" after the formula");
    return ast;
  }

  function collectRefs(ast, out) {
    if (!ast) return out;
    if (ast.k === "col") out[ast.name] = 1;
    if (ast.k === "agg" || (ast.k === "fn" && ast.fn === "BIN" && ast.args))
      out[ast.k === "agg" ? ast.col : ast.args[0].name] = 1;
    if (ast.a) collectRefs(ast.a, out);
    if (ast.b) collectRefs(ast.b, out);
    if (ast.args) for (var i = 0; i < ast.args.length; i++)
      collectRefs(ast.args[i], out);
    return out;
  }

  function validNumbers(values) {
    var out = [];
    for (var i = 0; i < values.length; i++)
      if (typeof values[i] === "number" && isFinite(values[i]))
        out.push(values[i]);
    return out;
  }
  function aggregate(fn, values) {
    var v = validNumbers(values), n = v.length, i, s;
    if (fn === "N") return n;
    if (!n) return null;
    if (fn === "VSUM") { s = 0; for (i = 0; i < n; i++) s += v[i]; return s; }
    if (fn === "VMEAN") { s = 0; for (i = 0; i < n; i++) s += v[i]; return s / n; }
    if (fn === "VMIN") return Math.min.apply(null, v);
    if (fn === "VMAX") return Math.max.apply(null, v);
    if (fn === "VMEDIAN") {
      var sorted = v.slice().sort(function (a, b) { return a - b; });
      var mid = Math.floor(n / 2);
      return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    if (fn === "VSD") {
      if (n < 2) return null;
      var m = 0; for (i = 0; i < n; i++) m += v[i];
      m /= n;
      var ss = 0; for (i = 0; i < n; i++) ss += (v[i] - m) * (v[i] - m);
      return Math.sqrt(ss / (n - 1));
    }
    return null;
  }

  function toNum(v) {
    return (typeof v === "number" && isFinite(v)) ? v : null;
  }
  // R-consistent rounding (Torry's ruling, Aug 2026: same formula, same
  // number in Pandion and jamovi). R >= 4.0 rounds to whichever of the
  // two representable candidates at the requested digit is CLOSER, with
  // an exact tie going to the even scaled value - which is also why
  // round(2.675, 2) is 2.67 there: 2.675 is stored a hair below the
  // true half. The old Math.round was half-up, and on negatives rounds
  // half toward +infinity, which matched neither R nor Excel
  // (Math.round(-1.5) = -1; both of them say -2).
  function rRound(x, d) {
    var p = Math.pow(10, d);
    if (!isFinite(p) || p === 0) return x;
    var f = Math.floor(x * p);
    var lo = f / p, hi = (f + 1) / p;
    if (!isFinite(lo) || !isFinite(hi)) return x;
    if (lo === hi || x === lo) return lo;
    var dl = x - lo, dh = hi - x;
    if (dl < dh) return lo;
    if (dh < dl) return hi;
    return (f % 2 === 0) ? lo : hi;   // exact tie: even scaled candidate
  }
  // Text form of a value, for the string functions. A number uses the
  // same 10-significant-digit rounding the shell writes into a cell, so
  // LEN and UPPER read the number the grid is showing rather than a
  // longer float that only ever existed inside the engine.
  function toStr(v) {
    if (v == null) return null;
    if (typeof v === "number")
      return isFinite(v) ? String(Number(v.toPrecision(10))) : null;
    return String(v);
  }
  // TRIM in the spreadsheet sense, both ends and the runs inside.
  function trimText(s) {
    return String(s).trim().replace(/\s+/g, " ");
  }
  function evalNode(ast, row, env) {
    switch (ast.k) {
      case "num": return ast.v;
      case "str": return ast.v;
      case "col": {
        var colv = env.columns[ast.name];
        if (!colv) return null;
        var v = colv[row];
        return v == null ? null : v;
      }
      case "neg": {
        var a = toNum(evalNode(ast.a, row, env));
        return a == null ? null : -a;
      }
      case "not": {
        var nb = evalNode(ast.a, row, env);
        if (nb == null) return null;
        return nb ? 0 : 1;
      }
      case "agg": {
        var key = ast.fn + ":" + ast.col;
        return env.agg[key] == null ? null : env.agg[key];
      }
      case "fn": return evalFn(ast, row, env);
      case "bin": return evalBinary(ast, row, env);
    }
    return null;
  }
  function evalBinary(ast, row, env) {
    var op = ast.op;
    if (op === "and" || op === "or") {
      var la = evalNode(ast.a, row, env);
      if (la == null) return null;
      var truthyA = la !== 0 && la !== "";
      if (op === "and" && !truthyA) return 0;
      if (op === "or" && truthyA) return 1;
      var lb = evalNode(ast.b, row, env);
      if (lb == null) return null;
      return (lb !== 0 && lb !== "") ? 1 : 0;
    }
    var a = evalNode(ast.a, row, env);
    var b = evalNode(ast.b, row, env);
    if (a == null || b == null) return null;
    if (op === "=" || op === "!=") {
      var eq = (typeof a === "number" && typeof b === "number")
        ? a === b : String(a) === String(b);
      return (op === "=" ? eq : !eq) ? 1 : 0;
    }
    if (op === "<" || op === "<=" || op === ">" || op === ">=") {
      var na = toNum(a), nb2 = toNum(b);
      var cmp;
      if (na != null && nb2 != null) cmp = na - nb2;
      else cmp = String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
      return (op === "<" ? cmp < 0 : op === "<=" ? cmp <= 0
        : op === ">" ? cmp > 0 : cmp >= 0) ? 1 : 0;
    }
    var x = toNum(a), y = toNum(b);
    if (x == null || y == null) return null;
    var r;
    if (op === "+") r = x + y;
    else if (op === "-") r = x - y;
    else if (op === "*") r = x * y;
    else if (op === "/") r = y === 0 ? null : x / y;
    else if (op === "^") r = Math.pow(x, y);
    else return null;
    return (typeof r === "number" && isFinite(r)) ? r : null;
  }
  function evalFn(ast, row, env) {
    var fn = ast.fn;
    if (fn === "IF") {
      var test = evalNode(ast.args[0], row, env);
      if (test == null) return null;
      return evalNode(ast.args[test !== 0 && test !== "" ? 1 : 2], row, env);
    }
    if (fn === "BIN") {
      var col = ast.args[0].name;
      var v = toNum(evalNode(ast.args[0], row, env));
      var k = toNum(evalNode(ast.args[1], row, env));
      if (v == null || k == null || k < 2) return null;
      k = Math.round(k);
      var lo = env.agg["VMIN:" + col], hi = env.agg["VMAX:" + col];
      if (lo == null || hi == null) return null;
      if (hi === lo) return "bin 1";
      var idx = Math.floor((v - lo) / (hi - lo) * k);
      if (idx >= k) idx = k - 1;
      if (idx < 0) idx = 0;
      return "bin " + (idx + 1);
    }
    // The row-wise statistics: combine the arguments WITHIN this row.
    // ignore_missing = 1 (ast.ig) scores the row from the values that
    // are present; the default is the language's propagation law, and
    // a row with nothing present stays missing either way.
    if (ROW_FN[fn] && ROW_FN[fn].stat) {
      var vals = [], vi, vv;
      for (vi = 0; vi < ast.args.length; vi++) {
        vv = toNum(evalNode(ast.args[vi], row, env));
        if (vv == null) { if (!ast.ig) return null; }
        else vals.push(vv);
      }
      if (!vals.length) return null;
      var acc = vals[0];
      for (vi = 1; vi < vals.length; vi++) {
        if (fn === "MIN") acc = Math.min(acc, vals[vi]);
        else if (fn === "MAX") acc = Math.max(acc, vals[vi]);
        else acc += vals[vi];
      }
      return fn === "MEAN" ? acc / vals.length : acc;
    }
    // Everything from here down null-propagates by construction, so the
    // functions that must not go through toNum are dispatched first.
    if (ROW_FN[fn] && ROW_FN[fn].raw) return evalRawFn(ast, row, env);
    var a = toNum(evalNode(ast.args[0], row, env));
    if (a == null) return null;
    if (fn === "ABS") return Math.abs(a);
    if (fn === "SQRT") return a < 0 ? null : Math.sqrt(a);
    if (fn === "LN") return a <= 0 ? null : Math.log(a);
    if (fn === "LOG10") return a <= 0 ? null : Math.log(a) / Math.LN10;
    if (fn === "EXP") { var e = Math.exp(a); return isFinite(e) ? e : null; }
    if (fn === "FLOOR") return Math.floor(a);
    if (fn === "CEILING") return Math.ceil(a);
    if (fn === "ROUND") {
      var d = ast.args[1] ? toNum(evalNode(ast.args[1], row, env)) : 0;
      if (d == null) return null;
      var rr = rRound(a, Math.round(d));
      return isFinite(rr) ? rr : null;
    }
    return null;
  }
  // The "raw" functions (see ROW_FN). ISMISSING and COALESCE are the
  // only two things in the language that survive a missing input. The
  // text functions still go missing when their input does; they just
  // read it as text on the way.
  function evalRawFn(ast, row, env) {
    var fn = ast.fn, i, v;
    if (fn === "ISMISSING")
      return evalNode(ast.args[0], row, env) == null ? 1 : 0;
    if (fn === "COALESCE") {
      for (i = 0; i < ast.args.length; i++) {
        v = evalNode(ast.args[i], row, env);
        if (v != null) return v;   // stops here, the rest is not evaluated
      }
      return null;
    }
    var s = toStr(evalNode(ast.args[0], row, env));
    if (s == null) return null;
    if (fn === "TRIM") return trimText(s);
    if (fn === "UPPER") return s.toUpperCase();
    if (fn === "LOWER") return s.toLowerCase();
    if (fn === "LEN") return s.length;
    if (fn === "CONTAINS") {
      var part = toStr(evalNode(ast.args[1], row, env));
      if (part == null) return null;
      return s.indexOf(part) === -1 ? 0 : 1;
    }
    return null;
  }

  function collectAggNeeds(ast, out) {
    if (!ast) return out;
    if (ast.k === "agg") out[ast.fn + ":" + ast.col] = { fn: ast.fn, col: ast.col };
    if (ast.k === "fn" && ast.fn === "BIN") {
      var c = ast.args[0].name;
      out["VMIN:" + c] = { fn: "VMIN", col: c };
      out["VMAX:" + c] = { fn: "VMAX", col: c };
    }
    if (ast.a) collectAggNeeds(ast.a, out);
    if (ast.b) collectAggNeeds(ast.b, out);
    if (ast.args) for (var i = 0; i < ast.args.length; i++)
      collectAggNeeds(ast.args[i], out);
    return out;
  }

  // Compile a formula against a set of known column names.
  // -> { ok:true, refs:[names], run(columns, n) -> values[] }
  // or { ok:false, error }
  function compile(formula, knownColumns) {
    var src = String(formula == null ? "" : formula);
    // The spreadsheet habit, and the one mistake the parser could only
    // report as a stray character. Say what this box actually wants.
    if (/^\s*=/.test(src)) {
      var rest = src.replace(/^\s*=+\s*/, "").replace(/\s+/g, " ").trim();
      if (rest.length > 40) rest = rest.slice(0, 40) + "...";
      return { ok: false, error: "formulas here are just the expression, " +
        "so remove the leading \"=\"" + (rest ? " (try " + rest + ")" : "") };
    }
    var ast;
    try { ast = parseTokens(tokenize(src)); }
    catch (e) { return { ok: false, error: String(e && e.message || e) }; }
    var refs = Object.keys(collectRefs(ast, {}));
    for (var i = 0; i < refs.length; i++) {
      if (knownColumns.indexOf(refs[i]) === -1)
        return { ok: false, error: "unknown variable \"" + refs[i] + "\"" +
          didYouMeanVar(refs[i], knownColumns) };
    }
    var aggNeeds = collectAggNeeds(ast, {});
    return {
      ok: true,
      refs: refs,
      run: function (columns, n) {
        var agg = {};
        for (var key in aggNeeds) {
          if (!Object.prototype.hasOwnProperty.call(aggNeeds, key)) continue;
          var need = aggNeeds[key];
          agg[key] = aggregate(need.fn, columns[need.col] || []);
        }
        var env = { columns: columns, agg: agg };
        var out = new Array(n);
        for (var r = 0; r < n; r++) {
          var v;
          try { v = evalNode(ast, r, env); } catch (e) { v = null; }
          out[r] = v;
        }
        return out;
      }
    };
  }

  // Rewrite column references when a variable is renamed (keeps saved
  // formulas working). Token-level, so strings and names-inside-words
  // are never touched; backticks the new name when it needs them.
  function renameRef(formula, oldName, newName) {
    var s = String(formula || ""), out = "", i = 0;
    var plain = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(newName) &&
      ["AND", "OR", "NOT"].indexOf(newName.toUpperCase()) === -1;
    var replacement = plain ? newName : "`" + newName + "`";
    while (i < s.length) {
      var ch = s[i];
      if (ch === '"') {
        var j = i + 1;
        while (j < s.length && s[j] !== '"') j++;
        out += s.slice(i, Math.min(j + 1, s.length));
        i = j + 1; continue;
      }
      if (ch === "`") {
        var j2 = i + 1;
        while (j2 < s.length && s[j2] !== "`") j2++;
        var name = s.slice(i + 1, j2);
        out += (name === oldName) ? replacement : s.slice(i, j2 + 1);
        i = j2 + 1; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
        var word = m[0];
        var isCall = s.slice(i + word.length).replace(/^\s+/, "")[0] === "(";
        out += (word === oldName && !isCall) ? replacement : word;
        i += word.length; continue;
      }
      out += ch; i++;
    }
    return out;
  }

  // Rewrite a formula saved under the pre-Aug-2026 vocabulary, where
  // MEAN SD MEDIAN MIN MAX SUM in call position were whole-column
  // aggregates. Unconditionally correct for such formulas: the old
  // parser accepted those names ONLY as one-column aggregates, so any
  // saved formula that ever worked means its V-form. The caller gates
  // on the project format version (snapshot v3 -> v4), never on
  // content. Token-level like renameRef: strings and backtick names
  // are never touched, and only a word followed by "(" is a call.
  var OLD_AGG = { MEAN: "VMEAN", SD: "VSD", MEDIAN: "VMEDIAN",
                  MIN: "VMIN", MAX: "VMAX", SUM: "VSUM" };
  function migrateVocabulary(formula) {
    var s = String(formula || ""), out = "", i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (ch === '"') {
        var j = i + 1;
        while (j < s.length && s[j] !== '"') j++;
        out += s.slice(i, Math.min(j + 1, s.length));
        i = j + 1; continue;
      }
      if (ch === "`") {
        var j2 = i + 1;
        while (j2 < s.length && s[j2] !== "`") j2++;
        out += s.slice(i, Math.min(j2 + 1, s.length));
        i = j2 + 1; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
        var word = m[0];
        var isCall = s.slice(i + word.length).replace(/^\s+/, "")[0] === "(";
        var up = word.toUpperCase();
        out += (isCall && OLD_AGG[up]) ? OLD_AGG[up] : word;
        i += word.length; continue;
      }
      out += ch; i++;
    }
    return out;
  }

  return { compile: compile, renameRef: renameRef,
           migrateVocabulary: migrateVocabulary };
})();
