# Note for the session working on on-chart text rotation

Reported by Torry, Aug 6 2026. Recorded here only; NOT acted on in the
session that wrote this file (that session was doing the website release).

**What works:** clicking the rotation handle and dragging rotates the handle
and the text together.

**The bug:** the selection BOX does not rotate with the text. The dashed
selection rectangle stays axis-aligned while the glyphs turn inside it, so a
rotated label sits diagonally across an upright box (see Torry's screenshot:
"Text" at roughly -45 degrees inside a level dashed rectangle).

**Expected:** dragging the rotation handle should rotate the text and its
selection box together, as one object.

Likely area: the editable-text selection indicator / drag-handle drawing in
`inst/widget/graphbuilder2.js` (the rotate handle path and whatever draws the
dashed selection rect for a registered editable text).
