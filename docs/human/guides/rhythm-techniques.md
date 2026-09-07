# Rhythm techniques in Strudel

A grab-bag of drum-pattern techniques for building grooves in Strudel — from a basic four-on-the-floor up to randomized, ribbon-constrained, slider-controlled grooves you can play live.

## 1. Start with a steady hi-hat

The simplest entry point — eighth-note hats:

```js
sound("hh*8")
```

`*8` repeats the sample eight times across one cycle. Turn it down if it's hot.

## 2. Kick with `struct`

`struct` takes a pattern of `1`s and `0`s and turns it into hits and rests:

```js
sound("bd").struct("1 0 0 1 0 0 1 0")
```

Bland on its own — perfect launching pad for polymeters.

## 3. Polymeter with `{}`

Curly-brace notation lets you nest a different subdivision against the main pulse:

```js
sound("bd").struct("1 0 0 {1 0 1}%8")
```

Already vibier than straight quarters.

## 4. Visualize with `punchcard`

When you can't tell what a pattern is doing, slap `.punchcard()` on it:

```js
sound("bd").struct("1 0 1 0 1 0 1 0").punchcard()
```

## 5. Pick a drum bank

The Sounds → Drum Machines panel has the classics built in. Assign once, reuse everywhere:

```js
const dbank = "RolandTR909"

stack(
  sound("hh*8").bank(dbank),
  sound("bd").struct("1 0 0 1 0 0 1 0").bank(dbank),
)
```

You can swap `RolandTR909` for `RolandTR808`, `RolandTR707`, etc., or import your own samples.

## 6. Place hits with `beat`

When you know exactly which 16th-notes you want a hit on, `beat` is more direct than `struct`:

```js
sound("sd").beat("4,12", 16).bank(dbank)
```

That's a snare on the 4th and 12th step of a 16-step bar — classic backbeat.

## 7. Euclidean rhythms

Spread N hits as evenly as possible across M steps. Great for techno kicks and African/Cuban-influenced patterns:

```js
sound("bd").euclid(4, 16)   // four-on-the-floor
sound("bd").euclid(5, 16)   // syncopated
sound("bd").euclid(7, 16)   // busier, off-grid feel
```

And you can pattern the numbers themselves across cycles:

```js
sound("bd").euclid("<5 7>", 16)
```

Cycle 1 has five hits, cycle 2 has seven, then it loops.

## 8. Trap-style hats with randomness

Stack `sometimes` with `choose` to occasionally double or quadruple a hit:

```js
sound("hh*8")
  .sometimesBy(0.1, x => x.fast(choose(2, 4)))
```

10% of the time, a hat gets repeated 2x or 4x — that flammy, rolling trap feel.

## 9. Setting BPM

Strudel uses cycles per second, not BPM. Convert with:

```js
setcps(140 / 60 / 4)   // 140 BPM in 4/4
```

## 10. Push events off the grid for groove

UK garage and other shuffle-based styles depend on hits landing *just* off the beat. `beat` accepts fractional positions:

```js
sound("bd").beat("0, 7.2, 10", 16)
sound("sd").beat("4, 11", 16)
```

The `7.2` instead of `7` shifts that one event a hair late. Tiny change, big swing.

## 11. Randomize sample selection with `n`

Inside a sound bank, each subdirectory has multiple samples (`bd:0`, `bd:1`, ...). Use `n` with `irand` to pick randomly:

```js
sound("bd").beat("0, 7.2, 10", 16).n(irand(5))
```

Every kick is now a different sample from the first five in the bank. Often this is *too* random — see ribbon below.

## 12. Constrain randomness with `ribbon`

`ribbon` is the secret weapon. Picture all of time as a ribbon of randomness — `ribbon` cuts a piece out and loops it. You get variation, but the same variation every time:

```js
sound("bd")
  .beat("0, 7.2, 10", 16)
  .n(irand(5))
  .ribbon(0, 1)     // start at cycle 0, length 1 cycle
```

Try different start cycles to find a "seed" you like:

```js
.ribbon(200, 2)   // cycle 200, two cycles long
```

This is how you make random patterns *performable* — you're not at the mercy of fresh randomness every play.

## 13. Probabilistic claps with `?`

Append `?` to an event to give it a 50% chance of triggering:

```js
sound("cp*16?").bank(dbank)
```

Combine with `degradeBy` to thin it out further:

```js
sound("cp*16?").degradeBy(0.6).ribbon(20, 2)
```

Then ribbon it so the same "lucky pattern" loops.

## 14. Slider-controlled energy for live performance

Wrap a degrade amount in a slider so you can drive intensity by hand during a set:

```js
sound("cp*16").degradeBy(slider(0.6, 0, 1))
```

Start sparse at the top of a song, push the slider up as energy builds. Same trick works on kicks, hats, anything degradable.

## 15. Synthesize a hi-hat from white noise

Sometimes you want a hat that isn't in any sample pack:

```js
sound("white")
  .decay(0.05)
  .gain(1.2)
```

Modulate the decay with a sine wave for a hat that "breathes":

```js
sound("white")
  .decay(sine.fast(4).range(0, 0.1))
```

`sine` normally swings 0→1; `.range(0, 0.1)` constrains it. `.fast(4)` makes it cycle four times per bar. Twiddle the numbers — that's where the sound design lives.

## Putting it together

A single stack pulling most of these together:

```js
setcps(140 / 60 / 4)
const dbank = "RolandTR909"

stack(
  sound("white").decay(sine.fast(4).range(0, 0.1)),
  sound("bd").beat("0, 7.2, 10", 16).n(irand(5)).ribbon(200, 2).bank(dbank),
  sound("sd").beat("4, 11", 16).bank(dbank),
  sound("cp*16").degradeBy(slider(0.6, 0, 1)).ribbon(20, 2).bank(dbank),
)
```

Five lines, a full groove with live-tweakable energy. Most of the interesting Strudel tracks aren't more complicated than this — they're just better seeds, better ribbons, better timing offsets.

## Where to go next

- **Euclidean rotations** — `euclidRot(hits, steps, rotation)` for shifting the same rhythm around the bar
- **Scale-aware melody** with `n(...).scale(...)` — same randomness/ribbon tricks apply to pitch
- **Sample chopping** with `slice` and `splice` for breakbeat manipulation
- **`pick`/`pickF`** for swapping whole patterns based on a slider or trigger

The official reference at [strudel.cc/learn](https://strudel.cc/learn/) covers all of these — but the techniques above are what actually make patterns *feel* like music instead of demos.
