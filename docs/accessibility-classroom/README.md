# Classroom accessibility acceptance pack

Prepared September 10, 2026 for Pandion Plots 3.1.1. **No human acceptance
session is recorded yet.** Intended delivery is a mix of browser and jamovi;
browser is the proposed fallback if the installed jamovi workflow cannot be
made usable. Neither edition is accepted merely by being listed here.

Use the same [assignment](assignment.md) and [synthetic CSV](classroom.csv)
in both editions. The [answer key](answer-key.md) gives independently
checkable values. Copy the [session record](session-record.md) for each
edition/platform and preserve failures as well as successes. This small
assignment is a starting point; add every chart family and submission format
that the real course requires before accepting the course workflow.

## First sessions

The instructor and university accessibility office should choose the actual
supported browser, operating system, screen reader and PDF reader versions.
Use an experienced operator of that assistive technology, ideally including
disabled participants. Ask for permission before recording; store no disability
or other personal details in this public repository. No administrator account
is needed to read this pack or run the browser assignment. For jamovi, use an
already installed or university-provided environment if this machine cannot
install it.

| Session | What to exercise | Current status |
| --- | --- | --- |
| Browser, keyboard only | Complete tasks C01–C09 with pointer put aside; record discovery, focus and recovery | Pending human session |
| Browser, supported Windows screen reader and browser | Complete tasks using the operator's normal settings; include data entry, results, file picker and downloaded output | Pending platform selection and session |
| Browser, macOS VoiceOver and Safari | Same tasks; record exact installed versions, interaction modes, speech and focus | Pending human session; automated WebKit is not this session |
| Installed jamovi, each supported OS/screen reader | Complete tasks through native data editor, analysis controls, results frame and save/reopen | Pending; R-generated hosts only cover chart content |
| Low vision, each required edition | Real browser zoom/magnification, visible focus, text spacing and high-contrast preferences; compare final chart with the answer key | Pending human session; sampled automated reflow passed |
| PDF reader and LMS | Read and submit exported work, then reopen the uploaded artifact in the actual course environment | Pending; PDF structure has automated evidence |
| Electron desktop, if assigned | Installation/start, native file dialogs, same assignment, saved files and host navigation | Pending; shared web code is insufficient evidence |

Do not require every student to test every technology. Select combinations
that represent the university's supported delivery and add others where a
student's access needs require them. Voice input and braille belong in the
matrix when relevant; they are not implicitly passed by a screen-reader run.

## How to run and judge a session

Give the participant the assignment, dataset and ordinary product help. Keep
the answer key with the evaluator until answers are recorded. Let the operator
choose their usual keyboard/AT commands. Observe without coaching at first.
If they ask for help, record the barrier and the help provided, then continue
so later tasks still get evaluated. A developer moving focus, naming an
otherwise undiscoverable control, or completing a step is assisted evidence.

For each task, record **independent pass**, **assisted**, **blocked**, or
**not tested**. A pass means the participant can discover and operate the
controls, obtain the information needed to answer correctly, recover without
losing work, and complete the same learning objective without unreasonable
extra effort. Record time and retries as observations; do not impose an
arbitrary speed cutoff or count coached completion as an independent pass.

If something fails, record the exact entry point, action, expected and actual
speech/focus or visible result, artifact/version, and smallest reproducer.
Distinguish Pandion controls, jamovi's surrounding interface, browser/OS file
dialogs, PDF reader and LMS. Route an upstream defect to its owner without
removing it from the delivered workflow's open issues.

## Browser fallback decision

1. Test the same required assignment in browser and installed jamovi. Keep
   separate outcomes; there is no combined platform pass.
2. Fix Pandion barriers and retest affected tasks. For a jamovi host barrier,
   identify whether a supported configuration or upstream correction resolves it.
3. If jamovi remains blocked, accept browser delivery only after that browser
   route independently passes the required tasks with the university's users
   and technology. The instructor must verify equivalent learning objectives,
   usable course instructions and access to required data and submission formats.
4. Give the supported route to students before the assignment. Do not discover
   during assessment that an alternative requires instructor-only steps or
   unavailable installations. If both routes are blocked, that workflow is not
   ready for required use under this acceptance plan.

Keep A11Y-02 open: default chart contrast has a confirmed gap. Palette changes
are deferred by the owner. A successful text/table task does not erase that
gap or establish visual accessibility of the figure. Review the assigned chart
configuration and required non-color cues as part of acceptance.

This is an engineering acceptance plan, not an Accessibility Conformance
Report or a legal determination. Combine task evidence with the
[criterion matrix](../WCAG21-AA-AUDIT-MATRIX-2026-09-09.md) and remaining expert
review. W3C recommends combining user evaluation with standards evaluation;
neither alone is a complete assessment.
[W3C: involving users](https://www.w3.org/WAI/test-evaluate/involving-users/)
