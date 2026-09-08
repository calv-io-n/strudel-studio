# 0004: Generate and Import sound tabs

- Status: Accepted
- Date: 2026-09-07
- Target: [Sound library](../design/strudel-studio.md#sound-library), [Import samples and packs](../design/strudel-studio.md#import-samples-and-packs)
- Decision authority: user requested easy traditional sample/pack import from GitHub or uploads and separate Generate / Import tabs
- Extends: [0003](0003-midi-note-capture-and-audio-recording.md); transcription and recording remain independent
- Related implementation / PR: not implemented by this documentation change

## Design before this change

Sounds was a temporary panel combining saved sounds, generation, and recording. The target did not define a guided upload or GitHub sample-pack import flow, or separate acquisition tabs.

## Decision and departure

Use exactly two source tabs, Generate and Import, above a shared saved-sound library. Import is the initial default and includes file/folder/ZIP upload, GitHub import, and the existing Record audio target. Highlighted-sound recording opens the same recording workflow. Preserve in-progress work when switching tabs.

Import selected audio as stable local assets, retaining pack organization and source metadata. Provide review, preview, progress, cancellation, partial-failure recovery, and immediate sample insertion without manual registration or generation setup. GitHub imports read data without executing repository code and remain playable offline after import.

## Reason and alternatives

Traditional samples should be as easy to add as generated sounds. Manual repository cloning and sample registration introduce unnecessary setup. Separate libraries for each source would make saved sounds harder to find; a shared library keeps preview, insertion, MIDI assignment, and reuse consistent. Recording belongs under Import because it brings performed audio into that same library.

## Consequences and validation

Implementation needs upload/archive handling, GitHub discovery, audio-format handling, pack metadata, stable storage, and recoverable import jobs. Existing saved sounds must remain accessible. Follow the [design acceptance criteria](../design/strudel-studio.md#first-version-acceptance), including offline playback/export, duplicate imports, renaming, mixed valid/invalid files, cancellation, partial failures, and keyboard access. This decision updates the target only; document runtime boundaries and checks when implemented.

## Implementation follow-up

The [implementation stack](../architecture/implementation-stack.md) adds the shared
library, reviewed file/folder/ZIP/GitHub imports, stable asset recovery, and portable
project backups. Runtime limits and checks are documented in
[performance input](../architecture/performance-input.md).
