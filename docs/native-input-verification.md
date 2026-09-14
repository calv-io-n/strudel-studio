# Native input walkthrough

`node --import tsx scripts/verify-native-inputs.ts` exercises the running app at `http://127.0.0.1:5192` using an isolated full Chrome profile. This opt-in walkthrough uses real GitHub downloads, Web MIDI, and microphone capture. It does not mock network responses, `requestMIDIAccess`, or `getUserMedia`.

It requires desktop Chrome, a working PulseAudio/PipeWire microphone, ALSA `aplaymidi`, and MIDI Through port `14:0`. The host microphone must be unmuted and receive a test sound. The script sends a three-note MIDI file through ALSA and connects that port through the app's MIDI settings. Its audio observer only measures playback output.

The walkthrough installs the external sample pack, renders its sampled composition, records MIDI to a pattern, records a clip variation, and records microphone audio into an audio tab and composition clip. It checks tab preview and soloed composition output, reloads the session, and downloads a project backup. Results, screenshots and WAV files go to `/tmp/strudel-native-artifacts`. Every run uses a new temporary browser profile.

## Current evidence

The real GitHub pack download (six HTTP 200 WAV responses), sampled rendering, native ALSA-to-Web-MIDI pattern capture, and native composition variation capture have passed on this host.

After the user unmuted the operating-system microphone, a new ten-second hardware take passed both audio-tab preview (peak 0.142822) and soloed composition WAV rendering (peak 0.109073). The take was saved as Audio take 2 on Track 3 in the existing native verification session. The session survived a reload and was downloaded as a project backup. The earlier muted take is retained as Audio take 1; it is not evidence of audible capture.

Evidence is in `/tmp/strudel-native-artifacts/microphone-unmuted-probe.json`, `microphone-composition.wav`, `completed-native-session.png`, and `native-input-session.studio.zip`. The follow-up resumed the existing isolated Chrome profile so its external sample installation and native MIDI captures were retained. The visible browser closed during some export attempts; a background-browser retry produced the validated export and backup.

The automated production browser suite separately covers microphone input using a known signal, capture recovery, MIDI capture, and metronome countdown/cancellation. All 77 unit tests and 41 browser tests passed, along with the production build.
