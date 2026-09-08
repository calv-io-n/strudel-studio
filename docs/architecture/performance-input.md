# Performance input: current implementation boundaries

This page describes the current Studio implementation and identifies gaps against [the performance design](../design/strudel-studio.md#play-notes-into-selected-code) and [ADR 0003](../adr/0003-midi-note-capture-and-audio-recording.md). Transcribe and Record are accepted target workflows, not implemented features of this documentation change.

## Existing paths

- [main.ts](../../studio/client/main.ts) routes MIDI events to slider bindings, sample triggers, sound-slot controls, or the default keyboard voice. Slider bindings use pickup and range scaling before updating the target editor value.
- [editor.ts](../../studio/client/editor.ts) owns inline slider identities, values, and editor updates. [engine.ts](../../studio/client/engine.ts) exposes live slider values through pattern references, allowing explicit control movements to affect playback without applying unrelated drafts. This does not establish continuous updates to every effect on already-sounding notes; that behavior depends on effect scheduling and requires verification.
- The engine's unassigned MIDI keyboard voice is a triangle oscillator with velocity-controlled gain. It does not derive its instrument or effect chain from highlighted code. Assigned sample triggers follow a separate path.
- The engine registers saved sound assets and previews them; [main.ts](../../studio/client/main.ts) provides sound insertion and generation actions. [store.ts](../../studio/server/store.ts) and [model.ts](../../studio/shared/model.ts) define the existing storage and project model boundaries.
- [export.ts](../../studio/client/export.ts) starts offline WAV rendering from a snapshot. This is distinct from recording a live performance and does not capture controller movements made after rendering starts.

## Target gaps

| Accepted behavior | Current gap |
| --- | --- |
| Highlight a sound and riff using its instrument and effects | No selected-expression performance routing or temporary suppression of that phrase |
| Loop accompaniment while excluding the destination tab during Transcribe or Record | No dedicated jam loop, temporary tab-level exclusion, or continuous audio-take capture across loop passes; ordinary composition playback stops at the last clip |
| Transcribe MIDI into code visible during live play | No transcription state, phrase inference, take preview, or anchored replacement workflow |
| Record the highlighted sound's actual live output independently | No isolated live recording path or audio-take review workflow |
| Record instruments or singing through an XLR audio interface | No Studio audio-input permission, device/channel selection, or recording UI |
| Use both recording sources as durable samples in tabs | Existing sound paths provide integration points; recorded-take creation, metadata, trimming, and recovery remain to be implemented |
| Update supported effects live and disclose limitations | Live slider references exist; per-effect sustained-note behavior and limitation feedback remain to be verified or implemented |

## Boundaries to preserve when implementing the target

Transcribe consumes MIDI note events and produces a draft code replacement. Record consumes audio from either an isolated performed sound or a selected external input and produces an audio asset. Record must work without transcription, preserve the actual performance and effects, and exclude accompaniment. Inserting an audio take references that asset rather than reconstructing its notes or applying captured effects twice.

The editor owns the destination tab/range and undoable insertion. Performance routing must keep that destination stable across edits and tab changes. Audio routing must distinguish immediate audition, internal recording, external recording, and offline export. Shared project/storage changes must preserve stable sound references and retain recorded audio across reopening and backup.

These are integration constraints from the design, not new runtime modules or an asserted schema migration. Implementation work must add evidence for stop/disconnect recovery, source isolation, live effects, code insertion safety, asset persistence, and rendered export before marking the target gaps complete.
