# Setup and troubleshooting

## Supported environment

The initial release targets Linux with Node 24, npm, and a Chromium-based browser. Use `.nvmrc` if you manage Node with nvm. macOS and Windows are unverified; hardware MIDI currently uses Linux/ALSA only.

```bash
git clone https://github.com/calv-io-n/strudel.git
cd strudel
npm ci
npm run studio:demo
npm run dev
```

Open http://localhost:5173, choose **Sessions → Neon Drive**, set playback to **Composition**, and press **Play**. The sampler uses port 5555. Normal installation does not download a browser or run optional-tool checks. An existing browser is sufficient for Studio; Playwright Chromium is only needed by automated tests and the legacy watcher.

## Optional integrations

| Capability | Additional setup |
| --- | --- |
| Browser tests | `npm run setup:browser-tests`; on Linux add `-- --with-deps` for browser system libraries |
| Legacy VS Code/file watcher | Install Bun 1.2+, then `npm run setup:watcher`; start with `npm run dev:watcher` |
| Physical MIDI / OS loopback | Python 3, a virtual environment, `python-rtmidi`, and an available ALSA sequencer |
| ElevenLabs sounds | Copy `.env.example` to `.env`, supply your own `ELEVENLABS_API_KEY`, restart Studio |
| Recording and sample-processing scripts | FFmpeg; the download helper also needs yt-dlp |

The API key is optional. Sound generation sends the requested prompt to ElevenLabs and may incur provider charges. Studio generates only after an explicit action. Use sounds only according to their applicable rights and provider terms.

For the MIDI bridge alone:

```bash
python3 -m venv .venv-midi
.venv-midi/bin/pip install -r studio/midi/requirements.txt
```

Restart Studio and open **Virtual MIDI → Devices, mappings & advanced controls**. Your host must provide `/dev/snd/seq`; containers and remote hosts often do not. Missing hardware or Python does not prevent browser controls, synth playback or WAV export. `studio/midi/install.py` additionally installs separate MIDI MCP tooling and is not necessary for ordinary hardware MIDI.

## Configuration

All configuration is optional. `.env` is loaded by the server; never commit it.

| Variable | Default / purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Unset; sound generation disabled |
| `STUDIO_PORT` | `5173`; localhost Studio port |
| `STUDIO_DATA_DIR` | `.studio/projects`; saved sessions and recovery |
| `STUDIO_SAMPLE_DIR` | `samples/ai`; generated-sound library |
| `STUDIO_PYTHON` | `.venv-midi/bin/python` if present, otherwise `python3` |
| `STUDIO_DISABLE_MIDI` | Set `1` to disable the physical bridge; virtual controls remain usable |
| `STUDIO_CHROMIUM` | Optional Chromium executable override for browser tests |
| `STUDIO_E2E_ALSA` | Set `1` only for hardware browser tests on a compatible host |
| `STUDIO_FIXTURE_GENERATION` | Test-only local fixture generator; not real AI generation |

Changing `STUDIO_SAMPLE_DIR` changes the generated library, not the legacy sampler's `samples/` root. Keep source checkouts and data paths consistent when moving an installation.

## Troubleshooting

- **Wrong Node version:** use Node 24, then reinstall with `npm ci`.
- **Port already in use:** stop the other Studio instance or set `STUDIO_PORT`. The sampler still uses 5555; `npm run studio:app` starts only the app when the legacy sample server is unnecessary.
- **No sound:** click Play to unlock browser audio, check output volume, and try Neon Drive. External sample patterns require their referenced sources to be available.
- **Python/MIDI error:** use browser controls, or follow the MIDI setup above. Hardware support is optional.
- **Missing browser in tests:** run `npm run setup:browser-tests`; use `-- --with-deps` for missing Linux libraries. The watcher may need its own pinned browser version, installed by `setup:watcher`.
- **Save failure:** keep the tab open, check data-directory permissions and connection status, then use Project → Save project. Export code before clearing browser storage or removing any recovery data.
- **Hosted access returns 403:** expected. This release is localhost-only, not a production web service. Do not remove the host/origin checks to expose it publicly.

## Data and backups

Stop Studio and back up `.studio/projects/` together with `samples/ai/` (or their configured equivalents). Keep any manually added `samples/` files that patterns reference. Session JSON contains sound IDs, not copies of audio. Restoring only JSON can leave missing sounds.

The browser also stores a recovery draft and UI preferences. It is a fallback, not a portable backup. Code export/import moves one pattern; WAV export creates audio and does not preserve editable sessions. Older single-pattern projects migrate when opened, so retain backups before upgrading.

See the [legacy workflow guide](human/guides/watcher-workflow.md) for optional recording and sample tools.
