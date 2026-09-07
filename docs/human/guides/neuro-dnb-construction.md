# Building a neuro / drum & bass track in Strudel

A walkthrough for constructing a full-on neuro / grimy DnB track in Strudel — drums, ghost percussion, scrubbed neuro bass, breaks, riser, and chopped pads. Distilled from a Switch Angel tutorial. Pairs with `rhythm-techniques.md` (general grooves) — this one is genre-specific.

## The DnB skeleton

DnB drums are predictable in a good way: the kick and snare almost don't need to be randomized. You know what you want — just place it.

### Kick

Classic DnB kick lands on the 1 and the 11 of a 16-step bar (the "and of three" feel):

```js
sound("bd").beat("0, 10", 16).bank("RolandTR909")
```

Try different kick samples (`bd:0`, `bd:1`, etc.) until one sits right.

### Snare on 2 and 4

```js
sound("sd:3").beat("4, 12", 16)
```

Audition snare indexes — `sd:3`, `sd:4`, `sd:5` — until you find one that cracks.

### Synthesized white-noise hats

Skip sampled hats. Synthesize them from white noise with a short decay, then modulate the decay with a triangle wave for subtle groove:

```js
sound("white*8")
  .decay(tri.fast(2).range(0.05, 0.12))
  .gain(0.7)
```

Speeding up or slowing down the modulator (`tri.fast(2)` → `tri.fast(4)` → `tri.fast(0.5)`) gives different grooves. Shorter decay = snappier hats.

## Ghost percussion with biased randomness

The kick + snare + hat is the foundation. What gives DnB its motion is the *ghost* layer — rim shots, percussion, claps, tucked between the main hits at semi-random positions. Variation here is good.

Build it with `struct` driven by rounded random values, then constrain with `ribbon` and bias with multiplication:

```js
sound("rim:1")
  .struct(rand.round.segment(16))
  .ribbon(3, 1)
  .gain(0.6)
```

Read it inside-out:

1. `rand` is a 0–1 random signal
2. `.round` snaps it to 0 or 1
3. `.segment(16)` samples it 16 times per cycle — i.e. 16th notes
4. `struct` uses the resulting 1s and 0s as a hit/rest pattern
5. `ribbon(3, 1)` cuts a one-cycle slice starting at cycle 3, then loops it forever — same "lucky pattern" every time

### Bias the density

Since `rand` outputs 0–1 and `.round` flips at 0.5, the default is roughly 50% hits. Multiply to shift that:

```js
.struct(rand.mul(0.65).round.segment(16))   // sparser
.struct(rand.mul(1.4).round.segment(16))    // denser
```

Multiplying by less than 1 makes hits rare; multiplying by more than 1 floods them. Pattern the multiplier to build energy through a track:

```js
.struct(rand.mul("<0.6 0.7 0.8 0.9>").round.segment(16))
```

## Variation on the foundation

Once the basics are locked, sprinkle randomness selectively:

### Sometimes-kicks

Add a probabilistic extra kick on the 7 with `?`:

```js
sound("bd").beat("0, 7?, 10", 16)
```

50% of the time you get the extra hit, the rest of the time you don't.

### Stuttering hats

Make the hats occasionally double or quadruple:

```js
sound("white*8")
  .decay(tri.fast(2).range(0.05, 0.12))
  .sometimesBy(0.15, x => x.fast(2))
```

Four-stutters often sound like too much; two is usually plenty.

## The neuro bass — scrubbing a long stem

The defining sound of neuro DnB is a growly, modulated bass that constantly morphs. The trick in Strudel: don't try to *synthesize* it. Render a long, evolving bass loop in Serum (or whatever your synth is), import it as a sample, and **scrub** through it.

### Setup

```js
samples({
  neurobass: 'https://your-host/neurobass-stem.wav'
})
```

### Scrub at fixed positions

`scrub` jumps to a position from 0 to 1 in the sample. For long stems, the trick is to use integer indices divided by an arbitrary divisor — you get a scrappy, character-driven sequence:

```js
sound("neurobass")
  .scrub("3 12 27 5 ~ 41 8 33".div(50))
```

Why divide by 50? No reason — it's a long stem and 50 felt right. Pick numbers, listen, replace the ones that don't groove. There is no formula here.

### Scrub at random positions

For chaos, scrub randomly:

```js
sound("neurobass").scrub(rand.segment(8))
```

This picks a fresh position eight times per cycle — wild and choppy, classic neuro chaos.

### Scrub coherently with Perlin noise

Pure random feels disconnected. **Perlin noise** moves smoothly — it's a curve that meanders rather than jumping. If your bass stem has similar sounds clustered together (which it should), perlin scrubbing keeps the result coherent because nearby positions stay nearby:

```js
sound("neurobass").scrub(perlin.segment(8)).ribbon(10, 1)
```

Faster perlin = more frenetic. Slower = more groove:

```js
sound("neurobass").scrub(perlin.fast(0.25).segment(8))   // very smooth
sound("neurobass").scrub(perlin.fast(4).segment(8))      // jittery
```

### Constrain the scrub range

If you only like the sounds in a specific region of the stem, use `.range`:

```js
sound("neurobass").scrub(perlin.range(0.17, 0.3).segment(8)).ribbon(10, 2)
```

You're now only scrubbing through 13% of the file — the part you actually like.

### Sometimes reverse

Reversing a slice 15% of the time keeps the variation alive:

```js
sound("neurobass")
  .scrub(perlin.range(0.17, 0.3).segment(8))
  .ribbon(10, 2)
  .sometimesBy(0.15, x => x.speed(-1))
```

`speed(-1)` plays the slice backwards.

### Make it grimier

A phaser glues the chopped slices together and adds the noisia/grime sheen:

```js
.phaser(0.5)
```

Distortion deepens the growl. The race syntax for `distort` takes `amount:gain`:

```js
.distort("2.5:0.6")
```

The `0.6` lowers the post-distortion gain so you don't blow your speakers out.

### Patterned segmentation

Vary the chop rate per cycle:

```js
.scrub(perlin.range(0.17, 0.3).segment("<8 4 8 16>"))
```

## Visualizing what's going on

Two functions for sanity checks:

```js
sound("bd").beat("0, 10", 16).punchcard()    // grid view of hits
sound("neurobass").scrub(perlin.segment(8)).scope()  // waveform view
```

Use `punchcard` for drums, `scope` for bass and tonal stuff.

## Randomized delays for dub-style chaos

A delay with randomized time and feedback feels alive. The catch: random signals are time-based, so if you reuse the same `rand` for two parameters they'll line up. Speed one of them up to break the lock:

```js
sound("neurobass")
  .scrub(perlin.range(0.17, 0.3).segment(8))
  .delay(0.5)
  .delaytime(rand.range(0.1, 0.4))
  .delayfeedback(rand.fast(3).range(0.3, 0.7))
```

The `.fast(3)` makes the feedback random move 3x faster than the time random, so they desync.

## Adding chopped breaks

The other half of grimy DnB is a chopped break loop on top of the neuro bass:

```js
samples({
  break: 'https://your-host/amen-or-similar.wav'
})

sound("break")
  .loopAt(2).fit()
  .scrub(rand.segment(8))
  .ribbon(0, 0.5)
  .distort("3:0.4")
  .coarse(8)
  .decay(0.3)
```

A few things going on:

- `loopAt(2).fit()` matches the break to 170 BPM (or whatever your `setcps` is)
- Random scrub with 8 segments chops it into stutters
- `ribbon(0, 0.5)` locks in a half-cycle slice as a "lucky" stutter pattern
- `distort` adds aggression
- `coarse(8)` is a bit-crusher — lower sample rate, dirtier sound. Higher number = more crushed.
- `decay(0.3)` shortens the tail so chops don't bleed into each other

## The infinite riser trick

A really useful build-up: a pulse wave that's frequency-modulated by **time itself**, so the FM intensity grows forever:

```js
sound("pulse*8")
  .fm(time)
  .fmh(time)
  .room(0.6)
  .gain(0.4)
```

`time` is a signal that monotonically increases. Plugging it into both the FM amount and FM harmonics means the timbre gets richer and more chaotic the longer the pattern runs — perfect for endless tension before a drop.

Add reverb to smear it. Lower the gain because it gets piercing fast.

You can ribbon-stutter the whole thing for that pre-drop chop effect:

```js
.ribbon(0, 0.5)
```

## Chopping pads for liquid moments

To shift the energy from grime to liquid, mute the bass and chop a pad sample instead. Record some chord stabs in Serum (minor 7s, minor 9s — anything with motion) and import them:

```js
samples({
  swpad: 'https://your-host/sw-pad.wav'
})
```

### Rhythmic scrub positions

Place scrub points on eighth-note hits that line up with where the kick *would* be:

```js
sound("swpad")
  .scrub("0 0.625 0 0.375")
  .attack(0.05)
```

`0` lands at the start of the sample, `0.625` is five-eighths in, etc. Slow attack (`attack(0.05)`) gives the pad that pumping swell.

### Shift the whole window

To explore a different region of the sample without rewriting every position, just `add` an offset:

```js
.scrub("0 0.625 0 0.375".add(0.3))
```

Pattern the offset for variation across cycles:

```js
.scrub("0 0.625 0 0.375".add("<0.3 0.3 0.3 0.7>"))
```

Three cycles in one zone, one cycle in another — that's a structural change with one number.

### Liquid randomness

For the full liquid DnB feel, replace the offset with random:

```js
.scrub("0 0.625 0 0.375".add(rand))
```

Every hit picks a different chord shot. Use `ribbon` if you want it to lock into a repeatable pattern.

## A full track stack

Putting most of it together:

```js
setcps(170 / 60 / 4)

samples({
  neurobass: '...',
  break:     '...',
  swpad:     '...',
})

stack(
  // Drums
  sound("bd").beat("0, 7?, 10", 16).bank("RolandTR909"),
  sound("sd:3").beat("4, 12", 16).bank("RolandTR909"),
  sound("white*8").decay(tri.fast(2).range(0.05, 0.12)).gain(0.6),
  sound("rim:1").struct(rand.mul("<0.65 0.8>").round.segment(16)).ribbon(3, 1).gain(0.5),

  // Neuro bass
  sound("neurobass")
    .scrub(perlin.range(0.17, 0.3).segment("<8 4 8 16>"))
    .ribbon(10, 2)
    .sometimesBy(0.15, x => x.speed(-1))
    .phaser(0.5)
    .distort("2.5:0.6"),

  // Chopped break
  sound("break")
    .loopAt(2).fit()
    .scrub(rand.segment(8))
    .ribbon(0, 0.5)
    .distort("3:0.4")
    .coarse(8)
    .decay(0.3)
    .gain(0.5),
)
```

That's a whole DnB tune in 20 lines. Drop the bass line and bring in the pad for a liquid B-section, throw the riser on for the build, you're done.

## The mindset

Switch Angel's recurring point: **let the computer help you find ideas you wouldn't have come up with on your own.** Random + perlin + ribbon is the core loop:

1. Use random or perlin to generate something
2. Listen — is there anything in here?
3. Use `ribbon` to capture the section that worked
4. Tune the multipliers, ranges, and seeds until it grooves

You're not writing the music note-by-note. You're auditioning seeds and freezing the ones with energy. That's the whole technique.

## Cross-references

- **`rhythm-techniques.md`** — same author, broader rhythm-making vocabulary (`euclid`, `slider`, `n(irand)`, etc.)
- **`live-coding-fundamentals.md`** — Strudel basics, mini notation, transformation grammar
- **strudel.cc/learn** — full reference for `scrub`, `perlin`, `coarse`, `phaser`, `distort`, and friends
