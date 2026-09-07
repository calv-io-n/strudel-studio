# Glitchy

Style of stutters, micro-edits, broken rhythms, and computational artifacts. Bit-crushed, chunked, randomized, ribboned for repeatability. The common feeling: the music sounds like a CPU having a moment.

## Sound palette

- Drum hits chopped into 16ths and 32nds
- Bit-crushed samples (`coarse`)
- Vocal stutters
- Click and pop sounds
- Anything with a sharp transient

## Key tricks

### 1. Chunk + transform

`chunk(N, transform)` divides the pattern into N parts and applies the transform to one chunk per cycle, rotating through them:

```js
s("bd hh sd hh").chunk(4, x => x.fast(4))
```

One quarter of the pattern stutters per cycle — a different one each time.

### 2. Bit crush with `coarse`

Reduce sample rate for digital crunch:

```js
s("rhodes").loopAt(2).coarse(16)
```

Higher numbers = more crushed. 8-32 is the usable range.

### 3. Repeatable chaos via ribbon

Generate something random, then ribbon it so the same chaos plays back every loop:

```js
s("bd*16?").degradeBy(0.5).ribbon(7, 1).fast(2)
```

The pattern is "random" but locked — you hear the same stutter every cycle.

### 4. Micro-edit with `off`

`off` layers a transformed copy at a small offset:

```js
s("hh*8").off(0.0625, x => x.fast(4).coarse(8))
```

The offset is a 32nd note — barely perceptible as a separate event.

## Starter pattern

```js
setcps(150 / 60 / 4)

stack(
  // Chopped kick
  s("bd*4")
    .chunk(4, x => x.fast("<2 4 8>"))
    .ribbon(0, 2),

  // Stuttering snare
  s("sd").beat("4, 12", 16)
    .sometimes(x => x.fast(8))
    .coarse(8),

  // Glitched melodic loop
  s("rhodes").loopAt(2).cut(1)
    .chop(16)
    .slice(16, "0 [3 5] 7 ~ 11 [13 15] 1 [4 6]")
    .ribbon(3, 2)
    .coarse(12),

  // Random clicks
  s("click*16?")
    .pan(rand)
    .ribbon(0, 1)
    .gain(0.4),
)
```

## Knobs to turn

- **`coarse` amount** — 4 (subtle) to 32 (destroyed)
- **`chunk` count** — 4 (mild glitch) to 16 (chaotic)
- **Ribbon length** — short = locked-in stutter, long = constant variety
- **Stutter speed** — 2 (cute), 4 (glitchy), 8 (broken)

## Common mistakes

- **Random without ribbon** — sounds noisy, not glitchy
- **Stutters everywhere** — needs a stable element to contrast
- **Same stutter every time** — vary `chunk` or `every` for movement
- **Forgetting groove** — even glitchy needs an underlying pulse the listener can grab

## Combines well with

- **Aggressive** for breakcore
- **Hypnotic** for microhouse
- **Lo-fi** for IDM
- Footwork, drill & bass, glitch hop, IDM, breakcore
