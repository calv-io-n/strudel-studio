# Dark

Style of weight, dread, and tension. Minor modes (especially Phrygian and Locrian), sub-heavy bass, low cutoffs, dissonant intervals. The thing they share is the feeling that something is *wrong*.

## Sound palette

- Sub bass and low drones (sine, sawtooth, low-pass filtered)
- Distorted noise (wind, machinery, metal)
- Detuned pads — slightly out of tune is unsettling
- Reverberated metallic hits (industrial percussion)
- Avoid: bright leads, major chords, anything sparkly

## Key tricks

### 1. Phrygian and Locrian modes

Phrygian has the flat 2 — that's what makes Spanish/dark music sound the way it does. Locrian has the flat 5, which is even more unstable:

```js
note("0 1 3 5 1 0").scale("F:phrygian").s("triangle")
note("0 1 3 4 6 4").scale("F:locrian").s("sawtooth")
```

The flat 2 (`1` here) right after the tonic (`0`) creates immediate tension.

### 2. Sub bass drone

Hold a low note under everything. Not a melody, not a riff — a drone:

```js
note("F1").s("sine").gain(0.7)
```

Optional: detune slightly with a second oscillator for a beating effect.

### 3. Tritone

The interval between root and flat 5 is the "diabolus in musica." Use sparingly:

```js
note("<0 ~ 6 ~>").scale("F:minor").s("brass").room(0.5)
```

Scale degree 6 in F minor is the flat 5 (B natural).

### 4. Low cutoff and resonance

Filter hard, add resonance for the "approaching from a tunnel" feel:

```js
s("bd*4").lpf(200).resonance(8)
```

## Starter pattern

```js
setcps(150 / 60 / 4)

stack(
  // Sub drone
  note("F1").s("sine").gain(0.6),

  // Slow Phrygian melody
  note("<0 1 3 1 0 6 5 1>").scale("F:phrygian")
    .s("sawtooth").lpf(600).resonance(5)
    .room(0.6).gain(0.5),

  // Distorted noise sweeps
  s("white").lpf(sine.slow(8).range(100, 800)).gain(0.2),

  // Sparse low kick
  s("bd").beat("0, 6, 10", 16).lpf(100).gain(0.9),

  // Metallic accent
  s("metal:3?").beat("4, 12", 16).room(0.8).hpf(2000).gain(0.4),
)
```

## Knobs to turn

- **Mode** — minor → dorian → phrygian → locrian (each darker than the last)
- **Sub level** — should be felt rather than heard
- **Cutoff** — keep it low, sweep it lower for tension
- **Reverb tail** — long tails on percussion feel cavernous

## Common mistakes

- **Slow ≠ dark** — fast can be dark; slow can be uplifting
- **Just minor** — minor isn't enough; the mode and intervals do the work
- **Too many notes** — dread comes from space, not density
- **Bright synths** — kills the mood instantly

## Combines well with

- **Atmospheric** for cinematic dread
- **Aggressive** for industrial/darksynth
- **Hypnotic** for slow-building horror
- **Melodic** when you want emotional weight
- Dark DnB, neuro, industrial techno, doom electronica, dark ambient
