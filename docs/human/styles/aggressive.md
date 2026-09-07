# Aggressive

Style of distortion, density, hard transients, low headroom. Loud isn't aggressive — *aggressive* is aggressive. The common feeling: the music wants to push you, not move you.

## Sound palette

- Distorted kicks and snares
- Reese basses, supersaw bass, distorted sub
- Hard, bright synth leads
- Cymbal crashes, white noise impacts
- Avoid: pads (mostly), soft pianos, mellow timbres

## Key tricks

### 1. Distort everything

`.distort()` adds saturation. Apply it to drums, bass, leads, almost everything:

```js
s("bd*4").distort(0.8)
```

### 2. Reese bass

A detuned saw with heavy filter modulation — the defining DnB / dubstep bass sound:

```js
note("F2").s("sawtooth")
  .detune(0.5)
  .lpf(sine.fast(0.5).range(200, 800))
  .distort(0.6)
  .gain(0.7)
```

Modulating the cutoff with a slow LFO is what makes it growl.

### 3. Hard transients

Short attack, no release tail. Drums should hit and stop:

```js
s("bd*4").attack(0).release(0.05)
```

### 4. Density

Layer 3-4 percussion elements at full energy. There's no "less is more" here:

```js
stack(
  s("bd*4"),
  s("sd*4").gain(0.5),
  s("hh*16"),
  s("clap").beat("4, 12", 16),
  s("crash").beat("0", 16).gain(0.6),
)
```

## Starter pattern

```js
setcps(174 / 60 / 4)

stack(
  // Aggressive kick
  s("bd").beat("0, 10", 16).distort(0.7),

  // Snare crack
  s("sd:4").beat("4, 12", 16).distort(0.5).hpf(200),

  // Distorted hats
  s("hh*8").distort(0.4).gain(0.5),

  // Reese bass
  note("<F1 F1 ~ G1>").s("sawtooth")
    .detune(0.5)
    .lpf(sine.fast(0.25).range(150, 700))
    .distort(0.7)
    .gain(0.7),

  // Bright lead stab
  note("<[0 ~ ~ 0] [3 ~ ~ 3]>")
    .scale("F:phrygian")
    .add(24)
    .s("sawtooth")
    .distort(0.6)
    .gain(0.6),
)
```

## Knobs to turn

- **Distortion amount** — 0.3 (warmth) to 0.9 (destruction)
- **Tempo** — faster reads as more aggressive (140-180 typical)
- **Density** — more layers up to a point of mush
- **Filter resonance** — high resonance + distortion = scream

## Common mistakes

- **Just turning everything up** — aggression is in the timbre, not the volume
- **No groove** — aggression without groove is just noise
- **Overdistortion to mush** — keep some clarity
- **Forgetting space** — even aggressive needs the occasional gap to feel hard

## Combines well with

- **Dark** for darksynth / industrial
- **Glitchy** for breakcore
- **Hypnotic** for industrial techno
- DnB (neuro / jump-up), dubstep, hardstyle, industrial techno, hardcore
