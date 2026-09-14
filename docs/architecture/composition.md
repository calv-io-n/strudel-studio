# Composition: as built

The [target design](../design/strudel-studio.md#composition) defines intended behavior. [ADR 0001](../adr/0001-expand-composition-tracks.md) records the decision to expand the initial two-lane scope.

## Stored state

[model.ts](../../studio/shared/model.ts) validates format v7. Projects have 1–16 ordered tracks with stable IDs, names, and mute flags; tabs have one of eight named colors. Clips reference a tab and track, carry their own mute flag, and store start/length in quarter-cycle increments. The selected grid and optional `soloTrackId` are persisted. Missing solo state in existing v3 projects means no isolation; dangling solo references are rejected. Start and length retain the 4096-cycle numeric limits; clips cannot overlap within a track, including muted clips.

V1 input first gains a tab and mapped slider ownership. V2 lanes 0/1 become Track 1/Track 2. Tabs receive palette colors in order and mute flags default to false. Validation rejects duplicate or missing IDs and dangling references. Autosave and session loading use this shared schema; existing code, anchors, mappings, slots, and session IDs survive migration.

## UI and placement

[main.ts](../../studio/client/main.ts) renders colored tabs and clips, opaque left-anchored track headers with a matching ruler corner, named clip selectors, color dialogs, and shared context actions. New tabs cycle through the palette; duplicates inherit their source color. Removing a populated track confirms removal of its clips. The selected track receives additions from Pattern actions. Selection is transient; tracks, colors, timing and mute state persist.

[composition.ts](../../studio/client/composition.ts) owns pointer and keyboard interaction. Primary-pointer movement crosses a five-pixel threshold, captures the pointer, and previews a candidate without changing saved state. A colored pointer badge identifies the source throughout the gesture; dragging a tab reveals Composition and highlights the destination. Cleanup removes all drag feedback on drop or cancellation. Existing clips preserve their grab offset and length during movement. Scrolling adjusts placement while dragging. Escape, cancellation, lost capture, session changes, or starting playback cancel the gesture.

[clips.ts](../../studio/shared/clips.ts) validates placement and calculates grid/edge snapping. Magnetic alignment considers both moving edges within eight screen pixels, prefers the closest valid candidate, and breaks ties toward earlier positions. Invalid releases preserve the original clip. Keyboard arrows move by the selected grid or between tracks; Shift+Left/Right trims the right edge; Alt+Left/Right trims the left edge. Numeric fields display one-based beat positions and beat durations, independent of the selected grid. Source offsets may be fractional source cycles after rate conversion.

## Playback and mute scheduling

[engine.ts](../../studio/client/engine.ts) compiles every referenced source pattern, including muted material, so unmuting never needs to compile drafts. [arrangement.ts](../../studio/shared/arrangement.ts) shifts clip queries into source-local time and back, clamps clip boundaries, and ignores code-defined clock setters. The source rate is `(tab.tempoBpm ?? project.bpm) / project.bpm`; source query time is `(timeline - start) * rate + sourceOffset`. Haps are mapped back by the inverse rate. Whole onsets remain before the clip boundary when trimming through a note; only its queried part is bounded, preventing a new attack at the trim point. Recorded takes bypass source rate and retain their seconds-based playback offsets.

`PatternTimeline` schedules Apply changes. `MuteTimeline` separately stores snapshots of effectively muted clip IDs (using the shared `isClipMuted` helper in [mix.ts](../../studio/shared/mix.ts)). Both queue at `floor(max(0, scheduler.lastEnd)) + 1`, replace changes aimed at the same boundary, and discard obsolete history as playback passes. The arrangement gates each query using the mute timeline. Queued code and mute changes therefore cannot overwrite each other. A toolbar message displays a pending mute boundary.

Stop clears pending feedback; the next Play resets mute scheduling from current saved settings. Standalone tab playback bypasses composition muting. Previously scheduled notes and effect tails may finish. The end cycle is computed from every clip, including muted clips; an entirely muted composition runs silently to that end.

## WAV export and validation

[export.ts](../../studio/client/export.ts) snapshots current project settings when rendering begins. [render.ts](../../studio/client/render.ts) applies both mute flags in an isolated offline audio context and queries fractional final spans while preserving the full arrangement duration plus the chosen tail. Later edits do not alter an in-progress export.

[Unit tests](../../studio/tests/arrangement.test.ts) cover migration and validation; [placement tests](../../studio/tests/clips.test.ts) cover snapping and duplication. [Browser tests](../../studio/tests/composition.spec.ts) cover colors, persistence, controls, gestures, and independent mute/code scheduling. [Export tests](../../studio/tests/export.spec.ts) inspect WAV duration and muted output. Physical ALSA verification remains optional.

## Exclusive solo

[ADR 0002](../adr/0002-exclusive-track-solo.md) extends the target with exclusive solo. `soloTrackId` restricts playback to one track without rewriting any mute flags. Both track mute and individual clip mutes take precedence over solo. UI feedback, live mute-timeline snapshots, and offline export use the same shared predicate. Clearing solo restores the previous mix; removing its track clears the reference. Standalone tab playback is unchanged. Live solo transitions share the pending mix boundary with mute transitions.

## Launch timing and capture

[ADR 0009](../adr/0009-launch-timing-and-capture.md) records the tempo and source-window decisions. `shared/tempo.ts` normalizes managed headers and remaps slider anchors with CodeMirror changes, including closed tabs and applied code. Live playback and offline render always use `project.bpm / 240`. MIDI transcription compensates for the destination source rate so accepted notes keep their performed timing.

`client/capture-feedback.ts` derives temporary code, new-pattern and timeline feedback from capture owners. No placeholder enters a project snapshot. MIDI acceptance stages a project save before publishing code or clip changes; destination editors lock during that write. Timeline audio and internal audio retain failed takes for retry. Capture owners hold stable tab/track/clip identifiers instead of reading the current selection when accepting.

`launch-timing.test.ts` and `launch.spec.ts` cover migration, anchor preservation, tempo ownership, natural-rate take trims, explicit tutorial preferences and MIDI audition/acceptance. The production browser suite also verifies actual sound, export and recording recovery.
