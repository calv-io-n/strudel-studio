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

### Hardware MIDI controllers

Studio's hardware bridge is a small Python process (`studio/midi/bridge.py`) that talks to the ALSA sequencer through `python-rtmidi`. Any class-compliant USB controller works without a vendor driver. Install the bridge once:

```bash
python3 -m venv .venv-midi
.venv-midi/bin/pip install -r studio/midi/requirements.txt
```

Restart Studio. Then connect the controller inside the app, which is the step most people miss: **plugging the device in is not enough. Studio only listens to ports you have selected.**

1. Plug the controller in and confirm Linux sees it: `aconnect -l` lists it as a client with one or more ports.
2. Open **Virtual MIDI** in the footer and expand **Devices, mappings & advanced controls**.
3. Under **MIDI devices**, pick the controller's port from the dropdown and click **Connect**. Controllers that expose several ports (for example, a "MIDI" port and a DAW auto-map port such as "HyperControl" or "DIN") normally want the plain MIDI one.
4. Press a key. Unmapped notes play the built-in synth, and each event appears in **MIDI feedback** tagged **ALSA**.

The selection is saved with the project, and the bridge reopens the port whenever Studio starts or **Reconnect MIDI** is pressed. Verified controllers: M-Audio Axiom AIR Mini 32.

As a one-off alternative, route the device into Studio's always-enabled **External MIDI input** port from a terminal while Studio is running:

```bash
aconnect 'Axiom A.I.R. Mini32':0 'Strudel Studio':0
```

That route lasts only until the bridge restarts, so prefer **Connect** in the app for anything you want to keep.

Your host must provide `/dev/snd/seq`; containers and remote hosts often do not. Missing hardware or Python does not prevent browser controls, synth playback or WAV export. `studio/midi/install.py` additionally installs separate MIDI MCP tooling and is not necessary for ordinary hardware MIDI.

## Configuration

All configuration is optional. `.env` is loaded by the server; never commit it.

| Variable | Default / purpose |
| --- | --- |
| `ELEVENLABS_API_KEY` | Unset; sound generation disabled |
| `STUDIO_PORT` | `5173`; localhost Studio port |
| `STUDIO_DATA_DIR` | `.studio/projects`; saved sessions and recovery |
| `STUDIO_SAMPLE_DIR` | `samples/ai`; generated, imported and recorded sounds |
| `STUDIO_LIBRARY_DIR` | `samples/libraries`; boot-time GitHub packs, read alongside `STUDIO_SAMPLE_DIR` |
| `STUDIO_GITHUB_TOKEN` | Unset; optional GitHub token sent only to `api.github.com` to raise the 60-per-hour discovery limit for imports and boot libraries |
| `STUDIO_LIBRARIES` | Unset; comma-separated public GitHub repo or folder links cached into the sample library at boot (see below) |
| `STUDIO_PYTHON` | `.venv-midi/bin/python` if present, otherwise `python3` |
| `STUDIO_DISABLE_MIDI` | Set `1` to disable the physical bridge; virtual controls remain usable |
| `STUDIO_CHROMIUM` | Optional Chromium executable override for browser tests |
| `STUDIO_E2E_ALSA` | Set `1` only for hardware browser tests on a compatible host |
| `STUDIO_FIXTURE_GENERATION` | Test-only local fixture generator; not real AI generation |

### Boot-time sample libraries

`STUDIO_LIBRARIES` lists public GitHub repositories or folders whose WAV files are downloaded once into `STUDIO_LIBRARY_DIR` when the server starts, then appear in the Sample library as an imported pack named after the repository or folder. The sync runs after the port is open and never blocks startup; each boot only fetches files that are not cached yet, and files that failed are retried. Only WAV files are cached at boot (MP3, OGG and FLAC need the browser importer). `.env.example` ships two openly licensed packs: `tidalcycles/sounds-tr808-fischer` (TR-808 one-shots, CC0, ~12 MB) and `switchangel/breaks` (breakbeat loops, public domain, ~2.5 MB). Unauthenticated GitHub API access allows 60 requests per hour; each library costs two to four requests per boot, so keep the list short or set `STUDIO_GITHUB_TOKEN`.

Both directories are gitignored, so deleting `samples/libraries/` and restarting re-downloads the packs. Changing `STUDIO_SAMPLE_DIR` changes the generated library, not the legacy sampler's `samples/` root. Keep source checkouts and data paths consistent when moving an installation.

## Troubleshooting

- **Wrong Node version:** use Node 24, then reinstall with `npm ci`.
- **Port already in use:** stop the other Studio instance or set `STUDIO_PORT`. The sampler still uses 5555; `npm run studio:app` starts only the app when the legacy sample server is unnecessary.
- **No sound:** click Play to unlock browser audio, check output volume, and try Neon Drive. External sample patterns require their referenced sources to be available.
- **Python/MIDI error:** use browser controls, or follow the MIDI setup above. Hardware support is optional.
- **Controller keys do nothing:** the device is probably not connected in Studio. Open **Virtual MIDI → Devices, mappings & advanced controls**, select its port and click **Connect**. Check that the **MIDI feedback** panel shows events; if it stays empty, run `aseqdump -p <client>` from `aconnect -l` to confirm the hardware is sending at all. Also make sure the route dropdown at the top of the drawer reads **OS MIDI loopback**, not **Browser**.
- **Missing browser in tests:** run `npm run setup:browser-tests`; use `-- --with-deps` for missing Linux libraries. The watcher may need its own pinned browser version, installed by `setup:watcher`.
- **Save failure:** keep the tab open, check data-directory permissions and connection status, then use Project → Save project. Export code before clearing browser storage or removing any recovery data.
- **Hosted access returns 403:** expected. This release is localhost-only, not a production web service. Do not remove the host/origin checks to expose it publicly.

## Data and backups

Stop Studio and back up `.studio/projects/` together with `samples/ai/` (or their configured equivalents). Keep any manually added `samples/` files that patterns reference. Session JSON contains sound IDs, not copies of audio. Restoring only JSON can leave missing sounds.

The browser also stores a recovery draft and UI preferences. It is a fallback, not a portable backup. Code export/import moves one pattern; WAV export creates audio and does not preserve editable sessions. Older single-pattern projects migrate when opened, so retain backups before upgrading.

See the [legacy workflow guide](human/guides/watcher-workflow.md) for optional recording and sample tools.
