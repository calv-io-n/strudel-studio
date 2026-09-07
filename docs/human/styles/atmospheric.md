# Atmospheric

Style of texture and space rather than events. Drums are optional. The listener should feel immersed in a place rather than tracked through a beat. Works as an ambient piece on its own or as the breakdown section of a dance track.

## Sound palette

- Pads (sustained, slow attack)
- Field recordings (rain, wind, room tone, water)
- White/pink noise filtered low
- Bell tones, FM resonant pings (sparse)
- Long sample loops (vocals, strings, anything tonal)

## Key tricks

### 1. Long `loopAt`

Stretch a sample across many cycles instead of one:

```js
s("rhodes").loopAt(8).room(0.8).gain(0.5)
```

Eight cycles is enough that the listener loses track of where the loop point is.

### 2. Room is the instrument

Reverb isn't an effect, it's the sound. Crank `.room()` and use a soft source:

```js
s("white").decay(2).room(0.9).gain(0.3)
```

### 3. Slow LFO on the filter

Movement without notes — pitch never changes but timbre breathes:

```js
note("F2").s("sawtooth").lpf(sine.slow(16).range(200, 1200)).room(0.6)
```

A 16-cycle LFO is so slow you don't perceive it as modulation. It just feels alive.

### 4. Sparse, off-grid hits

When something does happen, make it rare and avoid the downbeat:

```js
s("bell?").beat("3, 9", 16).room(0.9).gain(0.4)
```

## Starter pattern

```js
setcps(80 / 60 / 4)

stack(
  // Drone
  note("F2").s("sawtooth").lpf(sine.slow(20).range(150, 800)).gain(0.4),

  // Pad
  note("<F3 Ab3 C4 Eb4>").s("triangle").attack(2).release(4).room(0.9).gain(0.3),

  // Texture
  s("white").decay(0.5).room(0.95).gain(0.1).struct("1 ~ ~ ~ ~ ~ 1 ~"),

  // Optional sparse percussion
  s("bell?").beat("5, 11", 16).room(0.8).gain(0.3),
)
```

## Knobs to turn

- **`room` amount** — 0.6 to 0.95
- **LFO speed** — slower is dreamier
- **Density** — fewer events = more atmosphere; the temptation is always to add more
- **Filter cutoff range** — narrow = subtle, wide = obvious sweep

## Common mistakes

- **Adding a kick because it feels empty** — the emptiness is the point
- **Reverb too short** — needs at least 0.7 to feel atmospheric
- **Too many sounds** — atmosphere needs space; 2-3 layers max
- **Quantized timing** — atmospheric sounds should breathe past the grid

## Combines well with

- **Dreamy** for celestial moods
- **Dark** for unsettling ones
- **Hypnotic** for deep ambient-techno
- Ambient, downtempo, the breakdown of any dance genre
