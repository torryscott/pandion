# Reply 2 to Jonathon, after his three fixes

Final version, ready to send. Incorporates Torry's edits (his voice: "Thanks for doing
that", "3 works too", "right away") plus two fixes from the review pass: the doubled
"export ... exported files" wording, and the "bug or a feature" line, which invited
Jonathon to weigh in on a call that is Torry's to make. The exported file carries no
indication the colors are simulated (the "previewing" badge deliberately does not
export), which is why the heads-up stays but the framing is "mine to sort out".

All claims verified against the code Jul 31 2026: the 36-target hover probe backs the
"all clean" sentence, the CVD bake was reproduced directly (deuteranopia hexes in the
clone), the under-data chrome group is real and populated by default, and the shadow
patches querySelector only, matching exactly `svg` and `svg.jmv-results-svg-content`.

---

Hi Jonathon,

Thanks, that was fast. Pulled all three and rebuilt.

1 and 4 both work. Reopening a saved file gives me a live clickable chart right away, with
the stored svg sitting there as the module-less fallback. 4 is better than what I
suggested. Thanks for doing that.

3 works too. Saving, SVG export, PNG export and Copy are all clean now, even with a bar
selected or hovered. Nothing left for you there. One related case is still open on my
side, in case you trip over it while testing: switch on my color-blindness preview and the
exported file carries the simulated colors. Mine to sort out.

2 is the one I need from you. Two stacked svgs is the better call, go with that rather
than a hook. On my side that looks like re-parenting my chrome groups rather than a
rewrite, so I don't think I'd be the bottleneck. Two questions before you settle the
design:

* Can it be two overlays, one under the chart and one over? Some of my selection chrome is
  ordered behind the data, so halos for scatter points and fit lines draw underneath them.
  If it's class-driven I'd stack three svgs and mark only the middle one.

* What selector does the harvest key on, and does it ever use querySelectorAll? I'm
  shadowing querySelector on jmv-results-svg to hand it a sanitized clone, and anything my
  shadow doesn't match falls through to the live chart with the editing chrome still on
  it. Happy to keep the shadow until I ship a clean bottom svg, if that suits you.

viewBox: mine, ignore it. I shouldn't have raised it.

Thanks again,
Torry
