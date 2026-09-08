# Studio workspace

The desktop workspace keeps code above a resizable composition timeline. Either pane can expand and return to the split. A session remembers its open patterns, drawer, split size, and expansion. Pattern playback sits below the editor; composition playback sits above the ruler.

## Patterns

The × closes a view, preserving its code, clips, mappings, and pending takes. The top Patterns menu searches all project patterns and reopens them. Closing every tab shows an Open a pattern action. Delete pattern is a separate confirmed action and retains the existing final-pattern and pending-take safeguards.

## Sound selection

Click a sound token inside `s(...)` or `sound(...)` to open Sample library directly. The drawer floats over a dimmed, blurred workspace and selects the current sound. Search built-ins and local samples by their available names, descriptions, tags, and pack information. Preview auditions an alternative; Swap replaces only the pinned token, with one undoable edit. If the code changed while the drawer was open, select the destination again.

MIDI test routes connected controller notes to the selected library sound without editing code, learning mappings, or capturing a take. A small test keyboard supports pointer and keyboard input. Changing the selected sound, turning MIDI test off, losing window focus, disconnecting, or closing the drawer releases test voices. MIDI test is unavailable during an unresolved recording. The drawer restores focus on dismissal.

Opening the library from the header offers Insert instead of Swap. Add sounds contains the existing import, generation, and recording tools. A sample's options menu edits its label, description, and tags. Built-in descriptions are read-only.

## Timeline

Two handles on the ruler select the range; a separate playhead seeks. Range handles use the composition snap grid. Range options exposes numeric quarter-cycle precision and Use full composition. The default range spans the composition, with looping off.

Play starts at the playhead. Stop retains its position; Return moves it to the range start. Seeking while playing resumes on release using the existing compiled composition, preserving unapplied drafts. Range changes require stopped playback. Pending MIDI takes retain their original range until kept or discarded.

The ruler stays fixed during vertical scrolling. Track names remain opaque and fixed at the left during horizontal scrolling.

## MIDI

Click a note phrase and choose Play MIDI, or use the editor's Play MIDI action at the caret. The phrase auditions immediately. Capture notes explicitly records; Finish retains the take for Preview, Keep take, or Discard. Composition capture uses the timeline range and asks for a destination only if multiple clips are possible and none is selected. More take controls contains take history, solo, original comparison, output format, quantization, and code comparison.

Pending takes and accepted composition variations retain the existing recovery and undo behavior. Play MIDI without composition remains a secondary note action for isolated transcription and accompaniment controls.

## Verification

`workspace-polish.spec.ts` covers reversible tabs, direct sound replacement, audible preview and MIDI testing, range and playhead controls, sticky headers, MIDI recovery, and draft-safe seeking. Existing library, composition, completion, recording, and MIDI suites exercise the preserved workflows. Physical controller hardware still requires a manual walkthrough; browser tests exercise the MIDI event route and audible output with fixtures.
