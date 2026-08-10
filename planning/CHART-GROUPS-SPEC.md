# Chart groups in the project rail: spec

Status: BUILT Jul 31 2026, and REVISED by Torry Aug 10 2026 (see "The one
structural decision" below, which he reversed). Requested after the design
discussion ("Yes, please spec it").

## The problem

A real analysis session accumulates documents faster than a flat list stays
readable. Torry's own test project carried 15 chart tabs; "the four
extinction charts" and "the three cue-induced ones" live shuffled together
in one undifferentiated rail. Below roughly eight documents grouping is
ceremony; above it, it is doing real cognitive work.

## The one structural decision

**Grouping is a RAIL concept only. Tabs stay flat and dumb.**

Every app that mixes a hierarchical organizer with a flat switcher picks one
surface to be smart (Slack sections over a flat channel list, Figma pages
over a flat frame bar). The tab strip, Alt+number, Cmd/Ctrl+W, the recents
list, and every keyboard path keep exactly their current meaning: document
order, no group awareness. Collapsing a group hides nothing from the tab
strip. This single cut removes most of the confusion risk and nearly all of
the implementation risk.

Corollary: **one level deep, no nesting.** Two levels in a stats tool is
where people lose charts instead of finding them.

### REVISED Aug 10 2026 by Torry: a group is a SPACE

He used the shipped feature and asked for the opposite of the paragraph
above. "When you make a new group for charts, the tabs should only be
visible for the group that is currently selected. All ungrouped charts
should be in their own space."

So the strip shows the charts of the group the active chart belongs to and
nothing else, and the ungrouped charts are a space of their own, the one
with no name. The rail becomes the space switcher, which it was always
shaped like. The reasoning that produced the original cut still holds
(pick ONE smart surface), it just picked the wrong one for a strip that
was already showing 15 tabs. Figma is the closer analogue after all, where
choosing a page swaps the frame bar wholesale.

What follows from it, all built:

- Alt+number keeps meaning "the nth tab I can see", which now scopes for
  free (it already read the strip rather than `PROJECT.charts`).
- A tab drag reorders inside the visible space and leaves every other
  group's charts at the index they held (`moveChartToTabSlot`). The rail's
  own drag still means the whole list, because it can drop a chart beside
  a row of a different group.
- A new chart is born in the space you are looking at, or adding one would
  swap the strip out from under you.
- Closing a tab prefers a replacement in the same group, falling back to
  any chart when that was the group's last one.
- The strip names the space it is showing, since the rail is off to the
  side. Ungrouped wears no tag, so a project with no groups looks exactly
  as it always did.
- Layouts never group, so the Layouts strip stays flat.

Pinned by `chart-groups-check` case 11, and by case 2, which used to assert
the rule this section reverses.

## Data model (additive, migration-free)

- Each chart document MAY carry `group: "<name>"` (string). Absent or empty
  means ungrouped. Layouts never carry it (the rail's Layouts section is
  untouched by this feature).
- `PROJECT.ui.collapsedGroups: { "<name>": 1 }` remembers collapse state.
  UI state, not content: it ships in the project file like the rest of
  `PROJECT.ui`, and a missing map means all-expanded.
- Group identity IS the name. Renaming a group rewrites the `group` field on
  its members (one dataMark'd pass, one undo step). No separate group
  registry, no ids, no ordering table: groups render in first-member order,
  the same rule the level pickers use elsewhere.
- The project file stays **version 3**. Old files load because both fields
  are optional; new files opened by an OLD build simply show a flat rail
  (unknown fields ride along and survive a round-trip, which
  `applySnapshot`/`persist` already guarantee for `PROJECT.ui`).

## Rail behavior (`syncProjectNavigator`, ps-shell.js ~14652)

The existing `group(label, wantLayout, icon)` helper already renders the two
hard sections. The Charts section generalizes:

1. Ungrouped charts render first, exactly as today. A project with no
   groups renders **byte-identically to the current rail**: no headers, no
   chrome, nothing to learn until the feature is used.
2. Then each group: a header row (name, count while collapsed, chevron),
   then its member charts indented by one icon width.
3. Header click toggles collapse. Collapse hides member ROWS only; the
   active chart's tab, keyboard order, and rendering are untouched. If the
   ACTIVE chart is inside a collapsed group, its group renders expanded-
   for-now (the pin auto-expand idiom from the Sigma panel folds).
4. Header context menu: Rename group, Ungroup (members keep their position,
   lose the label), Delete group and its charts (destructive: goes through
   the same undo-toast pattern as closeChart, never a confirm dialog).

## Getting charts into groups

Primary path: the EXISTING document context menu (`showDocumentContextMenu`,
~18050) gains one item:

    Move to group  >   New group...
                       ----------
                       Extinction
                       Cue-induced
                       ----------
                       Remove from group     (only while grouped)

"New group..." prompts inline in the rail (the rename-in-place idiom), never
a modal. The same submenu appears on the TAB context menu if tabs have one.

Secondary path, second iteration only if the menu feels slow in practice:
drag a rail row onto a header. The rail has NO drag today (only the tab
strip drags), so this is genuinely new gesture code with real collision
risk against row clicks, and the menu covers the need. Explicitly out of
scope for v1.

## What deliberately does NOT change

- Tab strip: flat, full set, current order, current drag.
- Alt+number: "the third tab a user can see" (t3-51 wording), unchanged.
- Adding a chart: lands ungrouped, always. No "active group" state to
  surprise anyone.
- Duplicate: the copy inherits the original's group (least surprising).
- Opening a data file (t4-67) resets documents; groups die with them, and
  the offer-back toast restores them since they ride the project snapshot.
- Layouts section: untouched. If groups earn their keep for charts, layouts
  can join later with the same field.
- jamovi and the engine: zero involvement. Shell-only.

## Edge cases, decided now

- Empty group (last member moved out): the group vanishes. No empty-folder
  state to manage; recreating it is two clicks.
- Name collision on rename/create: merge, after the same toast-with-undo a
  destructive action gets ("Merged into Extinction. Undo").
- Case: names compare case-insensitively for collision, display as typed.
- A `group` value that is only whitespace normalizes to ungrouped on load.
- Search/filter (if the rail ever gets one): matches inside collapsed
  groups auto-expand them for the duration of the filter, the pedagogy
  glossary pattern.

## Accessibility

Headers are buttons with `aria-expanded`; member lists get
`role="group"` + `aria-label` with the group name. Collapse is announced
through the existing polite live region. Arrow-key traversal of the rail
(if added later) treats headers as stops. axe-state-check gains a grouped
state; the AT checklist gains one VoiceOver walk of a grouped rail.

## Probes

New `chart-groups-check.mjs`:

1. Flat project renders zero group chrome (the byte-identical guarantee,
   asserted on innerHTML of the Charts section).
2. Move-to-group via the real context menu; rail shows header + indented
   member; tab strip order unchanged (the structural decision, pinned).
3. Collapse hides rows, count appears, active-chart auto-expand works.
4. Rename rewrites members in one undo step; collision merges with toast.
5. Round-trip: save project text, reload, groups + collapse state survive;
   a version-3 file WITHOUT the fields loads flat (backward), and a file
   WITH them survives a save from this build (forward).
6. Delete-group undo restores members and their group labels.
7. t4-67 interaction: opening a CSV over a grouped project resets clean;
   offer-back restores the grouped rail.

Plus one doclifecycle assertion that Alt+number ignores grouping.

## Size and sequencing

Roughly a day of shell work plus probes: the rail render change is small
because the section helper exists; the context-menu submenu is routine; the
cost centers are rename/merge/undo correctness and the probe suite. No
engine edit, no dist format change, no version bump.

Sequencing note: this lands AFTER the current field-report queue (find
popup rework, column-drag smoothness), and it pairs naturally with a rail
filter box if document counts keep growing; the spec above already defines
how filter and collapse interact.

## Open questions for Torry (none block the spec)

1. Should the TAB STRIP visually hint group membership (a 2px colored tick
   per group)? Cheap, but it is the first step onto the slope this spec
   deliberately avoids. Default: no.
2. Group colors at all? Default: no; names and position carry it.
3. Should "Delete group" offer keep-charts as the default action instead of
   delete-charts? Current spec: Ungroup and Delete are separate menu items,
   so both exist; Delete deletes.
