# 0010: Non-destructive clip anchors for sample alignment

- Status: Accepted
- Date: 2026-09-25
- Target: [composition](../design/strudel-studio.md#composition)
- Related implementation / PR: `studio/shared/clip-timing.ts`, `studio/shared/anchor-render.ts`, `studio/client/align-dialog.ts`, project schema v8
- Supersedes / superseded by: amends [0009](0009-launch-timing-and-capture.md) take trimming

## Design before this change

Three mechanisms fitted a sample to the song, all built on the same WSOLA stretch: a destructive bake in the sample editor (`extraction.alignment`), a uniform `clip.sampleSpeed` with `takeLeadSeconds`/`takeOffsetSeconds`/`sourceOffset`, and an anchor warp whose Apply wrote a new WAV per alignment (`extraction.warp`, `sourceSampleId`, `warpSourceId`). The clip-to-source maths existed in four copies. Re-aligning a fitted asset stretched twice, tempo changes silently misaligned baked audio, and the controls competed. Recorded takes kept lead and trim in seconds, so ADR 0009 promised they "retain seconds across later BPM changes" and refused a left extension before the recording start.

## Decision and departure

Format v8 gives every audio clip one timing model: `takeId` always names the original sample, and optional `anchors` pair a second in the sample with a beat from the clip start (1 cycle = 4 beats, 1 to 128 anchors, strictly increasing). Playback starts at the first anchor, stretches linearly between anchors with pitch preserved (0.5×–2× per interval, 60 s of source, 120 s of output), and continues at 1× after the last anchor, bounded by the clip length. A single anchor is plain placement; two anchors are a uniform fit; more are a per-syllable alignment. `sampleSpeed`, the seconds fields, `sourceSampleId`, `warpSourceId`, `extraction.warp` and `extraction.alignment` are removed; `sourceOffset` remains for pattern clips only.

Rendering is lazy: `take-buffers` keys decoded audio by sample, tempo and anchors and runs `anchor-render` in a worker only when an interval actually stretches. Nothing derived is written to storage. One **Align** dialog replaces the vocal aligner, the clip-dialog phrase handles, fit-length and sample-speed controls, and the editor's stretch/speed bake. **Smart snap** (`smartSnap`) moves detected attacks within a tolerance onto the chosen grid, nearest first, never violating the stretch limit. The same function seeds the Liquid Dawn demo, whose source grid was measured from the stems (about 109 BPM, half-time against 172).

Departures from the target: take trims are now beat-relative (a trimmed take stays on its beat when the tempo changes) and extending a take clip to the left adds silence instead of being refused. A tempo change is refused while it would push an anchored interval outside 0.5×–2×.

## Reason and alternatives

Baking aligned assets was rejected because every tweak added a WAV, tempo changes required manual re-application, and stacking with speed fits could not be prevented. Keeping a separate uniform speed control was rejected because two timing models were the source of the confusing interactions. Guessing a sample's own tempo for Smart snap was rejected as unreliable on sparse material; snapping attacks to the song grid is deterministic and explainable.

## Consequences

Projects migrate v7→v8 purely: lead, offset and source offset on take clips become one anchor; the unreleased `sampleSpeed`, `sourceSampleId` and `warpSourceId` are dropped, and clips that already point at a warp-baked asset keep playing it at 1× (the one-shot check accepts an asset whose `extraction.assetId` is the tab's sample). Backups shrink because alignments no longer create assets. Stretching happens at playback preparation, so the first play after an alignment or tempo change waits for a render (bounded by the 60 s source limit and shared between duplicate clips). The sample editor only crops.

## Validation and documentation

Unit tests: `clip-timing.test.ts` (time map, trims, fits, Smart snap, playback window, tempo check), `anchor-render.test.ts` (pitch, joins, tail copy, exact 0.5×/2×), `model-migration.test.ts`. Browser: `align.spec.ts` (audition, non-destructive apply and reload, invalid intervals, Smart snap and fit, tempo re-render). Documentation: [setup](../setup.md#aligning-a-sample-to-the-song), [workspace](../workspace.md), [architecture/composition](../architecture/composition.md).
