# Genre guide

Recipes for building specific genres in Strudel from this scratchpad. Each
file is a pragmatic cheat-sheet: tempo, drum grid, bass shape, and the
small handful of tricks that make the genre *sound* like the genre instead
of "a beat at the right BPM".

These notes are biased toward what works in the live-coding loop here —
single-file scratchpad, sample bank at `localhost:5555`, layers toggled
with `//`. They are not a substitute for the full Strudel reference at
<https://strudel.cc/learn/>.

## Index

- [Drum and Bass](dnb.md)
- [Synthwave](synthwave.md)
- [Trance](trance.md)

## How to use a genre file

1. Copy the starter pattern at the top of the file into `patterns/scratch.strudel`.
2. Save. Listen. The skeleton should already sound recognisably like the genre.
3. Use the "knobs" section to push it toward a sub-style (liquid, neuro, jump-up, etc).
4. When it's a keeper: `cp patterns/scratch.strudel patterns/sets/<name>.strudel`.

## Adding a new genre

Create `docs/genres/<slug>.md` and link it from the index above. Follow the
shape of `dnb.md`: starter pattern → grid breakdown → bass recipe → knobs →
common mistakes. Keep it short. The goal is "I can sit down and have the
right beat in 60 seconds", not a music-theory essay.
