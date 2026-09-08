# 0003: Highlighted-sound performance, transcription, and audio recording

- Status: Accepted
- Date: 2026-09-07
- Target: [Play notes into selected code](../design/strudel-studio.md#play-notes-into-selected-code), [Record instruments and vocals](../design/strudel-studio.md#record-instruments-and-vocals)
- Decision authority: user requested highlighted-sound riffing, live note inference, independent raw audio recording, live MIDI effects, and XLR instrument/vocal recording for use in tabs
- Related implementation / PR: not implemented by this documentation change
- Supersedes / superseded by: none

## Design before this change

The target described MIDI Learn for inline parameters, virtual keyboard auditioning, and sample assignments. It did not specify playing notes into a selected code section or inferring a phrase from a performance. The Sounds panel focused on saved and generated sounds without an external audio recording flow.

## Decision and departure

Extend the target with contextual MIDI performance for one selected sound or musical expression at a time. Audition produces no saved output, Transcribe infers editable note code, and Record captures a reusable audio take. Transcription requires an explicit, undoable insertion that preserves surrounding code. Retain the existing draft and Apply changes behavior.

The selected phrase provides its instrument and effects for riffing alternative melodies. During Transcribe, show inferred code as the user plays, support repeated takes, and allow temporary suppression of the original phrase while other accompaniment continues. Keeping a take changes only the selected phrase; cancel restores its original playback behavior.

Both Transcribe and Record offer Jam with composition: repeat a selected range while excluding all composition clips sourced from the destination tab, leaving its sound available for live MIDI performance. Transcribe infers Strudel syntax only from live MIDI input. Record captures only the selected internal sound or external audio input, excluding accompaniment, and retains continuous audio across loop passes without overwriting earlier passes. Stopping a take allows accompaniment to continue; global Stop ends both. This is a temporary audition mix, restored on exit without modifying stored mutes or Solo; it extends the normal finite composition transport only for this explicit mode.

Clarify the existing live MIDI requirement: mapped sliders and knobs update supported Strudel effects during playback without applying unrelated drafts or restarting the pattern. Continuous effects update sounding audio where supported; event-based parameters affect subsequent notes. Mappings disclose effects that cannot update live, and export snapshots the current values.

Keep Transcribe and Record independent: Transcribe produces editable note code, while Record saves the actual highlighted sound’s live audio, preserving timing and effect movements without note inference or quantization. Internal recordings exclude accompaniment and use the same audio-asset workflow as external inputs. Sample insertion must not apply already-recorded effects again.

Add audio recording to Sounds using host audio inputs, including XLR microphones and instruments through an audio interface. Users review and trim takes, save them as stable local sound assets, and insert sample code into tabs. Recorded sounds participate in normal playback, composition, persistence, and WAV rendering.

## Reason and alternatives

The user needs to compose by performing as well as typing, and to bring live instruments and singing into the same tab workflow. Parameter mapping alone cannot express a played phrase. An external recorder adds avoidable export/import steps. Dedicated audio timeline tracks would expand the arrangement model; reusable recorded samples fit the existing tab-based composition design.

## Consequences

Implementation will need explicit capture state, selection anchoring, MIDI timing and chord inference, input-device and permission handling, take review, and durable audio-asset storage. Preview and explicit insertion protect existing code. Audio-to-note transcription is outside this change; MIDI performances can produce either inferred notes through Transcribe or rendered live audio through Record; XLR input supplies recorded audio. Hardware availability and host input capabilities require actionable feedback.

## Validation and documentation

The updated [acceptance criteria](../design/strudel-studio.md#first-version-acceptance) cover selection isolation, undo, phrase fidelity, interruption recovery, audio capture, timing, persistence, and export. Future implementation should verify virtual MIDI with deterministic event fixtures, physical MIDI with hardware, and XLR recording with an audio interface, including permission denial and disconnects. Update the as-built architecture and link implementation checks when those features ship.

Verify Record independently with Transcribe disabled: the saved audio preserves live timing and effect movements, excludes accompaniment, and remains unchanged after editing the source instrument. Both internal and external takes must survive save/reopen and render through their sample references. See [current implementation boundaries](../architecture/performance-input.md); this accepted product decision does not imply these workflows have shipped.

## Implementation follow-up

The [implementation stack](../architecture/implementation-stack.md) delivers the
selection, audition, diff-review, jam and audio-take paths. See
[performance input](../architecture/performance-input.md) for current boundaries
and automated verification evidence; physical device validation remains separate.
