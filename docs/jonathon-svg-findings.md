# Reply 2 to Jonathon, after his three fixes

Draft only. Nothing sent. Claims verified against the branch source and measured live.

Section 3 below asserts Copy is clean. That is probe-verified across 19 targets and
confirmed by hand for the bar case. Re-test Copy in the rebuilt container before sending.

---

Hi Jonathon,

Thanks, that was fast. Pulled all three and rebuilt.

**1 works.** My chart svg wears `jmv-results-svg-content` now and the harvest finds it.

**4 works, and it's better than what I suggested.** Reopened a saved file and got a live
clickable chart immediately, with the stored svg still sitting there as the module-less
fallback.

**3 was mine, and it's fixed.** Saving, SVG export, PNG export and Copy are all clean now,
with a bar selected or hovered. You don't need to do anything here. One sibling case is
still open on my side, in case you trip over it: switch on my colour-blindness preview and
the export carries the simulated colours. Same cause, my fix to make.

Worth recording what it actually was, since it bears on 2. I was scrubbing hover state off
the clone with a hand-maintained table of "stash the old value, put it back". That table
had quietly drifted: 67 places in my chart arm a hover, and only 14 were stashing. So a
hovered bar came out clean and a hovered scatter point came out with its highlight ring
baked in, which is why my first report was confused about which formats were affected. It
was never really about the format.

The fix stopped being a list. The harvest now takes whatever is under the pointer and fires
each element's own `mouseleave` before cloning, then hands the hover straight back, all in
one synchronous task so nothing flickers on screen. Every hover site is covered by
construction, because every one of them already has a leave handler that knows how to undo
itself. I have a regression test over 19 hover targets across all seven chart types, and it
fails on the old build, which is the part I actually trust.

**2. Two stacked svgs is the better call, go with that rather than a hook.** It'll take me
a few weeks to be ready, since my chrome groups need moving into the overlay. Worth saying
that the hover problem I flagged as a blocker last time isn't one any more: my hover
effects still repaint the chart's own marks rather than drawing on top, but the leave
dispatch above handles that independently of how the layers are arranged. Two questions:

- Is it OK if my `querySelector` shadow on `jmv-results-svg` stays for now? If the harvest
  keeps keying strictly on the class, it comes straight out the day I ship a clean bottom
  svg.
- Can it be two overlays, one under the chart and one over? Two of my chrome groups paint
  behind the data. If it's class-driven I'd stack three svgs and mark only the middle one.
  (I have a third layer that paints between the data and the axes, which no external stack
  can express. That one's on me.)

**viewBox: mine, ignore it.** Looking again, the `0 0 W H` you bake when there's no
viewBox is the right default and I shouldn't have raised it. The only thing my exporter
does beyond that is start at a negative origin, to catch content dragged left of the
origin, and that's a quirk in how I handle horizontal overflow. I'll fix it my end.

Thanks again.

Torry
