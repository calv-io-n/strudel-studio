# Studio workspace

The desktop workspace keeps code above a resizable composition timeline. Either pane can expand and return to the split. A session remembers its open patterns, drawer, split size, and expansion. A shared transport and project BPM sit in the top bar.

## Patterns

The × closes a view, preserving its code, clips, mappings, and pending takes. Search lists closed project patterns and reopens them; visible patterns stay in the tab strip. Closing every tab shows an Open a pattern action. Delete pattern is a separate confirmed action and retains the existing final-pattern and pending-take safeguards.

## Sound selection

Click a sound token inside `s(...)` or `sound(...)` to open Sample library directly. The drawer floats over a dimmed, blurred workspace and selects the current sound. Search built-ins and local samples by their available names, descriptions, tags, and pack information. Preview auditions an alternative; Swap replaces only the pinned token, with one undoable edit. If the code changed while the drawer was open, select the destination again.

MIDI test routes connected controller notes to the selected library sound without editing code, learning mappings, or capturing a take. A small test keyboard supports pointer and keyboard input. Changing the selected sound, turning MIDI test off, losing window focus, disconnecting, or closing the drawer releases test voices. MIDI test is unavailable during an unresolved recording. The drawer restores focus on dismissal.

Opening the library from Search offers Insert instead of Swap. Add sounds contains the existing import and recording tools. A sample's options menu edits its label, description, and tags. Built-in descriptions are read-only.

## Timeline

Two handles on the ruler select the range; a separate playhead seeks. Range handles use the composition snap grid. Range options exposes numeric beat positions and Use full composition. The default range spans the composition, with looping off.

Play starts at the playhead. Stop retains its position; Return moves it to the range start. Seeking while playing resumes on release using the existing compiled composition, preserving unapplied drafts. Range changes require stopped playback. Pending MIDI takes retain their original range until kept or discarded.

The ruler stays fixed during vertical scrolling. Track names remain opaque and fixed at the left during horizontal scrolling.

## MIDI

Click a visibly interactive `note()` name for Test MIDI, Record MIDI on pattern, Record MIDI solo, or unbind. Recording actions arm the shared Record bar and retain the clicked source phrase. Pattern mode accompanies with the complete tab; solo mode has no accompaniment. Press the top Record button to start, Stop to finish, then preview and Keep take in the same bar. Gray inline notes and timeline placeholders reflect capture state. Acceptance saves before publishing; failures retain work. Old clip-targeted recoveries retain their original placement semantics without a separate sheet.

Click or drag an inline slider to adjust its value. Its function-name menu owns bind/inspect/unbind; controller settings remain separate. The metronome is neutral gray off and gold enabled.


See [ADR 0009](../adr/0009-launch-timing-and-capture.md) for the action inventory, beat/source-window semantics, source-owned tempo overrides and explicit Quick Start preference. These launch decisions supersede the previous automatic Play MIDI routing.

## Verification

`followup.spec.ts`, `launch.spec.ts`, and `pages.spec.ts` cover reversible tabs, direct sound replacement, audible preview and MIDI testing, range and playhead controls, sticky headers, MIDI recovery, and draft-safe seeking. Existing library, composition, completion, recording, and MIDI suites exercise the preserved workflows. Physical controller hardware still requires a manual walkthrough; browser tests exercise the MIDI event route and audible output with fixtures.
