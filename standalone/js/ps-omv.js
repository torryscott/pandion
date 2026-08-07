// Pandion Plots standalone - jamovi .omv import. An .omv is a ZIP holding
// metadata.json (dataSet.fields: name/columnType/dataType/measureType/type),
// xdata.json (per-column [code, label, ...] level tables, in level order),
// and data.bin (COLUMN-major cells in fields order; type "number" = 8-byte
// LE double with NaN as missing, everything else = 4-byte LE int32 with
// -2147483648 as missing; Text cells are int codes into xdata).
// Format verified byte-for-byte against real jamovi 2.7 files.
//
// Zero dependencies: the ZIP reader walks the central directory and
// inflates with the browser-native DecompressionStream("deflate-raw").
// Analyses inside the file (protobuf option blobs) are NOT imported -
// this brings in the DATASET: values, measure types, and level orders.
// Filter columns are skipped; computed columns arrive as their values.
// Keep this file ASCII (escapes only).

window.PSOmv = (function () {
  "use strict";

  var INT_NA = -2147483648;

  function u8(buf) {
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }
  async function inflateRaw(bytes) {
    var ds = new DecompressionStream("deflate-raw");
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    var out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  }

  // Minimal ZIP central-directory reader (no ZIP64 - .omv files are small).
  async function unzip(arrayBuffer) {
    var b = u8(arrayBuffer);
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // EOCD signature scan from the tail (comment can pad up to 64k).
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("not a ZIP archive (no end record)");
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF)
      throw new Error("ZIP64 archives are not supported");
    var td = new TextDecoder();
    var entries = {};
    var p = cdOff;
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50)
        throw new Error("bad ZIP central directory");
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
      // Local header carries its OWN name/extra lengths (they can differ
      // from the central directory's).
      var lNameLen = dv.getUint16(localOff + 26, true);
      var lExtraLen = dv.getUint16(localOff + 28, true);
      var dataStart = localOff + 30 + lNameLen + lExtraLen;
      var raw = b.subarray(dataStart, dataStart + compSize);
      if (method === 0) entries[name] = raw;
      else if (method === 8) entries[name] = await inflateRaw(raw);
      else throw new Error("unsupported ZIP compression method " + method);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  var MEASURE_MAP = { id: "id", nominal: "nominal", ordinal: "ordinal",
                      continuous: "continuous" };

  // -> { name, header, rows, types, levels, unmapped } for PS_SHELL adoption.
  async function parse(arrayBuffer, fileName) {
    var unmapped = [];
    var entries = await unzip(arrayBuffer);
    if (!entries["metadata.json"] || !entries["data.bin"])
      throw new Error("this ZIP is not a jamovi .omv file " +
                      "(metadata.json / data.bin missing)");
    var td = new TextDecoder();
    var meta = JSON.parse(td.decode(entries["metadata.json"]));
    var xdata = entries["xdata.json"]
      ? JSON.parse(td.decode(entries["xdata.json"])) : {};
    var ds = meta.dataSet || meta;
    var fields = ds.fields || [];
    var n = ds.rowCount || 0;
    var bin = entries["data.bin"];
    var dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);

    var header = [], types = {}, levels = {}, colVals = [];
    var missingByCol = {}, missingSkipped = [];
    var off = 0;
    for (var fi = 0; fi < fields.length; fi++) {
      var f = fields[fi];
      var isNum = f.type === "number";
      var size = isNum ? 8 : 4;
      if (off + size * n > bin.byteLength)
        throw new Error("data.bin is shorter than the metadata describes");
      if (f.columnType === "Filter") { off += size * n; continue; }
      var x = xdata[f.name];
      var labelOf = {};
      if (x && Array.isArray(x.labels))
        for (var li = 0; li < x.labels.length; li++)
          labelOf[x.labels[li][0]] = String(x.labels[li][1]);
      var vals = new Array(n);
      for (var r = 0; r < n; r++) {
        if (isNum) {
          var vd = dv.getFloat64(off + r * 8, true);
          vals[r] = isFinite(vd) ? String(vd) : "";
        } else {
          var vi = dv.getInt32(off + r * 4, true);
          if (vi === INT_NA) { vals[r] = ""; continue; }
          if (f.dataType === "Text")
            vals[r] = labelOf[vi] != null ? labelOf[vi] : "";
          else
            vals[r] = labelOf[vi] != null ? labelOf[vi] : String(vi);
        }
      }
      off += size * n;
      header.push(f.name);
      colVals.push(vals);
      // B9. MEASURE_MAP covers four keys and ANYTHING else fell through to
      // "continuous", so a column jamovi labelled with any other measure type
      // (or none) had every text label Number()d to null and read as entirely
      // missing - while the import reported success. adoptOMV also bypasses
      // the import preview, so there was no per-column select and no
      // correction surface. When the map misses, believe dataType instead:
      // Text is never continuous, and an unmapped type with value labels is
      // nominal by construction.
      var mt = MEASURE_MAP[String(f.measureType || "").toLowerCase()];
      if (!mt) {
        var dt = String(f.dataType || "").toLowerCase();
        var labelled = !!(x && Array.isArray(x.labels) && x.labels.length);
        mt = (dt === "text" || labelled) ? "nominal"
          : (dt === "integer" || dt === "decimal") ? "continuous"
          : "nominal";   // unknown and unlabelled: text is the safe reading
        unmapped.push(f.name + " (" + (f.measureType || "no measure type") +
                      " \u2192 " + mt + ")");
      }
      types[f.name] = mt;
      // jamovi's per-column missing rules. The app has exactly the right
      // field for these and was leaving it empty, so a value the sender had
      // declared missing arrived as ordinary data and was counted in the
      // mean. The rules are EXPRESSIONS ("== 1151"), while this app's
      // per-column list holds literal values, so only the equality form
      // translates. Everything else is carried out to be disclosed rather
      // than dropped in silence, which is the same answer the unmapped
      // measure types get above.
      if (Array.isArray(f.missingValues) && f.missingValues.length) {
        var lits = [];
        for (var mvi = 0; mvi < f.missingValues.length; mvi++) {
          var rule = String(f.missingValues[mvi]).trim();
          var eqm = /^==\s*(.+)$/.exec(rule);
          if (eqm) {
            var lit = eqm[1].trim().replace(/^(["'])(.*)\1$/, "$2");
            if (lit !== "" && lits.indexOf(lit) === -1) lits.push(lit);
          } else {
            missingSkipped.push(f.name + " (" + rule + ")");
          }
        }
        if (lits.length) missingByCol[f.name] = lits;
      }
      if (x && Array.isArray(x.labels) &&
          (types[f.name] === "nominal" || types[f.name] === "ordinal"))
        levels[f.name] = x.labels.map(function (L) { return String(L[1]); });
    }
    if (!header.length)
      throw new Error("no data columns found in this .omv file");
    var rows = new Array(n);
    for (var rr = 0; rr < n; rr++) {
      var row = new Array(header.length);
      for (var cc = 0; cc < header.length; cc++) row[cc] = colVals[cc][rr];
      rows[rr] = row;
    }
    var name = String(fileName || "jamovi-data").replace(/\.[^.]+$/, "");
    return { name: name, header: header, rows: rows,
             types: types, levels: levels, unmapped: unmapped,
             missingByCol: missingByCol, missingSkipped: missingSkipped };
  }

  return { parse: parse, unzip: unzip };
})();
