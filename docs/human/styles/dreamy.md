# Dreamy / Ethereal

Style of fluid, weightless, slightly unreal. Detuned, chorused, reverb-soaked, often with reversed samples. The common feeling: the listener isn't sure what's a sample and what's a reflection.

## Sound palette

- Bell tones, FM keys, glassy plucks
- Pad samples with slow attack
- Reversed sounds (samples played at speed -1)
- Vocal samples, especially "ah" or "oh"
- Light percussion (no kick, or a muted one)

## Key tricks

### 1. Detune everything

Slight pitch drift makes things feel non-physical:

```js
note("<C5 E5 G5 B5>").s("triangle").detune(0.1).room(0.7)
```

Stack the same line twice with different detune amounts for thickness.

### 2. Reverse samples

`.speed(-1)` plays a sample backwards. Reversed pads have no transient — they swell into existence:

```js
s("rhodes").speed(-1).room(0.8).gain(0.6)
```

Pair with a forward version on the same cycle for an "in then out" effect.

### 3. Long attack and release

Soft envelopes — nothing should hit hard:

```js
note("<C4 G4 E5 G4>").s("triangle")
  .attack(0.5).release(2)
  .room(0.8).gain(0.4)
```

### 4. Lydian mode

The sharp 4 in Lydian is what gives it that floating, unresolved feel:

```js
note("<0 4 7 11 7 4>").scale("C:lydian").s("triangle").room(0.7)
```

## Starter pattern

```js
setcps(70 / 60 / 4)

stack(
  // Reversed pad swell
  s("rhodes").speed(-1).room(0.85).gain(0.4),

  // Glassy lead in Lydian
  note("<[0 4 7] ~ [2 6 9] ~>")
    .scale("C:lydian")
    .add(24)
    .s("triangle").detune(0.15)
    .attack(0.3).release(1.5)
    .room(0.8).gain(0.4),

  // Bell sparkle
  s("bell?").beat("3, 7, 11", 16).room(0.9).hpf(3000).gain(0.3),

  // Soft heartbeat percussion (optional)
  s("bd").slow(2).gain(0.4).lpf(200),
)
```

## Knobs to turn

- **Detune** — 0.05 (subtle) to 0.3 (warbly)
- **Reverb size** — go big
- **Attack time** — slower is dreamier
- **Mode** — Lydian (#4) is uniquely dreamy; Major works; minor works if soft

## Common mistakes

- **Reverb mud** — too much reverb on too many sounds becomes one wall of noise
- **Hard transients** — even one hard hit breaks the spell
- **Too rhythmic** — dreaminess and groove fight each other; pick one
- **Bright lead with no body** — dreams need mid-range warmth, not just sparkle

## Combines well with

- **Atmospheric** for ambient-leaning tracks
- **Melodic** for memorable dreamlike hooks
- **Lo-fi** for vaporwave / dream pop
- Synthwave (especially the John Carpenter side), trance breakdowns, ambient, vaporwave
