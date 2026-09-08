# Transcribe on composition

The workflow starts with the composition and the selected IDE note expression:

1. Optionally choose a composition loop with the start/end handles. Otherwise use the full composition.
2. Click `note` and choose **Transcribe on composition**. This pins the expression and reveals its timeline destination; it does not start playback.
3. Press **Play** with Composition selected. The loop repeats and the selected note's original melody is temporarily suppressed.
4. Play a tune through MIDI. The selected IDE expression supplies the sound and settings; MIDI supplies pitches, velocities, onsets and releases.
5. At the next loop boundary, a pass with new key presses becomes the proposed Strudel transcription. Empty passes and held-note carry alone keep the previous proposal.
6. Switch **Live MIDI / Transcribed** without stopping the composition. Live MIDI captures a new performance; Transcribed loops the retained generated phrase. Playback changes are scheduled at a loop boundary beyond audio already queued.
7. Use **Solo take** to isolate the generated phrase. **Accept into section** commits the displayed proposal to the chosen timeline region; **Discard takes** preserves the original.

The proposal remains separate from accepted code. The last 32 nonempty passes are retained for comparison. A new pass replaces the displayed transcription only after its boundary; incoming notes are shown immediately in the note view. Global Stop retains completed and partial takes for review. Reload recovery remains stopped.

## Sound semantics

Live MIDI evaluates the full IDE source with the selected note replaced by incoming MIDI values. This retains variables, enclosing instrument/effect chains, and slider identities, instead of constructing a generic synth from an effect suffix. The UI names the evaluated instrument. Missing instruments and unsupported shared audio routing produce an error instead of silently choosing a fallback.

Live input is gated by physical note releases. Rhythmic transformations of an already sequenced pattern are not equivalent to immediate live input; settings that require scheduled future events need explicit support rather than a claim that their timing has been reproduced by a held voice. MIDI CC automation is not encoded into the generated note expression.

## Timeline semantics

For a loop contained within one destination clip, acceptance splits that clip around the selected range and uses a variation tab for the accepted section. Source offsets preserve the original phase of the surrounding music.

For a loop extending beyond one source clip, acceptance adds a MIDI layer spanning the full loop and backing variations that suppress the selected expression in overlapping source occurrences. Other expressions and source occurrences outside the range retain their original behavior. The original source tab remains available. One **Undo acceptance** action restores the transaction if no subsequent project edits have intervened.

## Verification

Verify actual audio as well as state: the chosen IDE instrument during live play, generated audio in Transcribed mode, silence preservation across empty passes, range phase alignment, scoped acceptance, and undo. Browser MIDI fixtures do not substitute for a physical keyboard walkthrough.

## Output formats

**Notes · snap to beat** defaults to a quarter-beat grid and generates readable weighted `note(...)` mini-notation. Whole-, half-, quarter-, and eighth-beat grids are available. Overlapping voices become separate lanes in `stack(...)`; rests and velocity remain represented. Pitches are the MIDI pitches played, not automatically forced into a key.

**timeCat · played timing** preserves the recorded onset/release timing using `timeCat(...)` expressions. Switching formats regenerates the retained take without recording again. The two formats use the same IDE instrument and acceptance path.
