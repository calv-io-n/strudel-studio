# Trance

**Tempo:** ~138–145 BPM (140 is a safe default; "uplifting" sits 138–140,
"tech / hard" pushes 142+).
**Feel:** Four-on-the-floor with an offbeat bass. The whole genre is
"thumping kick + gated super-saw bass on the offbeats + euphoric lead +
8-bar breakdown". Get those four things right and it sounds like trance.

## Starter pattern

```javascript
samples('http://localhost:5555')
samples('github:tidalcycles/Dirt-Samples')

setcps(140/60/4)

// kick: four on the floor
$: s("bd").struct("1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0")
   .bank("RolandTR909").gain(1)

// offbeat clap (the trance "tssh tssh") — clap on the &s
$: s("cp").struct("0 0 1 0 0 0 1 0 0 0 1 0 0 0 1 0")
   .gain(0.5)

// closed hats on every 8th
$: s("hh*8").bank("RolandTR909").gain(0.35)

// open hat on every offbeat (the "tsst tsst")
$: s("oh").struct("0 1 0 1 0 1 0 1").bank("RolandTR909").gain(0.35)

// trance bass: super-saw, gated to the kick offbeats, G minor, two octaves down
$: note("g2 g2 g2 g2 a#2 a#2 d3 d3".sub(24))
   .s("supersaw")
   .struct("0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1")  // offbeat gate
   .lpf(sine.range(400, 1800).slow(8))
   .lpq(10)
   .room(0.2)
   .gain(0.7)

// the lead: clone of the bass, one octave UP, with delay
$: note("g2 g2 g2 g2 a#2 a#2 d3 d3".add(12))
   .s("supersaw")
   .struct("1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0")
   .lpf(2200)
   .delay(0.5).delaytime(0.375).delayfeedback(0.55)
   .pan(perlin)
   .room(0.4)
   .gain(0.55)
```

## The kick (this is half the genre)

Four on the floor. Every quarter note. Don't get clever. The variation
comes from *temporarily* breaking it during a build:

| Section | Kick struct |
|---|---|
| Main groove | `1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0` |
| Variation / fill | `1 0 0 0 1 0 0 0 0 0 1 0 0 0 1 0` (8, 11, 14 of 16) |
| Breakdown | comment the line out entirely |
| Build last bar | `1 0 1 0 1 0 1 0 1 1 1 1 1 1 1 1` (accelerating) |

## The gated bass

The defining sound. A super-saw playing on the **offbeats** (the spaces
between the kicks) so it sounds like the kick is "pumping" the bass. Two
ways to do it:

1. **Struct the rhythm** — the simple way, what the starter uses:
   ```javascript
   .struct("0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1")
   ```
2. **Sidechain duck** — gain pattern that drops on kick beats:
   ```javascript
   .gain("0.1 1 0.1 1 0.1 1 0.1 1".mul(0.7))
   ```

Either way, the bass note rings *between* kicks. Layer one octave below
for extra weight:

```javascript
$: note("g2 g2 g2 g2 a#2 a#2 d3 d3".sub(36))
   .s("sawtooth").lpf(150).gain(0.6)
```

## Key and progression

Trance lives in **minor keys** — G minor, A minor, F minor are the most
common. The starter is in G minor.

The classic trance chord progression is **i – VI – III – VII**, or in
G minor: **Gm – Eb – Bb – F**. Roman-numeral by scale degree (3 4 5 +6):

| Bar | Chord | Bass note |
|---|---|---|
| 1 | Gm (i) | G |
| 2 | Eb (VI) | Eb |
| 3 | Bb (III) | Bb |
| 4 | F (VII) | F |

As a half-note bass pattern:

```javascript
$: note("<g2 g2 eb2 eb2 bb2 bb2 f2 f2>".sub(24))
   .s("supersaw")
   .struct("0 1 0 1 0 1 0 1".fast(2))
```

## The lead

The lead is **the bass, one octave up, with delay**. This is the easiest
trick in the genre: clone the bass line, swap `.sub(24)` for `.add(12)`,
add a dotted-8th delay, ride a higher lowpass, and pan it with perlin
noise. Done.

Dotted-8th delay time at 140 BPM = `(60/140) * 0.75 = 0.321` seconds, but
`.delaytime(0.375)` (a dotted-8th at 160) sounds great too — trance is
forgiving here.

## Knobs to push toward a sub-style

| Want | Change |
|---|---|
| **Uplifting** (Above & Beyond, ASOT) | Slower (138 BPM), longer breakdown, big pad on `note("<g3 eb3 bb3 f3>")`, more reverb everywhere. |
| **Psy-trance** (Infected Mushroom) | 145 BPM, replace gated super-saw with a wobbling acid bass: `.s("sawtooth").lpf(sine.range(200,2000).fast(4)).lpq(20)`. |
| **Hard trance** (Scot Project) | 145+ BPM, distort the kick with `.shape(0.4)`, supersaw stab on the 1, no breakdown. |
| **Tech-trance** (John 00 Fleming) | 138 BPM, drop the lead, longer rolling bass, percussion-heavy, sparse. |

## The breakdown / build / drop

The trance arc is non-negotiable: groove → **breakdown** → **build** → **drop**.

### Breakdown (mute the kick)

Comment out the kick line. Keep the lead and pad. Let it breathe for 8–16
bars. Bring the lead's reverb up: `.room(0.7).size(0.9)`.

### Build (the riser + snare roll)

Add an "infinite riser" — pulse wave, 16th notes, pitch climbing with `time`:

```javascript
$: s("pulse").struct("1*16")
   .note(time.range(40, 90))
   .decay(0.05)
   .gain(0.5)
```

Plus a snare roll that accelerates:

```javascript
$: s("sd*<4 8 16 32>").bank("RolandTR909").gain(0.6)
```

### Drop

Uncomment the kick. Everything comes back at once. That's the drop.

## Vocal chop

```javascript
$: s("vocals:0")
   .chop(16)
   .speed(perlin.range(0.5, 2))
   .note("e4")
   .gain(0.6)
   .delay(0.5).delaytime(0.375).delayfeedback(0.5)
   .room(0.4)
```

Scrubbed in 16-note segments with perlin noise (the "tape loop" sound),
pitched to E, drowned in delay.

## Common mistakes

- **Bass on the kick beats instead of between them.** Sounds like house,
  not trance. The bass *must* be on the offbeats.
- **No breakdown.** Trance without a breakdown is just a house track.
- **Lead in a different key from the bass.** Easy to do when you write
  them separately; the fix is to literally clone the bass pattern and
  octave-shift it.
- **Tempo below 136 or above 148.** That's progressive house or hardstyle.
