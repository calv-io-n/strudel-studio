# ADR 0009: Project clock, source windows and explicit capture destinations

Accepted for issues #35–42, September 2026.

## Decision

The project BPM owns live and offline scheduling. Ordinary pattern editors display a protected header; changing BPM while stopped updates the header, source anchors and applied code together. Legacy top-level clock setters become comments. Embedded clock setters remain visible with a warning decoration and cannot change Studio's clock. Exported standalone code uses the effective source BPM. Embedded setters must be removed before standalone export, because outside Studio they could take over that clock.

Format v7 adds an optional `tempoBpm` on source patterns. Its ratio to project BPM controls source event time in every placement and in tab playback. Duplicate the source for an independently timed variant. Recorded audio patterns reject this override; samples retain their playback speed and pitch. An override affects sample trigger spacing, not audio stretching.

Timeline positions are one-based beats; durations are beats; four beats equal one source cycle at the inherited rate. Persisted placement and duration remain quarter-cycle increments. Moving keeps the source offset. Right-edge resizing changes the source window's end. Left-edge resizing keeps its end fixed and advances the source offset by the moved amount times the source rate. Offsets may therefore be fractional source cycles. Recorded take trims retain seconds-based offsets across later BPM changes. Out-of-bounds and overlapping edits are rejected, and Escape cancels a drag.

For a repeating one-cycle phrase, extending a clip reveals further repetitions. For an evolving four-cycle phrase, extending reveals later source material; moving it does not restart at a different phase. Trimming one project beat from a half-rate pattern advances its source by one eighth of a cycle. An audio take keeps its natural speed and ends at its own duration or the clip boundary. A left trim through an existing source note does not invent a new attack at the clip boundary. There is no stretch tool.

## Research and rationale

[Strudel cycles](https://strudel.cc/understand/cycles/) define musical time independently of clock speed; [time modifiers](https://strudel.cc/learn/time-modifiers/) change pattern event time. [Ableton's Arrangement View](https://www.ableton.com/en/live-manual/12/arrangement-view/) provides the familiar move/body and resize/edge interactions. [Cubase's sizing with time stretch](https://www.steinberg.help/r/cubase-pro/15.0/en/cubase_nuendo/topics/parts_events/parts_and_events_resizing_events_with_the_object_selection_tool_sizing_applies_time_stretch_t.html) is a distinct operation. Studio adopts move and trim, with explicit source-phase semantics suitable for generated patterns. The distinction avoids suggesting that changing a rectangle stretches an audio waveform.

## Capture and expression actions

Interactive `note` and literal `slider` names have keyboard-focusable cues. Their compact menus inspect existing sources, explicitly start MIDI testing or recording, bind a control, or unbind. Opening a menu has no audio or capture side effect.

Follow-up #44 supersedes the initial destination wizard: Test MIDI creates no take. Record MIDI on pattern and Record MIDI solo arm the clicked source phrase in the shared top Record bar. The former accompanies with the entire owning tab, the latter with no pattern/composition; pressing the top Record button starts the shared count-in/capture. Stop, review, Keep take and Discard stay in that bar. The standalone transcription sheet is removed. Legacy clip-targeted recoveries retain their acceptance semantics in a compatibility review section of the bar.

Each take owns stable destination IDs. Pending phrase, appended-code, new-pattern and timeline feedback reflects the real capture lifecycle and never becomes saved placeholder code. Acceptance saves before publishing. Failure retains the take; changed destinations require explicit retargeting. Slider value manipulation never opens mapping UI; the function-name menu owns intentional binding.


## Action inventory

| Action | Canonical home |
| --- | --- |
| Open visible pattern | Tab strip |
| Reopen closed pattern | Search |
| Rename, color, duplicate, close, delete, pattern tempo | Tab menu; rename also double-click/F2 |
| Create pattern/session, save, play, stop, record | Existing workspace controls |
| Edit, duplicate, mute, remove clip; open source | Clip menu |
| Input configuration / recording configuration | Input toolbar/banner / record bar |
| Add or import sounds | Sample Catalogue → Add sounds |
| Inspect/test/record phrase, bind/unbind slider | Function-name menu |
| Open Sample Catalogue, pattern import/export, WAV export, backups | Search |
| Session copy/reload/delete, MIDI connection settings, Quick Start | Search |
| Expand editor/composition, range start and loop toggle | Search; these have no equivalent labeled workspace action |

Follow-up #49 pins essential entry points in Search even when available elsewhere: closed-pattern selection, catalogue, MIDI settings, audio settings, full-song render, Quick Start, Strudel-file import, and the subsequently requested Import GitHub Samples shortcut. Existing defaults follow this stable group; unrelated tab/clip management stays local.

## Quick Start

The existing guide opens once per page load unless its explicit opt-out is true. Ordinary dismissal and the legacy seen flag are not consent to hide it. Manual reopening exposes the same reversible preference. Storage failure reports that the preference was not retained and still allows dismissal. Help copy and the real browser drag recording reflect the completed controls.

## Transport count-in

A metronome toggle beside Record provides a shared four-beat lead-in for tab playback, composition playback, microphone/audio takes, and MIDI takes. Off is neutral gray; enabled is gold in both themes (follow-up #46). Clicks and the 4–3–2–1 display follow the project BPM. Normal playback compiles first, then counts in before starting its scheduler. Recording starts after the count-in, so the lead-in is not saved as an extra cycle. Stop cancels scheduled clicks and the pending start. The browser remembers the preference; existing count-in checkboxes reflect the same setting.

The subsequent three-state request extends the toggle to Off → Count-in only → Continuous → Off. Continuous has a yellow loop badge, shares the four-beat lead-in, and schedules speaker-only clicks while transport or capture is active. Stop silences the clock without resetting its mode. Stored boolean preferences migrate to Off/Count-in only; no project format migration is needed.
