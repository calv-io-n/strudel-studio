# Unified recording verification

All new recording starts and stops from the top Record button or the transport Stop control. The single metronome supplies count-in for every source. There is no separate audio Record button or MIDI settings form.

| Source / requirement | Implementation | Application evidence |
| --- | --- | --- |
| Microphone input | TimelineRecording captures the input, places its take, and saves on Stop | pages.spec.ts: composition Record/Stop; dry and wet takes; permission cancellation; interrupted and failed-save recovery |
| Selected note phrase to code | PerformancePanel uses the same Record/Stop and metronome; Keep take publishes the selected phrase | launch.spec.ts: both accompaniment modes, stable destination across tabs, countdown exclusion, failed acceptance and reload recovery |
| Highlighted-note audio | Its isolated output feeds TimelineRecording, without the sample-library recorder form | launch.spec.ts: highlighted audio creates one take on Track 3; playback peak exceeds 0.001 |
| MIDI instrument audio | Its output feeds TimelineRecording; selecting it replaces an armed phrase source | launch.spec.ts: instrument capture with microphone access forced to fail; count-in, save, reload, and audible playback with metronome off |
| Old audio recovery | RecordingPanel only reviews retained audio in the Record bar; it has no start/setup methods | launch.spec.ts: seeded old-format wet take is retained and saved even without a separate dry stream |
| Edited recorded-take effects | Tab playback, composition playback and export share timed take playback with the source effects | pages.spec.ts: saved/reloaded gain is measured in all three paths for dry and wet takes; later pattern cycles remain silent |

The MIDI/browser-audio fixtures are deterministic application tests, not physical-device evidence. The separate native walkthrough is described in native-input-verification.md.

Run `npm run studio:build`, `npm run studio:test`, and `npm run studio:e2e`. The Playwright configuration starts the built static application and exercises its visible controls. Real-app tutorial captures are reproducible with scripts/record-input-guides.ts; see tutorial-media.md.

Final local verification: production build passed, 78 unit tests passed, and all 53 Playwright tests passed. Refreshed tutorial media passed a separate playback/close check.

The subsequent #51 change replaces the exclusive source selection and new-audio-tab workflow with independent Audio Input/MIDI toggles and same-pattern recording. See [combined recording](combined-recording.md) and `combined.spec.ts` for the current destination and simultaneous-input checks. The release above was deployed through PR #52 before this follow-up.
