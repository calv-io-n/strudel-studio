# 0006: Dedicated MIDI instrument effects and reusable presets

- Status: Proposed
- Date: 2026-09-08
- Target: [MIDI devices and on-screen controller](../design/strudel-studio.md#midi-devices-and-on-screen-controller)
- Decision authority: user requested a dedicated MIDI effects editor, persistent sound assignment, reusable presets and preset-to-key mappings

## Context and decision

The previous design provided a default synth and temporary library auditioning. Give the default MIDI instrument a pinned editor and sound selector. Reserve `MIDI` as its live note source so saved chains describe sounds and effects without scheduling a fixed note. Store named presets at installation scope, and keep controller mappings in sessions. Recalling a preset clears outgoing voices and tails; a mapped selector key recalls the saved chain without sounding that key.

Reusing ordinary pattern tabs would couple the default instrument to composition playback. Restricting sound choice to library auditioning would not provide a persistent instrument. Keeping presets only inside a session would prevent reuse across songs.

## Consequences and validation

Optional schema-v5 fields retain draft/applied code and slider anchors. Existing projects retain their default synth behavior. Preset files remain outside song backups, while samples referenced by the current instrument are tracked. Manual preset selection protects drafts with confirmation; explicitly mapped performance recall replaces them directly.

Unit and browser tests cover migration, sample references, preset storage, MIDI Learn and persistence, silence after replacement, and continuous controller input without a backlog of UI changes. The as-built details are in [performance input](../architecture/performance-input.md).
