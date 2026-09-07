# Lo-fi

Style of warmth, hiss, bandwidth limitation, and the sound of imperfection on purpose. The common feeling: this could have been recorded onto cassette in 1994.

## Sound palette

- Vinyl crackle samples
- Tape hiss
- Old drum machine sounds (TR-606, LinnDrum, dusty 808)
- Rhodes, Wurlitzer, mellow piano
- Slightly out-of-tune everything

## Key tricks

### 1. Low-pass everything

Cut the high end aggressively. No sparkle:

```js
s("bd*4").lpf(2000)
note("<C4 E4 G4>").s("rhodes").lpf(3000)
```

Above 5kHz should mostly be gone.

### 2. `coarse` for bit-depth reduction

Lower the apparent sample rate for the "ripped from a tape" texture:

```js
s("rhodes").loopAt(2).coarse(8)
```

Subtle works best — 4 to 12, not extreme.

### 3. Pitch wobble

Tape wobble — pitch that drifts a few cents over time:

```js
s("rhodes").loopAt(2).speed(sine.slow(8).range(0.99, 1.01))
```

A 1% pitch wobble at slow speed sounds exactly like a worn cassette.

### 4. Off-grid timing

Push events off the grid for human feel:

```js
s("bd ~ ~ bd ~ sd ~ ~").late(rand.range(0, 0.02))
```

Slight randomization of timing reads as "human."

### 5. Vinyl crackle bed

Layer continuous vinyl noise under everything:

```js
s("crackle").loopAt(4).gain(0.15)
```

## Starter pattern

```js
setcps(85 / 60 / 4)

stack(
  // Dusty drums
  s("bd ~ ~ bd ~ sd ~ ~")
    .lpf(2500)
    .gain(0.8)
    .late(rand.range(0, 0.02)),

  // Lo-fi hat
  s("hh*8")
    .gain("0.4 0.2 0.3 0.2 0.4 0.2 0.3 0.2")
    .lpf(4000),

  // Wobbly Rhodes loop
  s("rhodes").loopAt(4)
    .coarse(8)
    .speed(sine.slow(8).range(0.99, 1.01))
    .room(0.2)
    .gain(0.6),

  // Bass walk
  note("<F2 ~ Ab2 ~>")
    .s("sawtooth")
    .lpf(400)
    .gain(0.6),

  // Vinyl crackle
  s("crackle").loopAt(4).gain(0.15),
)
```

## Knobs to turn

- **LPF cutoff** — 2000-4000 is the lo-fi zone
- **`coarse` amount** — 4-12; subtle is better than obvious
- **Pitch wobble depth** — 0.01-0.03 of speed; more = warble
- **Crackle level** — should be felt not heard

## Common mistakes

- **Too much crackle** — turns into noise, not vibe
- **Too clean drums** — filter and saturate them
- **Perfect tuning** — lo-fi is *slightly* out of tune
- **Quantized timing** — needs human push / pull

## Combines well with

- **Organic** for chill / study music
- **Dreamy** for vaporwave / dream pop
- **Melodic** for the "lo-fi beats to study to" sound
- Lo-fi hip hop, vaporwave, indie electronic, chillhop, dream pop
