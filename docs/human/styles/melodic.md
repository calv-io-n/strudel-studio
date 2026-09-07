# Melodic

Style focused on tunes, hooks, and harmonic motion — the thing the listener hums after the track ends. Cuts across tempo and genre. You can be melodic in DnB, melodic in techno, melodic in ambient. The common thread: pitch matters more than texture.

## Sound palette

- **Leads** — pluck synths, square/saw waves, FM bells, clean piano
- **Counter-melody** — same synth pitched up an octave, or a contrasting timbre (bell against pluck)
- **Bass** — notes from the chord, not just root drones
- **Pads** — hold the harmony underneath so the lead has somewhere to live

Avoid noise textures, pure drones, and rhythm-only sounds — those belong in atmospheric.

## Key tricks

### 1. Lock to a scale

`.scale()` constrains pitches so wrong notes are impossible:

```js
note("0 2 4 7 4 2").scale("F:minor").s("piano")
```

The numbers are scale degrees, not semitones. Pick the scale once and the notes stay diatonic.

### 2. Call and response

Two patterns trading bars create a melodic conversation:

```js
stack(
  note("<[0 2 4 7] ~>").scale("F:minor").s("pluck"),
  note("<~ [7 4 2 0]>").scale("F:minor").s("pluck").gain(0.7),
)
```

Cycle 1 the lead plays, cycle 2 the answer plays.

### 3. Bass plays chord tones

A bass line that just hammers the root is fine for techno but kills melody. Pick notes from the chord:

```js
note("<0 5 3 7>").scale("F:minor").s("sawtooth").lpf(400)
```

These imply chord changes without needing a full pad.

### 4. Phrase repetition with variation

Repeat a phrase twice, then change the *last* note. The ear catches the change because everything else was familiar:

```js
note("<[0 2 4 7] [0 2 4 7] [0 2 4 7] [0 2 4 9]>").scale("F:minor")
```

## Starter pattern

```js
setcps(140 / 60 / 4)

stack(
  s("bd*4"),
  s("~ sd ~ sd"),

  note("<[0 2 4 7] [0 2 4 5] [0 2 4 7] [0 2 4 9]>")
    .scale("F:minor")
    .s("triangle")
    .room(0.3),

  note("<0 5 3 7>")
    .scale("F:minor")
    .sub(12)
    .s("sawtooth")
    .lpf(500),
)
```

## Knobs to turn

- **Scale** — try `F:dorian` or `F:lydian` for a different mood while keeping the same shapes
- **Octave range** — spread the lead across two octaves with `.add("<0 12 0 -12>")`
- **Density** — more notes per bar = busier; fewer = more memorable
- **Repetition vs variation** — pure repetition is catchy, pure variation is forgettable, ~80% repetition is the sweet spot

## Common mistakes

- **Random pitches with no scale** — sounds atonal even with a great rhythm
- **Stepwise motion everywhere** — predictable; throw in a leap occasionally
- **No counterpoint** — one melodic voice gets boring fast
- **Bass on root only** — kills harmonic interest

## Combines well with

- **Atmospheric** for the pad bed underneath
- **Dark** to make a melody feel emotionally weighty
- **Dreamy** for big floating hooks
- Trance, synthwave, melodic DnB, big-room house
