# 0001: Expand composition beyond the initial two-lane design

- Status: Accepted
- Date: 2026-09-07
- Target: [Composition](../design/strudel-studio.md#composition), [Context menus](../design/strudel-studio.md#context-menus)
- Decision authority: the requested and agreed composition feature plan
- Implementation: [composition UI](../../studio/client/main.ts), [gestures](../../studio/client/composition.ts), [project format](../../studio/shared/model.ts)
- Supersedes / superseded by: none

## Design before this change

The initial composition target specified two fixed lanes, whole-cycle placement, and stopped-only structural editing. Tab context menus had no color control, and composition had no track or clip mute controls.

## Decision and departure

Evolve the target to 1–16 named tracks, eight named tab colors inherited by clips, track and clip muting, and selectable 1 / ½ / ¼ cycle snapping with magnetic clip-edge alignment. Keep structural edits stopped-only. Live mute changes take effect at the next safe cycle boundary without compiling code drafts. The design document is updated to this target; this record preserves the earlier scope and reason for changing it.

## Reason and alternatives

The requested workflow needs more layers, recognizable source patterns, independent muting, and precise clip movement. Fixed lanes and integer timing constrain those operations. Arbitrary colors and free movement were considered; a named palette and quarter-cycle storage keep the controls predictable. Applying code again to mute was rejected because it would apply unfinished edits.

## Consequences

Project format v3 introduces stable track IDs, palette colors, mute settings, and fractional timing. V1/v2 projects migrate when opened. Separate code and mute timelines add scheduling state but keep their transitions independent. Muting retains composition duration and permits existing note/effect tails to finish. Track reordering, solo, volume, and live structural editing remain outside this change.

## Validation and documentation

The [as-built composition guide](../architecture/composition.md) documents data and scheduling. Migration and placement coverage lives in [arrangement tests](../../studio/tests/arrangement.test.ts) and [clip tests](../../studio/tests/clips.test.ts); [composition browser tests](../../studio/tests/composition.spec.ts) and [export tests](../../studio/tests/export.spec.ts) cover the UI and audio behavior.
