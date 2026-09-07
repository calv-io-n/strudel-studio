# Neon Drive

An original, simplified ’80s synth-pop demo for Strudel Studio: 168 BPM, A minor, 32 cycles (about 46 seconds). All sounds are synthesized locally. No sample download, MIDI hardware, or ElevenLabs key is needed.

```bash
npm run studio:demo
npm run dev
```

Open http://localhost:5173, choose **Sessions → Neon Drive**, select **Composition**, and press **Play**. Open the Composition drawer to see the arrangement. Stop silences all sounds; playback also stops automatically after cycle 32.

| Cycles | Lane 1 | Lane 2 |
| --- | --- | --- |
| 0–4 | — | Chords |
| 4–16 | Rhythm | Lead |
| 16–20 | — | Breakdown |
| 20–32 | Rhythm | Lead |

Each `.strudel` file is its own playable tab. Use Current tab to audition one part. Rhythm includes drums and bass; Lead includes the original melody and supporting chords, so the complete arrangement fits the existing two lanes.

Open **Virtual MIDI** and move **Lead brightness** (Knob 1 / CC 20) or **Bass cutoff** (Knob 2 / CC 21). The bindings work even while another tab is selected. For a code edit during playback, use **Apply changes**; saving or typing alone does not alter playback.

The installer adds `.studio/projects/Neon-Drive.json`. It does not change the recovery copy or replace an existing demo. Save under another project name to keep variations. To rebuild from edited source files, first rename the existing named demo file or save a backup and remove it yourself, then run the installer again.
