# Reply 4 to Jonathon, the resize contract is delivered

Sent Aug 5 2026. Answers his request to add jmv-results-svg-selection so the
jamovi side can own image resizing. Confirms the class is live on the
svg-element-prototype branch (link included for the secondhand reader), that
the hidden harvest copy can never carry it, and that the engine follows an
external resize made either way jamovi might make one, width and height
attributes or an inline style size (what a CSS resize handle writes), with
the chart redrawn at the new size and the size persisted. Flags the three
things that would cost the implementer time unsaid (the svg is rebuilt on
every render so look it up rather than cache it, plot size clamps to 3 to 14
by 2 to 10 inches with over-drags pulled back, and it must be the svg itself
that is sized rather than a wrapper), and notes the module's own corner grip
will be hidden once the jamovi handle exists.

Every claim was verified against the pushed branch before sending, on both
bundles and end to end in the container (both sizing idioms committing
through jamovi's real option pipeline and surviving the analysis re-running).
An independent review pass on the draft was adjudicated first; its branch
correction was refuted with a blob-hash comparison against GitHub, its
CSS-wording tightening was accepted.

---

Hi Jonathon,

Done. The class is on the svg-element-prototype branch of my repo
(github.com/torryscott/pandion/tree/svg-element-prototype). The live chart
svg always wears jmv-results-svg-selection and the hidden harvest copy never
does, so a handle keyed on it will always land on the visible chart.

Damo can size that svg with its width and height attributes or with an
inline style size, which is what a CSS resize handle writes. Either way my
side follows, redraws at the new size, and persists it. Both paths are
tested end to end in your container. Two things worth knowing on his side.
I rebuild that svg on every render, so it is better looked up than cached,
and I clamp plot size to 3 to 14 inches wide by 2 to 10 tall, pulling an
over-drag back to the limit. It does need to be the svg itself he sizes
rather than a wrapper around it.

My own corner grip is still there for now, and I will hide it once his
handle is in.

Thanks!
Torry
