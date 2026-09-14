# Native input walkthrough

`STUDIO_VERIFY_URL=http://127.0.0.1:5193 node --import tsx scripts/verify-native-inputs.ts` exercises the running app using an isolated full Chrome profile. This opt-in walkthrough uses real GitHub downloads, Web MIDI, and microphone capture. It does not mock network responses, `requestMIDIAccess`, or `getUserMedia`.

It requires desktop Chrome, a working PulseAudio/PipeWire microphone, ALSA `aplaymidi`, and MIDI Through port `14:0`. The host microphone must be unmuted and receive a test sound. The script sends a three-note MIDI file through ALSA and connects that port through the app's MIDI settings. This verifies the native Web MIDI path; it is not a physical-keyboard test. Its audio observer only measures playback output.

The walkthrough installs an external sample pack, renders its sampled composition, records solo MIDI into a selected phrase, records MIDI with pattern accompaniment into another phrase, and records microphone audio into an audio tab and composition clip. It checks tab preview and soloed composition output, reloads the session, and downloads a project backup. Results, screenshots and WAV files go to `/tmp/strudel-native-artifacts`. Every run uses a new temporary browser profile.

## Current evidence

The September 13 follow-up run passed in session `Native-inputs-1789351607058`: six real GitHub WAV downloads returned HTTP 200; native ALSA-to-Web-MIDI captures saved into their owning pattern through the shared Record bar; a ten-second microphone take saved as Audio take 1 on Track 2. The session survived reload and project-backup download.

Measured output peaks:

| Check | Peak |
| --- | ---: |
| External sample composition | 0.839644 |
| MIDI pattern | 0.146445 |
| MIDI composition | 0.125372 |
| Microphone tab preview | 0.135174 |
| Microphone soloed composition | 0.128739 |

Evidence is in `/tmp/strudel-native-artifacts/native-probe.json`, the corresponding rendered WAV files, screenshots, and `native-input-session.studio.zip`. The probe recorded no browser errors. The final single-button MIDI flow, MIDI learning notice, and recorded-take playback fixes were subsequently covered by browser tests and regenerated real-app guide captures.

The automated production browser suite separately covers deterministic audio input, capture recovery, MIDI capture, and metronome countdown/continuous playback/cancellation. The production build, all 78 unit tests, and the full 51-test browser suite pass. Focused recovery and tutorial checks also pass after the final recovery-length fix. Browser audio assertions verify edited take gain in tab playback, live composition, and offline export, plus silence after the natural end instead of repeated sample triggers.
