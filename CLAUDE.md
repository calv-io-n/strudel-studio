# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Strudel Studio**: a local-first workspace for writing [Strudel](https://strudel.cc/) patterns, arranging them into a composition, performing with MIDI, and exporting WAV. The app lives under `studio/` (TypeScript, Node 24, Vite, CodeMirror, `@strudel/*` packages) and is the daily driver. An older "external editor + strudel.cc watcher" workflow still exists as an explicit opt-in and is documented at the end of this file.

The user is on **Linux** with a **GoXLR** mixer and an **M-Audio Axiom AIR Mini 32** controller, and uses this for both noodling and live streaming via OBS.

Read `README.md` for the product overview, `docs/workspace.md` for what the UI does, `docs/setup.md` for installation and env vars, `docs/architecture/README.md` for code boundaries, and `docs/adr/` for decisions. `COMPOSER.md` and `docs/human/` are about *making music* rather than the toolchain; go there when the user asks about patterns, genres or arrangement.

## Commands

```bash
npm ci                          # plain install; there is no postinstall hook anymore
npm run dev                     # daily driver: sampler (port 5555) + Studio server (port 5173) under concurrently
npm run studio:app              # Studio server only (tsx studio/server/index.ts)
npm run sampler                 # @strudel/sampler only, serving ./samples
npm run studio:demo             # install the Neon Drive demo session into .studio/projects

npm run studio:build            # tsc --noEmit type check, then vite build
npm run studio:test             # unit/integration tests (node:test via tsx) in studio/tests/*.test.ts
npm run studio:e2e              # Playwright browser suite in studio/tests/*.spec.ts
npm run setup:browser-tests     # playwright install chromium (add -- --with-deps on a fresh Linux box)

npm run rec -- vocals/<name>    # record from PulseAudio source into samples/<name>.wav
npm run yt  -- <url> [name] [range]   # pull audio from YouTube into recordings/
npm run chop -- <input> <outdir>      # split a recording on silence
npm run trim -- <input> <s> <d> <name>
npm run norm -- <file_or_dir>   # loudness-normalize .wav files in place (.bak preserved)

# Legacy watcher (see bottom of file)
npm run setup:watcher           # needs Bun 1.2+; applies the strudel-server patch and installs its Chromium
npm run dev:watcher             # sampler + strudel-server watcher on patterns/scratch.strudel
npm run save -- <name> [--force] [--clear] / npm run load -- <name> [--force] / npm run reload
```

There is no linter. CI runs build, unit tests and the browser suite on Linux/Node 24. Run `npm run studio:build && npm run studio:test` before calling a change done; run the e2e suite for anything touching UI flows.

## Architecture: Studio at runtime

```
Browser (localhost:5173)             studio/server/index.ts (Node)
  client/main.ts  ── HTTP/WS ──▶   localhost-only API, project store (.studio/projects),
  client/engine.ts (Strudel audio)   sound-generation jobs, MIDI bridge coordination
  client/editor.ts (CodeMirror)             │ stdin/stdout JSONL
        │ Web Audio                         ▼
        ▼                          studio/midi/bridge.py (Python, python-rtmidi, ALSA)
      GoXLR                                 ▲ ALSA sequencer
                                   hardware controllers / virtual loopback
@strudel/sampler (localhost:5555) ◀── ./samples/*.wav   (fetched by patterns via samples('http://localhost:5555'))
```

- `studio/shared/` holds the Zod project schema and migrations (currently v3), clip timing, MIDI parsing/pickup and WAV encoding. Persistent-format rules live here, not in UI code.
- The server refuses requests whose `Host`/`Origin` are not localhost. That is deliberate; do not loosen it.
- Typed code is a draft until **Apply changes** (Ctrl+Enter). Sliders and MIDI are live. Keep that distinction when touching playback.
- Sessions autosave to `.studio/projects/` (gitignored). Generated sounds go to `samples/ai/` (gitignored).
- `STUDIO_LIBRARIES` (see `.env.example`) lists public GitHub packs that `studio/server/libraries.ts` caches into `samples/libraries/` (`STUDIO_LIBRARY_DIR`, gitignored) after the port opens; the store reads that directory alongside `samples/ai/`. WAV only, decoded server-side by `decodeWav` in `studio/shared/wav.ts`; already-cached files are skipped by source URL and path.

## MIDI

Two layers, both optional:

1. **Virtual MIDI** in the browser needs nothing installed. Knobs, faders and pads in the drawer send simulated events.
2. **Hardware / OS loopback** goes through the Python bridge. It needs `.venv-midi` with `python-rtmidi` (see `docs/setup.md`) and `/dev/snd/seq` on the host. The server spawns `studio/midi/bridge.py` on start; `STUDIO_DISABLE_MIDI=1` turns it off, `STUDIO_PYTHON` overrides the interpreter.

The bridge only subscribes to ports the project has selected. A plugged-in controller does nothing until the user picks its port under **Virtual MIDI → Devices, mappings & advanced controls → Connect**. When debugging "keys do nothing", check that first, then `aconnect -l` and `aseqdump -p <client>` to prove the hardware is sending. The bridge also creates a virtual **Strudel Studio In** port that is always enabled, so `aconnect '<device>':0 'Strudel Studio':0` is a valid temporary route.

The Axiom AIR Mini 32 is class-compliant and exposes two ALSA ports; use the one named "MIDI", not "HyperContro" (a DAW auto-map protocol).

## Linux-specific assumptions

- Shell scripts in `scripts/` are **bash**. Don't suggest Windows tooling.
- Audio capture uses **PulseAudio / PipeWire** via `ffmpeg -f pulse`. `rec.sh` defaults to `@DEFAULT_SOURCE@`, overridable with `STRUDEL_REC_SOURCE`. Find sources with `pactl list sources short`.
- The GoXLR works through [goxlr-utility](https://github.com/GoXLR-on-Linux/goxlr-utility). Without that daemon it is a generic USB sound card.
- Hardware MIDI is Linux/ALSA only. macOS and Windows are unverified.

## Things that look like bugs but aren't

- **`samples('http://localhost:5555')` returns `{}`**: empty-bank response. Drop a `.wav` into `samples/<bank>/`; the sampler rescans on every request.
- **Edits don't change the sound while playing**: by design. Press **Apply changes**.
- **Hosted or LAN access returns 403**: by design. Studio is localhost-only.
- **`patterns/sets/` files aren't live-reloaded**: only the legacy watcher reads `patterns/scratch.strudel`. Studio keeps its own sessions in `.studio/projects/`; the only `patterns/` path it touches is `patterns/sets/neon-drive/`, read once by `npm run studio:demo`.
- **`recordings/`, `samples/ai/`, `.studio/`, `.venv-midi/` are gitignored**: intentional.

## Legacy watcher (opt-in, not the default)

`npm run dev:watcher` runs `@strudel/sampler` plus `strudel-server` (Bun + Playwright, pulled from GitHub, not npm). It watches **one** file, `patterns/scratch.strudel`, and pushes it into a Chromium window pointed at `https://strudel.cc`. Saved sets in `patterns/sets/` are copied in and out by `npm run save` / `npm run load`. See `docs/human/guides/watcher-workflow.md`.

**Upstream `strudel-server` is broken against current `strudel.cc`**: it hardcodes `#code .cm-content[contenteditable='true']`, but the editor now sits under `.code-container`. `scripts/patch-strudel-server.mjs` rewrites the selector in `node_modules/strudel-server/src/main.ts` and is run by `npm run setup:watcher` (there is no longer a `postinstall`). If the watcher hangs for 30 s and times out:

1. `grep -c "#code" node_modules/strudel-server/src/main.ts` should be `0`. If not, `npm run patch-strudel-server`.
2. If it is `0` and it still hangs, strudel.cc probably changed its DOM again. Probe it with Playwright, update the patcher's target selector, rerun.
3. `Executable doesn't exist at chromium-XXXX` means the pinned Playwright Chromium is missing: `npm run setup:watcher`.
4. Don't delete the patcher until upstream is verified fixed; then remove it, the `setup:watcher` call, and the doc notes.

`scripts/ensure-deps.mjs` (bun, Playwright Chromium, ffmpeg, yt-dlp checks) still exists as `npm run ensure-deps` but no longer runs automatically. Keep it and the patcher idempotent and non-failing.

## Editing `.strudel` files

VS Code treats `*.strudel` and `*.str` as JavaScript (`.vscode/settings.json`). Strudel patterns are JavaScript calling Strudel's pattern functions; the API reference is https://strudel.cc/learn/. Check `COMPOSER.md`'s vocab table before guessing function names.
