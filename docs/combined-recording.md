# Simultaneous Audio Input and MIDI recording

Issue #51 extends the shared recorder. Audio Input and MIDI are independent toggle buttons: either one or both can be enabled. The top Tab / Composition selector determines the destination. There is one Record/Stop action, one metronome count-in, and one scheduled audio clock for both inputs.

In Tab mode the destination is the current pattern. Composition defaults to **New pattern**: select a track and Record creates a pending Take tab and placement on that track. Keep take saves both together. Existing clips may overlap the new placement and play as layers. Choose **Existing pattern** to record into a selected placement instead; otherwise the placement under the playhead is used. An ambiguous existing destination asks for a placement.

An explicitly armed note in that pattern receives MIDI. Otherwise MIDI appends an instrument section. Audio appends its own section in the same pattern. When both sections are new the order is MIDI then audio. Audio-only capture never changes an armed note. A note shortcut enables MIDI without switching off Audio Input. “Append MIDI instead” clears the note binding.

The destination is pinned at Record. Capture displays status and note count; transcription runs in a worker after Stop and becomes a reviewable code preview. New composition takes leave the composition visible and expose a pending Take tab. Recording destination and Audio section return explicitly. Keep take opens the saved tab in the tab bar without switching the active view, and preserves it after reload.

Recording joins an already playing composition at the next bar after input preparation, with at least four beats of lead when the metronome is enabled. The backing keeps playing and may loop while both inputs record one continuous take. Skip to beginning stops playback and returns to beat one without starting a count-in; it is unavailable during preparation, capture, or finalization. Press Play to start again. Continuous metronome clicks follow loop boundaries. Count-in-only clicks occur when starting playback or arming capture, rather than on every loop.

Composition retains its chosen height while long code scrolls inside the editor. Drag the divider above Composition to resize it; the height is remembered for this session between visits and constrained to fit the viewport.

Simultaneous capture stops both sources together. The existing wet-input effects tail finishes before Keep take becomes available. Keep take commits generated MIDI, audio assets, and the edited pattern in the existing browser storage transaction. Failed saves retain both inputs for Retry. Reload uses the existing MIDI and audio pending stores, with the pinned destination retained. Legacy audio recovery and take playback remain supported.

Validation lives in `studio/tests/combined.spec.ts`: the destination matrix in both contexts, same-pattern persistence, visible editor reconciliation, navigation, one count-in, cancellation, interrupted capture recovery, both recorded frequencies in playback, and atomic save failure/retry. These are deterministic browser inputs, not a claim of a new physical microphone/MIDI hardware test.

Quick Start includes a real-app “Audio input + MIDI” clip with virtual inputs, alongside refreshed MIDI-only demonstrations.

The earlier #51 implementation passed its 69-test browser suite and 80 unit tests. Current performance changes and their verification are described in [recording performance](recording-performance.md).
