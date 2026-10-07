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

  // ---- writer -------------------------------------------------------
  // The app could READ xlsx and not write one, so a table that arrived
  // as Excel could not go back as Excel. CSV is not a substitute: our
  // CSV writer deliberately keeps the original strings so that 007
  // stays 007, and Excel then destroys that on open, turning it into 7
  // - and does the same to 1-5 and 3/4, which it reads as dates, and to
  // dot decimals in a comma-decimal locale, which it splits into extra
  // columns. In an xlsx the type is recorded in the file, so nothing is
  // guessed on open (Aug 2026, Torry).
  //
  // Dependency-free, like the reader. An xlsx is a ZIP of five small
  // XML parts, and ZIP entries may be STORED uncompressed, so no
  // compression is needed at all - just CRC32 and the headers. Strings
  // are written inline rather than through a shared-string table: a
  // little larger, much simpler, and Excel reads both.
  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    CRC_TABLE = t;
    return t;
  }
  function crc32(bytes) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++)
      c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function xmlEsc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // XML 1.0 forbids most control characters outright, and Excel
      // refuses to open a file that contains one, so they are dropped
      // rather than escaped.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }
  // 0 -> "A", 26 -> "AA". The inverse of colIndex above.
  function colName(i) {
    var out = "";
    i = i + 1;
    while (i > 0) {
      var r = (i - 1) % 26;
      out = String.fromCharCode(65 + r) + out;
      i = Math.floor((i - 1) / 26);
    }
    return out;
  }
  // Excel rejects these characters in a sheet name, and a blank name,
  // and anything past 31 characters.
  function safeSheetName(name) {
    var n = String(name == null ? "" : name)
      .replace(/[\\\/\?\*\[\]:]+/g, " ").replace(/\s+/g, " ").trim();
    if (!n) n = "Data";
    return n.substring(0, 31);
  }
  function sheetXml(rows) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      "<sheetData>"];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [], cells = "";
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        // A missing value is an ABSENT cell, not an empty string: that
        // is what makes Excel treat it as blank rather than as text.
        if (v == null || v === "") continue;
        var ref = colName(c) + (r + 1);
        if (typeof v === "number" && isFinite(v))
          cells += '<c r="' + ref + '"><v>' + v + "</v></c>";
        else
          cells += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
                   xmlEsc(v) + "</t></is></c>";
      }
      if (cells) out.push('<row r="' + (r + 1) + '">' + cells + "</row>");
    }
    out.push("</sheetData></worksheet>");
    return out.join("");
  }
  function zipStored(files) {
    var locals = [], central = [], offset = 0, i;
    // A fixed DOS timestamp keeps the output byte-stable, which makes
    // the file diffable and the probes exact. Excel does not care.
    var dosTime = 0, dosDate = 33;   // 1 Jan 1980, 00:00
    for (i = 0; i < files.length; i++) {
      var nameB = utf8(files[i].name), body = files[i].bytes;
      var crc = crc32(body);
      var lh = new Uint8Array(30 + nameB.length);
      var lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);                       // stored
      lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true);
      lv.setUint16(26, nameB.length, true); lv.setUint16(28, 0, true);
      lh.set(nameB, 30);
      locals.push(lh, body);
      var ch = new Uint8Array(46 + nameB.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true);
      cv.setUint16(28, nameB.length, true);
      cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
      ch.set(nameB, 46);
      central.push(ch);
      offset += lh.length + body.length;
    }
    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    var parts = locals.concat(central, [end]), total = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var buf = new Uint8Array(total), at = 0;
    for (i = 0; i < parts.length; i++) { buf.set(parts[i], at); at += parts[i].length; }
    return buf;
  }
  // rows: an array of arrays. A cell is a number (written as a number),
  // a string (written as text), or null / "" (written as no cell at all).
  function write(sheetName, rows) {
    var sheet = safeSheetName(sheetName);
    var NS = "http://schemas.openxmlformats.org/";
    var files = [
      { name: "[Content_Types].xml", bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="' + NS + 'package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        "</Types>") },
      { name: "_rels/.rels", bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>") },
      { name: "xl/workbook.xml", bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xmlEsc(sheet) + '" sheetId="1" r:id="rId1"/></sheets>' +
        "</workbook>") },
      { name: "xl/_rels/workbook.xml.rels", bytes: utf8(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        "</Relationships>") },
      { name: "xl/worksheets/sheet1.xml", bytes: utf8(sheetXml(rows)) }
    ];
    return zipStored(files);
  }

  return { parse: parse, sheetToTsv: sheetToTsv, write: write,
           colName: colName, safeSheetName: safeSheetName };
})();
