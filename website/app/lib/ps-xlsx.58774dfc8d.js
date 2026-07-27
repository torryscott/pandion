// Pandion Plots standalone - Excel .xlsx import (Tier 1 feature).
// Dependency-free: reuses PSOmv's ZIP central-directory reader +
// DecompressionStream, then walks the OOXML parts with the browser's
// DOMParser. Reads xl/workbook.xml (sheet names + relationship ids),
// xl/_rels/workbook.xml.rels (id -> worksheet part), xl/sharedStrings.xml,
// xl/styles.xml (number formats, for date detection), and each sheet's
// XML. Cell coverage: shared strings (t="s"), inline strings
// (t="inlineStr"), formula-cached strings (t="str"), booleans (t="b" ->
// TRUE/FALSE), errors (t="e" -> missing), and numbers - a number whose
// cell style carries a DATE number format converts from the Excel 1900
// serial to an ISO string. Formula cells arrive as their cached values.
// Output is one string matrix per non-empty sheet, ready for the shell's
// typed import preview. Keep this file ASCII (escapes only).

window.PSXlsx = (function () {
  "use strict";

  function parseXml(bytes) {
    var text = new TextDecoder("utf-8").decode(bytes);
    var doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror"))
      throw new Error("malformed XML inside the workbook");
    return doc;
  }
  // "BC12" -> 0-based column 54.
  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(String(ref || ""));
    if (!m) return -1;
    var n = 0;
    for (var i = 0; i < m[1].length; i++)
      n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  // Excel's builtin date/time number-format ids.
  var DATE_BUILTIN = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1,
                       21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };
  // A custom format code is date-like when, outside quoted literals and
  // [] sections, it uses day/month/year/hour/second tokens.
  function isDateFormatCode(code) {
    var bare = String(code || "")
      .replace(/"[^"]*"/g, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\\./g, "");
    return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare);
  }
  // Excel 1900 date system: epoch 1899-12-30 (the system absorbs the
  // fictional 1900-02-29 for serials >= 61; day-level accuracy is what
  // a data import needs). 25569 = days from 1899-12-30 to 1970-01-01.
  function serialToIso(v) {
    var ms = Math.round((v - 25569) * 86400000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return String(v);
    function p2(x) { return (x < 10 ? "0" : "") + x; }
    var iso = d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" +
      p2(d.getUTCDate());
    var frac = v - Math.floor(v);
    if (frac > 1e-9)
      iso += " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) +
        ":" + p2(d.getUTCSeconds());
    return iso;
  }
  function textOf(el) {
    // Concatenate every <t> descendant (rich-text runs split strings).
    var ts = el.getElementsByTagName("t");
    if (!ts.length) return el.textContent || "";
    var out = "";
    for (var i = 0; i < ts.length; i++) out += ts[i].textContent || "";
    return out;
  }

  async function parse(arrayBuffer, fileName) {
    var entries = await window.PSOmv.unzip(arrayBuffer);
    if (!entries["xl/workbook.xml"])
      throw new Error("this ZIP is not an Excel .xlsx workbook");
    var wb = parseXml(entries["xl/workbook.xml"]);

    var relMap = {};
    if (entries["xl/_rels/workbook.xml.rels"]) {
      var rels = parseXml(entries["xl/_rels/workbook.xml.rels"])
        .getElementsByTagName("Relationship");
      for (var ri = 0; ri < rels.length; ri++)
        relMap[rels[ri].getAttribute("Id")] = rels[ri].getAttribute("Target");
    }

    var shared = [];
    if (entries["xl/sharedStrings.xml"]) {
      var sis = parseXml(entries["xl/sharedStrings.xml"])
        .getElementsByTagName("si");
      for (var si = 0; si < sis.length; si++) shared.push(textOf(sis[si]));
    }

    // Style index -> is-a-date-format.
    var dateXf = [];
    if (entries["xl/styles.xml"]) {
      var styles = parseXml(entries["xl/styles.xml"]);
      var custom = {};
      var fmts = styles.getElementsByTagName("numFmt");
      for (var fi = 0; fi < fmts.length; fi++)
        custom[fmts[fi].getAttribute("numFmtId")] =
          isDateFormatCode(fmts[fi].getAttribute("formatCode"));
      var xfsRoot = styles.getElementsByTagName("cellXfs")[0];
      if (xfsRoot) {
        var xfs = xfsRoot.getElementsByTagName("xf");
        for (var xi = 0; xi < xfs.length; xi++) {
          var id = Number(xfs[xi].getAttribute("numFmtId") || 0);
          dateXf.push(DATE_BUILTIN[id] === 1 || custom[String(id)] === true);
        }
      }
    }

    var sheetEls = wb.getElementsByTagName("sheet");
    var sheets = [];
    for (var s = 0; s < sheetEls.length; s++) {
      var rid = sheetEls[s].getAttribute("r:id") ||
        sheetEls[s].getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id");
      var target = String(relMap[rid] || "");
      if (!target) continue;
      target = target.replace(/^\//, "");
      if (target.indexOf("xl/") !== 0) target = "xl/" + target;
      var bytes = entries[target];
      if (!bytes) continue;
      var doc = parseXml(bytes);
      var rowEls = doc.getElementsByTagName("row");
      var grid = [], maxCol = -1, nextRow = 0;
      for (var r = 0; r < rowEls.length; r++) {
        var rAttr = Number(rowEls[r].getAttribute("r"));
        var rowIdx = isFinite(rAttr) && rAttr >= 1 ? rAttr - 1 : nextRow;
        nextRow = rowIdx + 1;
        var cells = rowEls[r].getElementsByTagName("c");
        var nextCol = 0;
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          var ci = colIndex(cell.getAttribute("r"));
          if (ci < 0) ci = nextCol;
          nextCol = ci + 1;
          var t = cell.getAttribute("t") || "n";
          var out = "";
          if (t === "inlineStr") {
            out = textOf(cell);
          } else {
            var vEl = cell.getElementsByTagName("v")[0];
            var v = vEl ? vEl.textContent : "";
            if (t === "s") {
              out = shared[Number(v)] != null ? shared[Number(v)] : "";
            } else if (t === "str") {
              out = v;
            } else if (t === "b") {
              out = v === "1" ? "TRUE" : "FALSE";
            } else if (t === "e") {
              out = "";
            } else {
              var num = Number(v);
              if (v === "" || !isFinite(num)) out = "";
              else {
                var sIdx = Number(cell.getAttribute("s") || -1);
                out = (sIdx >= 0 && dateXf[sIdx]) ? serialToIso(num)
                  : String(num);
              }
            }
          }
          if (out === "") continue;
          if (!grid[rowIdx]) grid[rowIdx] = [];
          grid[rowIdx][ci] = out;
          if (ci > maxCol) maxCol = ci;
        }
      }
      if (maxCol < 0) continue;   // empty sheet
      var rows = [];
      for (var gr = 0; gr < grid.length; gr++) {
        var row = new Array(maxCol + 1);
        for (var gc = 0; gc <= maxCol; gc++)
          row[gc] = (grid[gr] && grid[gr][gc] != null) ? grid[gr][gc] : "";
        rows.push(row);
      }
      // Drop fully-empty trailing rows.
      while (rows.length &&
             rows[rows.length - 1].every(function (x) { return x === ""; }))
        rows.pop();
      if (rows.length)
        sheets.push({ name: sheetEls[s].getAttribute("name") ||
                      ("Sheet " + (s + 1)), rows: rows });
    }
    if (!sheets.length)
      throw new Error("no data found in this workbook");
    var base = String(fileName || "excel-data").replace(/\.[^.]+$/, "");
    return { name: base, sheets: sheets };
  }

  // Sheet rows -> TSV text for the shell's typed import preview. Cells
  // containing tabs, quotes, or line breaks use CSV-style quoting (the
  // shell's parser understands doubled quotes).
  function sheetToTsv(sheet) {
    var lines = [];
    for (var r = 0; r < sheet.rows.length; r++) {
      var out = [];
      for (var c = 0; c < sheet.rows[r].length; c++) {
        var v = String(sheet.rows[r][c] == null ? "" : sheet.rows[r][c]);
        if (/[\t\r\n"]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
        out.push(v);
      }
      lines.push(out.join("\t"));
    }
    return lines.join("\n");
  }

  return { parse: parse, sheetToTsv: sheetToTsv };
})();
