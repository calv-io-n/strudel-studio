# Uplifting

Style of joy, release, and ascent. Major modes, supersaw leads, ascending lines, big builds, sidechain pumping. The common thread: the music is *going somewhere* and that somewhere is up.

## Sound palette

- Supersaw leads (multiple detuned saws stacked)
- Bright pluck synths
- Open hats, claps, snare rolls
- Big, bright pads on major chords
- Avoid: low cutoffs, minor 2nds, distortion (those belong to dark/aggressive)

## Key tricks

### 1. Major scale, ascending lines

The shape matters more than the specific notes. Going up = uplifting:

```js
note("<0 2 4 5 7 9 11 12>").scale("C:major").s("sawtooth")
```

A simple scale run is enough if the timbre is right.

### 2. Supersaw lead

Stack detuned sawtooths:

```js
note("<C5 E5 G5 C6>")
  .s("sawtooth")
  .detune(0.3)
  .gain(0.5)
  .room(0.4)
```

For a fuller effect, layer multiple `s("sawtooth")` lines at slightly different detunes.

### 3. Sidechain pumping

Duck the bass and pad on every kick — that "breathing" feel:

```js
stack(
  s("bd*4"),
  note("<C2 G1 A1 F2>").s("sawtooth")
    .gain(sine.range(0.3, 0.8).fast(4)),
)
```

Sync the LFO to the kick rate for the pump.

### 4. Snare rolls and builds

Snare hits accelerating into the drop:

```js
s("sd").fast("<1 2 4 8 16>").gain("<0.5 0.6 0.7 0.8 0.9>")
```

Each cycle twice as fast as the last. Pair with a riser noise sweep.

## Starter pattern

```js
setcps(132 / 60 / 4)

stack(
  // Four-on-the-floor
  s("bd*4"),
  s("~ ~ cp ~"),
  s("hh*8").gain(0.5),

  // Pumping bass
  note("<C2 C2 G1 A1>").s("sawtooth")
    .lpf(800)
    .gain(sine.range(0.3, 0.8).fast(4)),

  // Bright lead
  note("<[0 2 4 7] [2 4 7 9] [4 7 9 11] [0 2 4 7]>")
    .scale("C:major")
    .add(12)
    .s("sawtooth").detune(0.3)
    .room(0.5).gain(0.5),

  // Open hat for energy
  s("oh").beat("2, 6, 10, 14", 16).gain(0.4),
)
```

## Knobs to turn

- **Filter cutoff** — open it up over time as energy builds
- **Lead octave** — bright high lead = euphoric; mid = pleasant; low = unimportant
- **Sidechain depth** — subtle (0.6-0.9) to extreme (0.1-1.0)
- **Reverb size** — bigger room = more arena, smaller = intimate

## Common mistakes

- **Major chord on every beat** — cheesy; vary with sus2, add9, maj7
- **No build/release** — uplifting needs contrast; if it's always at 100%, nothing feels like a peak
- **Forgetting the drop** — the build matters more than the high
- **Too perfect** — even uplifting needs a bit of grit

## Combines well with

- **Melodic** for big tunes
- **Dreamy** for euphoric trance
- **Hypnotic** for progressive house
- Trance, EDM, uplifting DnB, big-room house, festival anthems
