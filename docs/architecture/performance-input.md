# Performance input and reusable audio

The performance workspace implements the [design target](../design/strudel-studio.md#play-notes-into-selected-code) through separate audition, MIDI transcription and audio recording paths.

## Selection and MIDI review

`StudioEditor` resolves a selected note expression, note string, or supported compound expression and anchors only its musical replacement range. CodeMirror maps that range through unrelated edits; overlapping edits invalidate acceptance. Retargeting requires an explicit new selection. Closing the destination or switching sessions requires resolving pending takes.

The performance panel pins the destination, compiles its sound/effect suffix for audition, and consumes armed note events before MIDI Learn or sample bindings. Knob mappings continue independently. Unsupported or shared-routing instruments require an explicit fallback synth.

Transcribe captures pitches, velocities, onset/release timing and overlapping notes on the audio clock. It renders a live before/after proposal, including provisional held notes. Each generated parallel voice spans the chosen phrase with leading/trailing rests. Quantization is optional. Preview can isolate the take or retain accompaniment. Accept performs one isolated undo transaction and leaves the result under normal Play / Apply changes rules. Empty takes and invalid anchors cannot replace source.

Stop and device/socket loss release held voices and retain the proposal. Pending MIDI drafts recover separately from project code after reload; recovery never starts playback.

## Playback routing and effects

Performed voices use private Superdough orbits feeding a dedicated bus. Their source handles release on note-off while effect returns finish. Isolated preview attenuates the arrangement output without changing stored mix flags. Original-phrase suppression uses the last applied source snapshot, never unrelated draft edits.

Jam repeats a selected composition range with an absolute scheduler clock while excluding every clip from the pinned destination tab. Remaining clips retain track/clip mute and Solo behavior. Take Stop preserves accompaniment; global Stop and leaving jam restore ordinary playback eligibility. Ordinary composition still stops at its final clip.

Slider identities travel through pattern context to live AudioParams for simple gain and low-pass controls, with smoothing. Modulated filters retain native scheduling. Room, delay and envelope changes affect next scheduled notes; unknown controls have explicit limitation feedback. Export uses ordinary offline Strudel rendering with a snapshot of current values.

## Audio takes

`AudioTakeCapture` records actual source samples in an AudioWorklet. Internal recording taps only the performance bus and requests no microphone permission. External recording uses the selected MediaStream input, reported channels, level feedback and optional monitoring, initially off. No accompaniment enters either capture path.

Both sources share count-in, length limits, jam, Stop, preview, trimming, naming, save and discard. Internal Stop has a visible tail-finishing state. Input loss preserves received frames as an incomplete take. Audio chunks are written incrementally to browser recovery storage; recovered takes remain stopped and require review. A saved take is a PCM WAV with tempo, offset and trim metadata. Insertion creates a separate sample phrase without copying the original effect chain.

## Library, imports and portability

Generate and Import share one searchable library. Imports review file/folder/ZIP selections, retain original bytes and decode a playback WAV. SHA-256 identity reuses duplicate imports and restores missing files under existing identifiers. Pack and sample names are metadata, so renaming preserves code references.

GitHub discovery resolves a branch/tag/commit before listing supported data blobs. Downloads are pinned to that commit and restricted to GitHub hosts, with bounded time and size. Truncated listings require a narrower folder; cancellation and per-file errors retain completed work. Repository code is never executed. See the [GitHub tree API](https://docs.github.com/en/rest/git/trees#get-a-tree) for upstream listing limits.

Format v4 adds explicit asset references and migrates v1–v3 input. Project backups contain project JSON, referenced audio, available originals and a manifest identifying missing/external files. Restore creates a collision-safe session and refuses conflicting audio identities. Import review, MIDI proposals and unsaved audio recover separately from accepted project content.

## Verification boundaries

Unit and browser fixtures cover phrase fidelity, explicit acceptance/undo, audible live gain, isolated audio capture, interruption/reload recovery, jam looping, upload/GitHub imports, duplicate reuse and backup restoration. The complete browser suite retains existing playback and export checks. Physical ALSA MIDI and audio-interface channel behavior require hardware verification; browser fixtures do not establish those results.

Limits are visible in the UI: 64 MB per imported source file, 256 MB per pack/backup, 500 files per import review and 15 minutes per sample or recording. Browser decoder/input capabilities determine supported device channels and codec availability. Unsupported inputs/formats report errors without discarding valid takes or files.
