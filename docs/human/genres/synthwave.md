# Synthwave

**Tempo:** ~80–110 BPM (100 is the safe default; "fast synthwave" pushes 110–120,
the slower Carpenter-style sits 80–90).
**Feel:** 80s nostalgia. Four-on-the-floor kick + arpeggiated 16th-note bass +
lush sync-saw chords + gated-reverb snare on 2 and 4. The bass arpeggio carries
the song; the chords are the atmosphere.

## Starter pattern

```javascript
samples('http://localhost:5555')
samples('github:tidalcycles/Dirt-Samples')

setcps(110/60/4)

// kick: four on the floor
$: s("bd:6").struct("1 0 0 0 1 0 0 0 1 0 0 0 1 0 0 0")
   .gain(1)

// snare: backbeat on 2 and 4, with that gated-reverb tail
$: s("sd:4").struct("0 0 0 0 1 0 0 0 0 0 0 0 1 0 0 0")
   .gain(0.85)
   .room(0.6).size(0.4)   // the 80s gated reverb sound

// the iconic 16th-note arpeggiated bass — A minor: A A A C A
$: note("a1 a1 a1 c2 a1 a1 a1 c2 a1 a1 a1 c2 a1 a1 a1 c2")
   .s("supersaw")
   .lpf(800)
   .lpq(6)
   .gain(0.7)

// chord pad: Am F Dm (each chord twice = 2 bars per chord)
$: note("<[a3,c4,e4]!2 [f3,a3,c4]!2 [d3,f3,a3]!2>")
   .s("supersaw")
   .lpf(1800)
   .attack(0.05).release(0.4)
   .gain("0.2 1 1 1 1 1 1 1".mul(0.5))   // light sidechain duck on the 1
   .room(0.5)

// closed hats on the 8ths
$: s("hh*8").gain(0.25)

// open hat on the offbeats
$: s("oh").struct("0 1 0 1 0 1 0 1").gain(0.3)
```

## The bass arpeggio (this is half the genre)

A driving 16th-note pattern in a minor key. The starter uses the simplest
possible cell: **A A A C** repeating — root, root, root, minor third. Other
classic cells in A minor:

| Cell | Feel |
|---|---|
| `a a a c` | Kavinsky "Nightcall" simplicity |
| `a a c a a a c e` | More movement, octave hint |
| `a c e a c e a c` | Full root-third-fifth arp |
| `a a g a f a g a` | Walking, more melodic |

Key thing: the bass plays *under* the chord changes. When the chord moves
to F, the bass *can* follow (`f f f a f f f a`) or stay on A and become a
pedal tone — both are stylistically correct.

## The chords

Synthwave loves the **i – VI – iv** or **i – VI – III – VII** progressions
in minor. In A minor:

| Progression | Chords | Vibe |
|---|---|---|
| i – VI – iv | Am – F – Dm | The starter. Melancholic. |
| i – VI – III – VII | Am – F – C – G | Brighter, anthemic. |
| i – VII – VI – VII | Am – G – F – G | Driving, "outrun" sound. |
| i – iv – VI – v | Am – Dm – F – Em | Darker, Carpenter territory. |

Each chord usually lasts **2 bars** (`!2` in the starter). The voicing is
a simple triad in the 3rd–4th octave so it sits above the bass and below
the lead.

## The snare (gated reverb is non-negotiable)

The 80s snare = a tight crack with a big reverb tail that gets cut off.
Strudel doesn't have a real gated reverb, but you can fake it with high
`.room()` + low `.size()`:

```javascript
.room(0.6).size(0.4)
```

`size` controls the reverb decay length — keeping it small gives that
abrupt cutoff. Push `.room(0.8).size(0.3)` for the full Phil Collins "In
the Air Tonight" effect.

## The lead

The lead is the chord roots (A F D), one octave up, played as a slower
melody on top:

```javascript
$: note("<a4 f4 d4>")
   .s("supersaw")
   .lpf(2400)
   .lpq(8)
   .attack(0.02).release(0.3)
   .delay(0.4).delaytime(0.375).delayfeedback(0.4)
   .room(0.4)
   .gain(0.5)
```

For a saw-lead with bite, add `.distort(0.3)` and lower the lpf to ~1600.

## Knobs to push toward a sub-style

| Want | Change |
|---|---|
| **Outrun** (Kavinsky, The Midnight) | 100 BPM, big sidechain duck on the chord pad, prominent claps on 2 and 4, lead with lots of delay. |
| **Darksynth** (Carpenter Brut, Perturbator) | 110+ BPM, distort the bass with `.distort(0.5)`, replace pad with stab chords on 1, drop the lead. |
| **Chillwave / dreamwave** (FM-84, Timecop1983) | 90 BPM, swap supersaw bass for `s("sine").lpf(400)`, longer reverbs everywhere, slower chord changes. |
| **John Carpenter** | 80 BPM, drop chords entirely, lean on a single sustained pad note + the bass arp. Add `s("ride")` on offbeats. |

## Vocal chop / sample

Synthwave loves a film dialogue sample dropped in once or twice:

```javascript
$: s("vocals:0")
   .gain(0.6)
   .room(0.3)
   .delay(0.3).delaytime(0.5)
```

Don't chop it — let it play whole. The genre is nostalgic, not glitchy.

## Build / arrangement

Synthwave is less about builds/drops than D&B or trance. The arrangement
move is:

1. **Intro** — chords + arpeggio bass only (mute kick, snare, hats).
2. **Verse** — add the kick.
3. **Chorus** — add snare, hats, lead.
4. **Bridge** — mute the kick again, let the chords swell.
5. **Final chorus** — everything back in, push the lead `.gain` up by 0.1.

Toggle layers with `//`. The transitions between sections *are* the song.

## Common mistakes

- **Tempo too fast.** Above 120 BPM it stops being synthwave and becomes
  italo-disco or eurobeat. Stay in 80–115.
- **Snare without gated reverb.** A dry snare instantly kills the 80s vibe.
- **Bass arpeggio in straight 8ths instead of 16ths.** The 16ths are the
  point — the constant motion is what drives the genre.
- **Major key.** Synthwave is overwhelmingly minor. Major-key synthwave
  exists but it's rare and easy to get wrong (sounds like a sitcom theme).
- **Acoustic-sounding drums.** Use 808/909/Linn samples, not real drums.
  The whole genre is "what if the 80s never ended".
