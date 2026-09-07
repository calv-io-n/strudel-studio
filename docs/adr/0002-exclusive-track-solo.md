# 0002: Exclusive track solo and opaque headers

- Status: Accepted
- Date: 2026-09-07
- Target: [Composition](../design/strudel-studio.md#composition)
- Extends: [0001](0001-expand-composition-tracks.md); its other decisions remain in effect
- Decision authority: requested track isolation and left-anchored masking correction

## Design before this change

The composition target offered track and clip mute but explicitly excluded solo. Headers were intended to remain visible during horizontal scrolling, but the padded scroll area exposed timeline content to the left of the sticky headers.

## Decision and departure

Add a visible exclusive Solo toggle to each track. Clicking another track transfers isolation; clearing Solo restores the stored mix. Solo respects explicit track and clip mutes, so the Mute button always silences a track even while soloed. Use an optional saved `soloTrackId`, validate its reference, and clear it when the track is removed. Include solo in live safe-boundary scheduling and captured WAV exports.

Remove the horizontal scroll-area inset and use opaque left-anchored headers and a matching ruler corner above all timeline layers. This fixes the existing header intent rather than changing it.

## Reason and alternatives

The user needs one-click track auditioning. Rewriting track mute flags would lose the prior mix, and allowing multiple solo tracks would make the requested one-track isolation less direct. Shared effective-mute logic keeps UI, playback, and export consistent.

## Consequences and validation

Existing v3 projects default to no solo; no version bump is needed for the optional field. Older v3 application builds ignore solo, so they will play/export the stored mute mix instead. Volume mixing and track reordering remain outside scope. Unit tests cover solo/mute precedence and persistence validation; browser checks cover switching, clearing, removal, and opaque anchoring across themes and viewport widths. See [as-built composition](../architecture/composition.md#exclusive-solo).
