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

## Selection foundation

The contextual Play into selection action now resolves a selected `note(...)` call
(or its contained note string), anchors that musical expression in CodeMirror, and
shows its original code in a temporary review panel. The editor maps the range
through unrelated changes and blocks acceptance after overlapping edits. The shared
take model retains note events and closes held notes on interruption. Audition,
transcription generation, and audio recording are subsequent stack changes.

Selected-sound audition now compiles the selected expression's effect suffix and
routes incoming notes through private Superdough voice orbits into a performance
bus. Note-off releases the source while effect returns finish. Shared bus/source
routing is rejected with an explicit fallback synth. Armed note events bypass
sample bindings and MIDI Learn. The browser test captures real audio output;
phrase suppression and jam routing follow with the transport changes.

Transcribe now captures MIDI into a separate take and continuously renders a
before/after proposal. Its full-duration parallel voices preserve rests, overlaps,
velocity and selected quantization. Stop retains the take; Accept replaces only
the anchored expression as one editor edit. Preview isolated temporarily attenuates
the arrangement output; neither preview mode inserts code. Retry explicitly drops
the current proposal. Runtime phrase settings are separate from saved project code.

Jam uses a repeating arrangement query with absolute scheduling offsets and a
runtime destination-tab exclusion. Take Stop leaves the loop intact; global Stop
and leaving performance end it. Ordinary composition still stops at its last clip.
Phrase suppression recompiles only the last applied source snapshot with the
selected expression replaced by silence; ambiguity blocks suppression. Neither
mechanism edits saved mix flags or draft source.

Simple mapped gain and low-pass controls carry slider identity through pattern
context into dedicated voice AudioParams with 15 ms smoothing. This works for
scheduled playback and performed voices without applying drafts. Modulated filters
retain native scheduling; room/delay/envelope controls update next scheduled notes.
Mapping feedback names these boundaries. Offline export uses ordinary Strudel
rendering and snapshots the latest saved control values. A browser audio-capture
regression verifies muting a sustained note through its live gain control.

Sounds now separates Generate and Import while retaining one searchable library.
Asset metadata supports upload, GitHub and recording provenance independently of
the generation request schema. Legacy generated metadata and sample URLs remain
valid. The store reports missing audio and removes a newly written audio file if
its metadata cannot be committed.

The audio-take panel captures either the private performed-sound bus or a selected
MediaStream input through an AudioWorklet. External setup requests permission,
exposes reported channels and level metering, and defaults monitoring off. Internal
capture requests no microphone permission. Both sources share count-in, duration
limits, preview, trim, save and discard. Internal Stop offers a finishing tail;
input loss retains received frames as incomplete. Saved PCM WAVs use stable library
IDs and include tempo, offset and trim metadata. Hardware channel reporting still
requires validation on the user's interface.

File/folder/ZIP import now reviews entries before committing them. Browser decoding
produces a stereo WAV derivative while the server retains original bytes; SHA-256
identity makes repeated imports reusable and restores missing audio under its old
identifier. Packs carry folder metadata and can be renamed without changing sound
IDs. ZIP review bounds file count and expansion size and rejects unsafe paths.
Individual decode/upload errors remain visible alongside successful imports.
