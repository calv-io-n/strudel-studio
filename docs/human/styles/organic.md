# Organic

Style of acoustic-feeling, hand-played, slightly imperfect. Real-world samples, gentle swing, soft transients. The common feeling: humans made this in a room, not algorithms in a server.

## Sound palette

- Field recordings (rain, footsteps, birds, room tone)
- Acoustic instrument samples (guitar, piano, hand drums)
- Soft synths (sine, triangle, mellow saws)
- Tape and vinyl noise (light)
- Avoid: bright digital sounds, sub bass, distortion, anything obviously synthetic

## Key tricks

### 1. Push events off the grid

Quantization is the enemy. Use fractional positions in `beat`:

```js
s("bd").beat("0, 4.05, 8, 11.95", 16)
```

Tiny fractional offsets are how live drummers play. The grid is for robots.

### 2. Velocity variation

Real drummers don't hit the same drum at the same volume twice:

```js
s("bd*4").gain("0.9 0.8 0.95 0.75")
```

Subtle variation makes the loop feel played.

### 3. Room reverb, not plate

Use `room` set to small-to-medium values that simulate a physical space, not a hall:

```js
s("guitar").loopAt(2).room(0.3).gain(0.6)
```

0.2 to 0.4 is the "small room" sweet spot.

### 4. Acoustic source samples

Load real instruments alongside the synthetic ones:

```js
samples({
  kalimba: 'https://...',
  guitar:  'https://...',
})

s("kalimba").note("<C5 E5 G5 E5 D5>").room(0.3)
```

A simple loop of a real instrument feels organic next to all-synth tracks.

## Starter pattern

```js
setcps(85 / 60 / 4)

stack(
  // Kick on slightly off positions
  s("bd").beat("0, 4.05, 8, 11.95", 16).gain("0.9 0.8 0.95 0.75"),

  // Soft acoustic snare
  s("sd:2").beat("4, 12", 16).room(0.3).gain(0.6),

  // Brushed hat with velocity variation
  s("hh*8")
    .gain("0.5 0.3 0.4 0.3 0.5 0.3 0.45 0.3")
    .room(0.2),

  // Soft melodic line
  note("<0 2 4 7 4 2 0 ~>")
    .scale("F:major")
    .s("triangle")
    .attack(0.05).release(0.4)
    .room(0.3).gain(0.5),

  // Field recording bed
  s("rain").loopAt(8).gain(0.15),
)
```

## Knobs to turn

- **Position offset** — 0.05-0.15 of a step is the human zone
- **Velocity range** — keep within 30% (0.7-1.0) so it feels intentional
- **Reverb size** — small rooms only; 0.2-0.4
- **Field recording level** — should be felt not heard; 0.1-0.2

## Common mistakes

- **Too tight** — quantized = robotic
- **Too loose** — sloppy ≠ organic
- **All organic, no contrast** — needs at least one synthetic element to feel intentional
- **Overusing rain/birds** — every organic track has them; pick a different texture

## Combines well with

- **Melodic** for folk-electronica
- **Atmospheric** for ambient field recording pieces
- **Lo-fi** for chill / study music
- Downtempo, folktronica, lo-fi hip hop, post-rock, ambient
