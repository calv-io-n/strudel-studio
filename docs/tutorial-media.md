# Reproducible tutorial media

Videos are actual Studio screenshots encoded as WebM. The only visual capture overlay is a cursor indicator. MIDI is a virtual demonstration fixture routed through the app's Web MIDI adapter; these clips are not physical-device verification. No FFmpeg runtime or application server is added.

Build Studio, serve its production output on port 5193, then run:

```sh
STUDIO_GUIDE_URL=http://127.0.0.1:5193 FFMPEG=/path/to/ffmpeg node --import tsx scripts/record-input-guides.ts
STUDIO_GUIDE_URL=http://127.0.0.1:5193 FFMPEG=/path/to/ffmpeg node --import tsx scripts/record-drag-guide.ts
```

Input capture creates a disposable browser profile and a clean MIDI practice session with a triangle melody, a mapped gain slider, and a separate accompaniment phrase. The note menu, Record bar, metronome, editor feedback and accepted code are all the shipped UI. `STUDIO_GUIDE_ONLY` can select one input clip by basename. FFmpeg needs MJPEG input and the libvpx encoder.

| Asset basename in `studio/client/public/help` | Topic | Framing / outcome |
| --- | --- | --- |
| test-midi-browser | Record MIDI | 1000×570 crop from a 1000×820 browser; selected note menu, audition and Stop without capture |
| record-both-browser | Record audio | Independent Audio Input + MIDI toggles, one count-in, shared Stop/Keep, both saved sections |
| record-pattern-browser | Record MIDI | Same crop; arm owning phrase, Record, count-in, incoming notes, Stop and Keep take |
| record-solo-browser | Record MIDI | Same crop; identical destination with solo accompaniment mode |
| bind-slider-browser | Map a knob | Same crop; explicit function-name binding, virtual CC 20 and linked value changes |
| metronome-modes-browser | Tempo | Same crop; yellow count-in → yellow loop badge, playback, Stop, gray off |
| drag-pattern-browser | Arrange | 900px-wide crop starting 24px above the actual tab strip; height up to 320px; origin, ruler, lane and saved clip remain visible |

Each clip has a PNG poster and concise adjacent text. The existing MIDI illustration accompanies note videos; the existing connected-controller illustration is reused for slider binding. On narrow screens each illustration/video group stacks. Videos have native play controls, stay muted, and pause when their topic is hidden or help closes. Reduced motion pauses illustrations and media without removing their controls. Rebuild after capture to include the generated assets in the preview/deployment.
