# Live coding fundamentals (Strudel)

A beginner-to-intermediate walkthrough of Strudel, distilled from a workshop by live coder Lucy. Covers the philosophy, the core mini-notation, the pattern transformations she actually uses on stage, and how to handle longer samples. Good companion to `rhythm-techniques.md`, which goes deeper on grooves and randomness.

## Philosophy first

Live coding is improvised performance with code. The tradition since ~2000 has been to write everything from scratch on stage, but it's loosened up — polished, structured sets are equally valid now.

Two things are universal:

- **Unexpected results are part of the practice.** You can't always predict what your code will sound like. Embrace that — it's a feature, not a bug.
- **Energy beats quality.** "Quality" is what some establishment decides is good; energy is the personal response. Make work that has energy *for you*. Don't chase polish at the expense of feel.

Practical implication: when you're learning, treat it like a traditional instrument. Practice scales (mini notation), build muscle memory (typing speed, function recall), play badly on purpose, and don't worry about the recording.

## The mental model

Strudel runs a constant **cycle of time** in the background. Everything inside a sound pattern fits into one cycle, no matter how many events you cram in:

```js
sound("bd")              // one kick per cycle
sound("bd hh sd oh")     // four events per cycle — same total time
sound("bd hh sd oh cp")  // five events per cycle — same total time, faster pulse
```

More events = denser and faster, not longer. This is the *one rule* that everything else builds on.

## Mini notation cheat sheet

Mini notation is the green text inside `sound("...")`. It's a tiny pattern-description language with its own grammar. Every workshop demo lives inside this:

### Repeat: `*`

```js
sound("hh*8")    // eight hi-hats in a cycle
sound("bd*32")   // 32 kicks — saves you typing
```

### Slow: `/`

```js
sound("bd sd/2")  // bass drum every cycle, snare every other cycle
```

### Sample index: `:`

Each sample name is actually a folder of variations:

```js
sound("casio:0 casio:1 casio:0 casio:5")
```

Computers count from zero — `casio:0` is the first sample.

### Rest: `~`

Tilde is silence. On many keyboards it's `Shift + #`.

```js
sound("bd ~ sd ~ bd ~ sd ~")
```

### Subsequences: `[ ]`

Square brackets nest a pattern *inside* one step. The nested events share that step's slice of time:

```js
sound("bd [hh hh] sd hh")
sound("bd [hh [hh sd]] sd hh")  // nest as deep as you like
```

### One-per-cycle: `< >`

Angle brackets schedule events across cycles instead of within one. Each entry plays once per cycle, then it loops:

```js
sound("<bd sd cp>")    // bd cycle 1, sd cycle 2, cp cycle 3, repeat
```

Combine with the rest of the grammar to get variation that unfolds slowly:

```js
sound("casio [hh cp] casio ~ <casio:1 casio:3>")
```

### Probability: `?`

A trailing `?` gives an event a 50% chance of triggering. Cheap, instant variation:

```js
sound("hh*8?")            // hats sometimes drop out
sound("bd ~ sd? ~ bd ~ sd ~")
```

### Polymeters: `{ }`

Curly braces are the move that makes Strudel feel different from a sequencer. They let you run two patterns of *different lengths* against the same pulse:

```js
sound("{bd bd bd bd, hh hh hh hh hh}")
```

The first half (`bd bd bd bd`) sets the pulse — quarter notes. The second half (`hh hh hh hh hh`) inherits that pulse but has five events, so the patterns drift against each other. You get a long, evolving groove from a tiny amount of code.

### Euclidean rhythms

After a sample name, `(hits, steps)` spaces N hits as evenly as possible across M steps. Great for techno, African and Cuban patterns, and for anything where you want movement without thinking:

```js
sound("bd(3, 8)")
sound("metal(5, 8)")
sound("hh(7, 16)")
```

Pattern the numbers across cycles for evolving grooves:

```js
sound("metal(<3 5 6>, 8)")
```

## Transforming patterns

Once you have a sound pattern, you chain transformations onto it with `.functionName(...)`. You can break long chains across lines — Strudel reads them as one expression.

### `hurry` — speed and pitch

`hurry` speeds up the pattern *and* pitch-shifts the samples by the same factor. Repitching is the giveaway:

```js
sound("metal(3, 8)").hurry(2)     // twice as fast, an octave higher
sound("metal(3, 8)").hurry(0.5)   // half speed, octave lower
sound("metal(3, 8)").hurry("<0.5 1 1 2>")
```

### `fast` and `slow` — speed only

Same as hurry, but no pitch change:

```js
sound("bd hh sd hh").fast(2)
sound("bd hh sd hh").slow(2)
sound("bd hh sd hh").fast("<1 2 1 4>")
```

### `iter` — cycle through starting points

`iter(N)` plays the pattern N times, each starting one step later. Adds variety without changing what's in the pattern:

```js
sound("1 2 3 4").iter(4)
// cycle 1: 1 2 3 4
// cycle 2: 2 3 4 1
// cycle 3: 3 4 1 2
// cycle 4: 4 1 2 3
```

### `jux` — apply to one channel

`jux` runs the pattern dry in one ear and transformed in the other. Instant stereo width:

```js
sound("metal(3, 8)").jux(iter(4))
sound("hh*8").jux(rev)
```

### `every`, `sometimes`, `often`, `rarely`

Apply a transform on a schedule or on a probability:

```js
sound("metal(3, 8)").every(2, fast(2))     // every 2 cycles, double-speed
sound("metal(3, 8)").every("<2 4 8>", fast(2))  // patterned schedule

sound("metal(3, 8)").sometimes(fast(2))    // 50% of cycles
sound("metal(3, 8)").often(fast(2))        // 75% of cycles
sound("metal(3, 8)").rarely(fast(2))       // 25% of cycles
```

`every` is for structure ("change every 8 bars"). `sometimes`/`often`/`rarely` are for handing creative decisions to the computer.

### `chunk` — transform one piece at a time

`chunk(N, transform)` divides the pattern into N chunks and applies the transform to one chunk per cycle, rotating through them:

```js
sound("wind*8")
  .legato(0.5)
  .chunk(4, hurry("<2 0.5>"))
```

Cycle 1 the first quarter is hurried; cycle 2 the second quarter; etc. Like `iter` but for transformations instead of starting points.

### `off` — offset a layer on top

`off(amount, x => transform(x))` makes a copy of the pattern, transforms it, and offsets it by `amount`:

```js
sound("bd hh sd hh").off(0.125, x => x.fast(2))
sound("bd hh sd hh").off(0.25, x => x.iter(4))
```

`0.125` is an eighth-note offset against a quarter-note pattern — you get the original on the beat and a sped-up echo on the upbeat. This is one of the fastest ways to get syncopation.

The `x => x.fast(2)` syntax is an arrow function — it just means "take the pattern and do this to it." Don't get hung up on the syntax; copy the shape.

## Working with longer samples

Long samples (drum loops, vocals, pads) need different handling than one-shots. By default Strudel plays the whole sample on every trigger, which causes overlap.

### Load a custom sample

```js
samples({
  rhodes: 'https://freesound.org/some/url/rhodes.wav'
})

sound("rhodes")
```

See the official docs at strudel.cc → Making Sound → Samples → Loading custom samples for the full API.

### `loopAt` — stretch to cycle

`loopAt(N)` time-stretches the sample to fit N cycles:

```js
sound("rhodes").loopAt(2)       // stretch to 2 cycles
sound("rhodes").loopAt(2).fast("<1 2 4>")  // octave-jumping speed changes
```

If you stick to numbers that divide each other (1, 2, 4 or 1, 3, 6), the sample stays in key with itself.

### `cut` — kill overlap

`cut(N)` truncates a sound when the next one starts in the same cut group:

```js
sound("rhodes").loopAt(2).cut(1)
```

### `chop` — slice into equal pieces

```js
sound("rhodes").loopAt(2).cut(1).chop("<1 2 4>")
```

### `slice` — chop and reorder

`slice(N, pattern)` cuts the sample into N slices and lets you trigger them by index. This is how you breakbeat-chop a drum loop:

```js
sound("break").slice(8, "7 6 ~ 3 5 4")
sound("break").slice(8, "7 6 ~ 3 5 4").chunk(4, hurry(0.5))
```

The full mini notation works inside the slice pattern — rests, subsequences, angle brackets, the whole thing.

## A small vocabulary beats a big one

Lucy's most important point about performance: **don't try to memorize the docs**. Strudel has hundreds of functions. On stage, pick maybe 10–20 you know cold. Simplify your decisions so you can think about *music* instead of syntax.

A reasonable starter vocabulary for a first set:

| Category | Functions |
|---|---|
| Mini notation | `*` `/` `:` `~` `[ ]` `< >` `?` `{ , }` |
| Speed | `hurry` `fast` `slow` |
| Pattern transforms | `iter` `jux` `chunk` `off` |
| Conditional | `every` `sometimes` `often` `rarely` |
| Long samples | `loopAt` `cut` `chop` `slice` |
| Rhythm | euclidean `(hits, steps)` |

That's enough to build a whole performance. Anything beyond it is bonus.

## Building a sound palette

Aside from a small function vocabulary, build a small *sound* vocabulary too. Lucy groups samples into four categories:

- **Percussive** — drums, plus anything you can hit (a metal fence, a chair leg)
- **Bass** — kicks, low synths, sub samples, engine noise
- **Lead** — trebly, melodic, anything you'd put a topline on
- **Textural / weird** — wind, birds, field recordings, anything unstructured for atmosphere

Pick a handful in each category that you know work together, and use those for a whole set. Variety comes from the patterns and transformations, not from constantly swapping samples.

## Practice tips

- **Start simple.** One sound, one cycle. Add a transformation. Listen. Add another.
- **Delete and rewrite.** Don't be precious about code you like. Write it again from scratch — that's how the muscle memory builds.
- **Limit yourself.** Pick three functions for a session and only use those.
- **Use your ears, not the docs.** Try numbers. Listen. Adjust. The reference is for new functions; the keyboard is for known ones.
- **Anchor chaos with structure.** If you're using a lot of randomness or `iter`/`chunk`, keep at least one element steady (a kick, a hat) so the listener has something to hold onto.
- **Ship ugly.** Your first ten patterns will sound like demos. That's correct. Keep going.

## Putting it all together

Here's a small example using most of the above — a polymeter groove with an evolving lead and a chopped drum loop:

```js
setcps(120 / 60 / 4)

samples({
  rhodes: 'https://example.com/rhodes.wav',
  break:  'https://example.com/break.wav',
})

stack(
  sound("{bd bd bd bd, hh hh hh hh hh}").bank("RolandTR909"),
  sound("metal(<3 5 7>, 8)").hurry("<1 2 0.5>").jux(iter(4)),
  sound("rhodes").loopAt(2).cut(1).chop("<1 2 4>").every(4, rev),
  sound("break").slice(8, "0 1 ~ 3 4 5 ~ 7").sometimes(fast(2)),
)
```

Five lines of pattern, every technique from this guide visible somewhere. Most performances aren't more complicated than that — they're just better palettes and a better feel for which knob to turn next.

## Where to go next

- The official **strudel.cc/learn** is the canonical reference — browse it, but don't try to learn it all at once.
- `rhythm-techniques.md` in this folder covers groove-focused tricks (`ribbon`, `slider`, randomized sample picking, synthesized hats).
- YouTube has tons of live coding performance footage — algorave sets are a good starting point. Watch what other people limit themselves to.
- The Strudel reference panel in the REPL has every function with examples. When you find one that looks interesting, try it once and see if it earns a spot in your vocabulary.

The point isn't to know everything. It's to know enough that you can stop thinking about the keyboard and start thinking about the music.
