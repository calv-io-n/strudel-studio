# Simultaneous Audio Input and MIDI recording

Issue #51 extends the shared recorder. Audio Input and MIDI are independent toggle buttons: either one or both can be enabled. The top Tab / Composition selector determines the destination. There is one Record/Stop action, one metronome count-in, and one scheduled audio clock for both inputs.

In Tab mode the destination is the current pattern. In Composition mode select a track and its pattern placement; the selected placement wins, otherwise the placement under the playhead is used. An empty/ambiguous destination asks for an existing placement. It does not create an audio-specific pattern or track.

An explicitly armed note in that pattern receives MIDI. Otherwise MIDI appends an instrument section. Audio appends its own section in the same pattern. When both sections are new the order is MIDI then audio. Audio-only capture never changes an armed note. A note shortcut enables MIDI without switching off Audio Input. “Append MIDI instead” clears the note binding.

The destination is pinned at Record. Inline decorations show pending notes and audio; these are not project code. Recording reveals the destination once. Navigation and scrolling are then left to the user; Recording destination and Audio section return explicitly. Saving does not switch the active tab.

Simultaneous capture stops both sources together. The existing wet-input effects tail finishes before Keep take becomes available. Keep take commits generated MIDI, audio assets, and the edited pattern in the existing browser storage transaction. Failed saves retain both inputs for Retry. Reload uses the existing MIDI and audio pending stores, with the pinned destination retained. Legacy audio recovery and take playback remain supported.

Validation lives in `studio/tests/combined.spec.ts`: the destination matrix in both contexts, same-pattern persistence, visible editor reconciliation, navigation, one count-in, cancellation, interrupted capture recovery, both recorded frequencies in playback, and atomic save failure/retry. These are deterministic browser inputs, not a claim of a new physical microphone/MIDI hardware test.

Quick Start includes a real-app “Audio input + MIDI” clip with virtual inputs, alongside refreshed MIDI-only demonstrations.

Verification: the full 69-test Playwright suite and 80 unit tests passed. After final shared-loop/clock and recovery refinements, 18 focused browser checks passed; four final checks cover count-in boundaries, repeated playback of both signals, and atomic saving. All six input tutorial captures completed against the application, including the first MIDI note immediately after the shared count-in. Production builds passed. The prior PR #52 release is live; this document describes the subsequent #51 implementation.
