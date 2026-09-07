# Finishing Strudel tracks in a DAW

Strudel is great for live patterns and performance, but turning a jam into a finished, mixable track is easier in a DAW. This is the workflow for taking a Strudel session and building it out into a "radio edit" without losing the original code.

## Capture from Strudel

- **Record loops individually when you can.** Stems give you mix control later — separate drums, bass, melody, pads, etc. into their own takes.
- **Recording everything together is fine for sketches** or when you want to move fast, but you lose per-stem control downstream.
- **Let takes run long.** A few minutes of a loop is much more useful than a tight one-bar capture, especially if any part of the pattern uses a randomizer — you can comb through and keep the variations you actually like.

## Bring stems into the DAW

Import the recordings into whichever DAW you use (Logic, Ableton, Reaper, Bitwig, Pro Tools, etc.). From there:

- **Arrange the song structure** — intro, verse, chorus, drops, outro. This is where Strudel's loop-based output becomes an actual track with shape.
- **Cut the best takes** out of the long recordings, especially from randomized sections.
- **Mix in the DAW**, not in Strudel. You get proper EQ, compression, automation, sends, and metering.

## Why this beats finishing inside Strudel

- **Easier mixing.** DAWs are built for it; Strudel isn't.
- **Easier collaboration.** Stems drop cleanly into someone else's session.
- **Edit without re-recording.** Want a different arrangement? Move regions around. No need to re-perform the loop.
- **The original Strudel code is untouched.** It's still there for live performances, remixes, or future edits — the DAW project is the *finished* version, not the *only* version.

## What stays in Strudel

The `.strudel` file is the source of truth for the *performance*. Keep it in `patterns/sets/` so you can:

- Play it live again
- Remix it later by tweaking the code
- Re-record fresh stems if you change your mind about an arrangement

The DAW project is downstream of that — it's one finished interpretation, not a replacement.
