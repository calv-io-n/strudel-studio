# Design: the target build

This directory describes what Strudel Studio should do. The main product target is [strudel-studio.md](strudel-studio.md). Design is not an inventory of implemented features.

The target includes [highlighted-sound performance with separate Transcribe and Record actions](strudel-studio.md#play-notes-into-selected-code), [live MIDI effect control](strudel-studio.md#virtual-midi), and [audio recording through XLR interfaces and other inputs](strudel-studio.md#record-instruments-and-vocals). See [ADR 0003](../adr/0003-midi-note-capture-and-audio-recording.md) for the decision and [architecture notes](../architecture/performance-input.md) for current implementation boundaries.

To contribute, propose intended behavior, user flows, constraints, and testable acceptance criteria. Explain the problem and target change in your PR. Keep runtime details and current limitations in [as-built architecture](../architecture/README.md).

[Sounds](strudel-studio.md#sound-library) uses Generate and Import tabs with a shared library. [Sample and pack import](strudel-studio.md#import-samples-and-packs) covers GitHub, file/folder/ZIP upload, and reusable local assets; [ADR 0004](../adr/0004-generate-and-import-sound-tabs.md) records this decision.

If a change departs from the existing target, add an [ADR](../adr/README.md) explaining the departure. When the target itself changes, update the design alongside the decision record so future work has a clear target. Do not rewrite the target merely to hide an implementation gap.
