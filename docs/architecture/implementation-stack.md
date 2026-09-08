# Design implementation stack

The stack is ordered for review and merge from the bottom up. Each draft PR targets
the preceding branch; the first targets `main`. No PR is automatically merged.

| Order | Change | Draft PR |
| --- | --- | --- |
| 1 | Anchored selection and review foundation | [#10](https://github.com/calv-io-n/strudel-studio/pull/10) |
| 2 | Isolated selected-sound audition | [#11](https://github.com/calv-io-n/strudel-studio/pull/11) |
| 3 | Live MIDI diff, preview and acceptance | [#12](https://github.com/calv-io-n/strudel-studio/pull/12) |
| 4 | Composition jam and temporary exclusion | [#13](https://github.com/calv-io-n/strudel-studio/pull/13) |
| 5 | Supported sustained-note effect controls | [#14](https://github.com/calv-io-n/strudel-studio/pull/14) |
| 6 | Shared Generate/Import library and assets | [#15](https://github.com/calv-io-n/strudel-studio/pull/15) |
| 7 | Internal and external audio takes | [#16](https://github.com/calv-io-n/strudel-studio/pull/16) |
| 8 | File/folder/ZIP imports | [#17](https://github.com/calv-io-n/strudel-studio/pull/17) |
| 9 | Public GitHub sample imports | [#18](https://github.com/calv-io-n/strudel-studio/pull/18) |
| 10 | Portable projects, recovery and integration acceptance | `feat/10-portable-projects` |

## Review contract

MIDI proposals are separate from source until **Accept into selection**. The diff
updates during capture and can be previewed alone or with accompaniment. Acceptance
is a whole-phrase undo transaction and does not apply a running draft. Invalidated
ranges require explicit retargeting. Empty takes cannot erase code.

Record captures actual audio independently of transcription, using a selected input
or the private live-performance bus. Jam, phrase suppression and isolated preview
are temporary playback state and never rewrite saved mix flags. Recorded samples
are inserted as separate phrases, retaining timing metadata without duplicating
source effects.

## Persistence and interfaces

Format v4 adds explicit asset references and reads v1–v3 sessions. Generated,
imported and recorded assets retain stable sample IDs. The new local endpoints
cover recording uploads, reviewed sample imports, GitHub discovery/downloads, pack
renaming and project backup/restore. Existing project, generation and sample URLs
remain available.

Pending MIDI proposals use browser storage; audio chunks and import reviews use
IndexedDB. Recovery never starts playback or recording. Portable backups bundle
referenced local assets and available originals, and identify missing/external
files in their manifest. Restore creates a new session and refuses conflicting
audio identities.

## Acceptance evidence

Build/type checking and unit tests pass. Browser coverage includes original
workspace/composition/export behavior, live diffs and undo, audible audition and
sustained gain, jam looping, internal recording, permission denial, reload recovery,
file/ZIP/GitHub imports, duplicate reuse and project backup/restore. Visual checks
cover the diff panel and narrow-screen overflow. PRs 1–9 have successful Linux /
Node 24 CI checks; the final PR runs the same workflow.

Physical ALSA MIDI and audio-interface channel behavior remain hardware checks.
This environment has no ALSA sequencer; the hardware browser test is explicitly
skipped. Supported-expression, effect, codec and size limits are described in
[performance input](performance-input.md) and the workspace guide.
