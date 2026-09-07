# Hypnotic

Style of locked repetition with imperceptibly slow parameter drift. The notes never change but the texture does. The trance-state feeling — listeners zone out and lose track of time.

## Sound palette

- One or two main loops that don't change
- LFO-modulated filters
- Slowly opening / closing reverb sends
- A single repeated bass note
- Hi-hat or shaker loops

## Key tricks

### 1. Lock the loop, modulate everything else

The pattern stays the same for many bars. The cutoff, room, pan, or detune is what evolves:

```js
note("F2").s("sawtooth")
  .lpf(perlin.slow(32).range(200, 1500))
```

A 32-cycle perlin LFO is so slow you don't notice it modulating — you just notice that 30 seconds later the sound is brighter.

### 2. Long ribbons

`ribbon` locks in a "lucky" random pattern that the listener perceives as fixed:

```js
s("hh*16?").ribbon(0, 4)
```

A 4-cycle locked random pattern that loops as if it were composed.

### 3. Single-note bass

Resist melody. One note, all the time:

```js
note("F1").s("sawtooth").lpf(300).struct("1 ~ ~ 1 ~ ~ 1 ~")
```

The brain locks onto the unchanging pitch and stops questioning it.

### 4. Slowly-moving pan

Stereo movement that takes 16+ cycles to swing left to right:

```js
s("conga*4").pan(sine.slow(16).range(0, 1)).gain(0.5)
```

You don't perceive the pan move — you just feel the space shift.

## Starter pattern

```js
setcps(125 / 60 / 4)

stack(
  // Locked kick
  s("bd*4"),

  // Locked hat
  s("hh*8").gain(0.5),

  // Single-note bass with slow filter sweep
  note("F1").s("sawtooth")
    .struct("1 ~ ~ 1 ~ 1 ~ ~")
    .lpf(perlin.slow(32).range(200, 1200))
    .gain(0.7),

  // Locked melody fragment
  note("F4 ~ Ab4 F4").s("triangle").gain(0.4)
    .room(perlin.slow(24).range(0.2, 0.7)),

  // Wandering pan on percussion
  s("rim*8?").pan(sine.slow(16).range(0, 1)).gain(0.3),
)
```

## Knobs to turn

- **LFO speed** — slower is more hypnotic; 16-32 cycles is the sweet spot
- **Modulation range** — narrower = subtler drift
- **Number of layers** — 3-4 max; more breaks the trance
- **Tempo** — 120-130 BPM is the hypnotic zone

## Common mistakes

- **Too much variation** — if the listener notices a change, the spell breaks
- **Random ≠ hypnotic** — randomness needs `ribbon` or it just sounds chaotic
- **Drum fills** — fills are anti-hypnotic; resist the urge
- **Vocal samples** — they pull attention away from the loop

## Combines well with

- **Dark** for slow-burn dread
- **Atmospheric** for deep ambient-techno
- **Organic** for tribal / ritual vibes
- Minimal techno, dub techno, deep house, krautrock-influenced electronica
