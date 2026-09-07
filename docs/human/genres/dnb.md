# Drum and Bass

**Tempo:** ~170–180 BPM (174 is the canonical default).
**Feel:** Full-time, *not* half-time. The snare is on 2 and 4 of the bar at
the full 174, not on the 3 of an 87 BPM half-time bar. Getting this wrong
makes it sound like a plodding rock beat.

## Starter pattern

```javascript
samples('http://localhost:5555')
samples('github:tidalcycles/Dirt-Samples')

setcps(174/60/4)

// kick: positions 0, 7, 10 of 16
$: s("bd").struct("1 0 0 0 0 0 0 1 0 0 1 0 0 0 0 0")
   .bank("RolandTR909").gain(1)

// snare: positions 4, 12 of 16
$: s("sd").struct("0 0 0 0 1 0 0 0 0 0 0 0 1 0 0 0")
   .bank("RolandTR909").gain(0.95)

// 8th-note hats
$: s("hh*8").bank("RolandTR909").gain(0.4)

// super-saw bass, F minor, ducked by the kick
$: note("c#2 f2 d#2 d#2 a#2 c#2 f2 d#2".sub(12))
   .s("supersaw")
   .lpf(sine.range(400, 1600).slow(8))
   .lpq(8)
   .gain("0.2 1 1 1 1 1 1 0.2 1 1 0.2 1 1 1 1 1".mul(0.85))
   .room(0.15)
```

## The drum grid (this is the whole genre)

16-step bar. 1-indexed it reads:

```
step:  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
kick:  K  .  .  .  .  .  .  K  .  .  K  .  .  .  .  .
snare: .  .  .  .  S  .  .  .  .  .  .  .  S  .  .  .
hats:  H     H     H     H     H     H     H     H      (8th notes)
```

Or 0-indexed (the way the recipe is usually quoted): **kick on 0, 7, sometimes 10**;
**snare on 4, 12**.

The kick on step 8 (the "&" of 2) is the move that distinguishes D&B from
hip-hop. The optional kick on step 11 is the rolling push into the second
half of the bar. Drop it for a sparser feel, keep it for forward momentum.

### Things I keep getting wrong

- **Snare on the 3 only (half-time).** That's dubstep / trap, not D&B.
- **Snare on every 2 and every 4 with kick only on 1.** That's a rock backbeat.
- **Burying the kick under an `amencutup` layer.** The break is great as
  *texture*, but the programmed kit needs to be the dominant rhythm or the
  groove disappears. If you want the amen to lead, drop the programmed kit
  entirely and let the break be the drums.

## The bass

D&B bass is the second pillar. Three flavours that all live in the
starter:

1. **Sub** — pure sine, lowpassed below ~200Hz, locked to the kick rhythm.
2. **Reese** — detuned saw stack with a slow filter sweep. Sits in the mids.
3. **Super-saw** — Strudel's `supersaw` waveform, eighth notes, sidechain
   ducked on the kick. This is the modern Pendulum/Sub Focus sound.

Default key is **F minor** (notes used in the starter: C#, F, D#, A# — that's
the i, iv, ii, vi triad of F minor and lives in the genre's habitual mode).
Subtract 12 semitones with `.sub(12)` to drop the bass into sub register.

### Sidechain duck

Strudel doesn't have a real sidechain compressor, so we fake it with a
gain pattern that drops on kick beats. The pattern must match the kick's
struct exactly:

```javascript
.gain("0.2 1 1 1 1 1 1 0.2 1 1 0.2 1 1 1 1 1")
```

The `0.2` slots are at positions 0, 7, 10 — the same as the kick. Tweak
the duck depth (0.2) for more or less pump.

## Knobs to push toward a sub-style

| Want | Change |
|---|---|
| **Liquid** (Calibre, LSB) | Replace super-saw with `s("sawtooth").lpf(800)`. Add a Rhodes pad. Higher `.room()`. Drop the kick on step 11. |
| **Neurofunk** (Noisia, Black Sun Empire) | Reese bass with heavier `.distort()`, faster filter sweep, `lpq(20)`. Snare cracked harder. Kick punchier with `.shape()`. |
| **Jump-up** (DJ Hazard, Macky Gee) | Wobble the bass with `sine.range(200, 2000).fast(2)` on the lpf. Sparse drums. Big snare reverb tail. |
| **Drumfunk / amen-led** | Comment out the programmed kit. Use `s("amen").loopAt(2)` or `s("amencutup*16")` as the drums. |

## Adding a vocal chop

```javascript
$: s("vocals:0")
   .chop(8)
   .speed(perlin.range(0.5, 2))
   .gain(0.6)
   .delay(0.4).delaytime(perlin.range(0.1, 0.4)).delayfeedback(0.5)
```

Eighth-note segments, scrubbed with perlin noise so the order and pitch
mutate every cycle, then drowned in a delay with a wandering delay time.
The standard "chopped vox" texture.

## Build / drop

The simplest build:

1. **Mute the kick** by commenting out its `$:` line. Save.
2. **Bring in a riser** — pulse wave, short decay, pitch climbing with `time`:
   ```javascript
   $: s("pulse").struct("1*16")
      .note(time.range(40, 90))
      .decay(0.05)
      .gain(0.5)
   ```
3. Let it run for 4–8 bars. Uncomment the kick. That's your drop.

For a quarter-note kick "build to half-time" trick, replace the kick struct
with `"1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0"` for a few bars before the drop.

## Sample banks worth knowing

- `RolandTR909` — the canonical D&B kit (kick, snare, hats).
- `breaks165`, `breaks157` — full breakbeat loops at the named tempo.
- `amen`, `amencutup` — the amen break and pre-chopped slices.
- `github:yaxu/clean-breaks` — community break collection.
