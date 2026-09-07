# Optional legacy watcher and sample tools

This guide covers the older external-editor → strudel.cc workflow, not the main Studio application. Start with the [current setup guide](../../setup.md) for Studio. The routing examples below are hardware-specific.

## Stack

- **Runtime**: Node.js for `@strudel/sampler` + concurrently; **Bun** (required) for `strudel-server`
- **File watcher**: [strudel-server](https://github.com/micahkepe/strudel-server) — Playwright-based, pushes code to browser on save
- **Sample server**: [@strudel/sampler](https://www.npmjs.com/package/@strudel/sampler) — serves local samples over HTTP
- **Audio engine**: Chrome → strudel.cc (Web Audio API) → GoXLR
- **Editor**: VS Code with `.strudel` → JavaScript file association
- **Recording**: ffmpeg via PulseAudio/PipeWire source (GoXLR mic)
- **Streaming**: OBS capturing REPL window + GoXLR Broadcast Mix

## Prerequisites

```bash
# Node 24 (use a version manager or a package source that provides Node 24)
# Debian/Ubuntu:
sudo apt install nodejs npm

# Bun (required by strudel-server — its binary is a .ts file run by bun)
curl -fsSL https://bun.sh/install | bash

# ffmpeg for recording/chopping samples
sudo apt install ffmpeg

# PulseAudio utilities (almost always already installed; needed for `pactl`)
sudo apt install pulseaudio-utils
```

Arch: `sudo pacman -S nodejs npm ffmpeg` · Fedora: `sudo dnf install nodejs ffmpeg`

> Run `npm run setup:watcher` explicitly to apply the upstream selector patch and download the watcher’s Chromium browser. Normal installation does not run optional setup. Bun 1.2+ is required for this workflow.

### GoXLR on Linux (optional)

If you're using a GoXLR, install [goxlr-utility](https://github.com/GoXLR-on-Linux/goxlr-utility) — it provides the daemon that makes the faders, routing, and channels work under PipeWire/PulseAudio. Without it, the GoXLR still shows up as a plain USB audio device but loses its mixer features.

## Setup

```bash
git clone https://github.com/calv-io-n/strudel.git strudel-studio
cd strudel-studio
npm ci
npm run setup:watcher
npm run dev:watcher
code .
```

That's it. Edit `patterns/scratch.strudel`, save, hear it.

## Repo Structure

```
strudel-studio/
│
├── patterns/                     # .strudel files — VS Code edits these
│   ├── scratch.strudel           # Default scratchpad
│   └── sets/                     # Named compositions / performances
│       └── .gitkeep
│
├── samples/                      # Served by @strudel/sampler on :5555
│   ├── vocals/                   # Your recorded vocal chops
│   ├── drums/                    # Drum hits / loops
│   ├── fx/                       # Effects, textures, risers
│   ├── bass/                     # Bass one-shots
│   ├── keys/                     # Melodic one-shots
│   ├── ai/                       # AI-generated samples (gitignored)
│   └── field/                    # Field recordings
│
├── recordings/                   # Raw mic takes — staging area before chop
│
├── scripts/                      # Bash helpers
│   ├── rec.sh                    # Record from GoXLR mic (PulseAudio source)
│   ├── chop.sh                   # Split a recording on silence
│   ├── trim.sh                   # Extract a time range from a recording
│   └── norm.sh                   # Loudness-normalize a sample/directory
│
├── .vscode/
│   ├── settings.json             # File associations + editor config
│   ├── tasks.json                # "Start Studio" / "Record" as VS Code tasks
│   └── extensions.json           # Recommended extensions
│
├── package.json
├── .gitignore
└── README.md
```

## Explicit watcher setup

`npm run setup:watcher` verifies Bun, applies `scripts/patch-strudel-server.mjs`, and installs the watcher's Chromium version. The upstream dependency is pinned in `package.json` and the lockfile. See [attribution notes](../../../THIRD_PARTY_NOTICES.md) for the patch and upstream license.

`npm run ensure-deps` remains an optional legacy diagnostic command that checks Bun, Chromium, FFmpeg and yt-dlp. It may download Chromium and only warns about missing tools; set `STRUDEL_SKIP_PLAYWRIGHT_INSTALL=1` to suppress the download. Use `setup:watcher` when you need a failing exit code for incomplete setup.

The watcher depends on the upstream strudel.cc interface and network availability. FFmpeg and yt-dlp are needed only for the corresponding audio utilities, not basic Studio playback or its built-in WAV export.

## npm scripts

| Command           | What it does                                                      |
|-------------------|-------------------------------------------------------------------|
| `npm run dev:watcher`     | Starts sampler + file watcher. This is your daily driver.         |
| `npm run rec`     | Records from GoXLR mic. Pass name: `npm run rec -- vocals/yo`     |
| `npm run yt`      | Pull audio from a YouTube URL: `npm run yt -- <url> <name> [range]` |
| `npm run chop`    | Split a recording on silence: `npm run chop -- rec.wav out/dir`   |
| `npm run trim`    | Cut a time range: `npm run trim -- rec.wav 2.5 0.8 vocals/hit01`  |
| `npm run norm`    | Loudness-normalize a file or directory of `.wav`s                 |
| `npm run sampler` | Sampler only (auto-rescans on every request)                      |
| `npm run watch`   | File watcher only                                                 |
| `npm run patch-strudel-server` | Re-apply the upstream-DOM-fix patch (idempotent)     |
| `npm run ensure-deps` | Re-run the bun/chromium/ffmpeg/yt-dlp readiness checks (idempotent) |

## How it works

```
┌──────────────────────────┐
│  VS Code                 │  You type here
│  patterns/scratch.strudel│
└──────────┬───────────────┘
           │ save (Ctrl+S)
           ▼
┌──────────────────────────┐
│  strudel-server          │  Detects file change via chokidar
│  (Node/Bun process)      │  Injects code into browser via Playwright
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  Chrome — strudel.cc     │  Web Audio API renders sound
│  (visible REPL window)   │  Also: the visual for your stream
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  GoXLR (PipeWire)        │  Chrome audio → "Music" fader
│  via goxlr-utility       │  XLR mic → "Mic" fader
│                          │  Broadcast Mix → OBS
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  OBS                     │  Window capture: Strudel REPL
│                          │  Audio: PipeWire capture on Broadcast Mix
└──────────────────────────┘
```

## Samples

### Loading local samples in your .strudel files

```javascript
// Local samples served by @strudel/sampler
samples('http://localhost:5555')

// Use them
$: s("vocals:0").chop(8).speed("1 1.5 0.75 2")
$: s("drums:0 drums:1").bank("RolandTR909")
```

### Loading community packs (no download needed)

```javascript
samples('github:tidalcycles/Dirt-Samples')
samples('github:yaxu/clean-breaks')
samples('github:eddyflux/crate')
samples('github:switchangel/pad')
```

Browse available packs: https://therebelrobot.github.io/open-strudel-samples/

### Adding new samples

Drop `.wav` files into `samples/<category>/` and reference them in your
patterns. `@strudel/sampler` rescans the directory on every request, so new
files show up without restarting anything — just save your `.strudel` file.

## Recording Vocals

### Find your audio source name (one-time)

```bash
pactl list sources short
```

Look for the GoXLR input (usually something like
`alsa_input.usb-GoXLR_GoXLR_000000000000-00.multichannel-input`). Then either:

- edit `SOURCE` at the top of `scripts/rec.sh`, or
- export once per shell: `export STRUDEL_REC_SOURCE="alsa_input.usb-..."`

If you leave it at the default `@DEFAULT_SOURCE@`, ffmpeg uses whatever
PulseAudio considers your current default input — which is fine if you pick the
GoXLR mic in your system's sound settings.

### Record

```bash
# Quick record — press 'q' or Ctrl+C to stop
npm run rec -- vocals/hey

# Or directly
./scripts/rec.sh vocals/scream
```

### Chop a recording on silence

```bash
./scripts/chop.sh recordings/session.wav samples/vocals/chops

# Tune thresholds:
NOISE=-40dB DURATION=0.3 ./scripts/chop.sh recordings/session.wav samples/vocals/chops
```

### Trim a specific section

```bash
./scripts/trim.sh recordings/session.wav 2.5 0.8 vocals/hit01
```

### Normalize loudness

```bash
./scripts/norm.sh samples/vocals           # whole folder
./scripts/norm.sh samples/vocals/hit01.wav # single file
```

Originals are preserved as `.wav.bak` next to each file the first time you normalize them.

## Pulling samples from YouTube

`scripts/yt.sh` (alias `npm run yt`) wraps `yt-dlp` to pull the highest-quality
audio stream from a YouTube URL into `recordings/<name>.wav`, ready to feed into
the same `chop` / `trim` / `norm` pipeline as your mic recordings.

```bash
# Whole video → recordings/<title>.wav
npm run yt -- "https://youtu.be/dQw4w9WgXcQ"

# Whole video, named output
npm run yt -- "https://youtu.be/dQw4w9WgXcQ" rick

# Just one slice (saves bandwidth on long videos) — start-end as M:SS-M:SS
npm run yt -- "https://youtu.be/dQw4w9WgXcQ" rick_chorus 0:43-1:08
```

The script then prints copy-paste next-step commands for chop/trim/norm.

**Quality:** YouTube serves audio as Opus (~160 kbps) or AAC (~128 kbps) — there
is no lossless source. The script pulls the original best-audio stream and
converts *once* to 48 kHz WAV via ffmpeg. Don't re-encode that WAV through
another lossy step; everything downstream (chop/trim/norm) keeps it as
`pcm_s16le` so you stay clean from there on.

**Rights:** sampling is a long tradition in pop/electronic music. Personal
noodling is fine. Live streaming or publishing tracks that contain
identifiable samples is a per-track copyright conversation — think about it
case by case before posting anything.

## VS Code Config

### .vscode/settings.json

```json
{
  "files.associations": {
    "*.strudel": "javascript",
    "*.str": "javascript"
  },
  "editor.wordWrap": "on",
  "editor.fontSize": 16,
  "editor.minimap.enabled": false,
  "editor.renderWhitespace": "none"
}
```

### .vscode/tasks.json

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Studio",
      "type": "shell",
      "command": "npm run dev:watcher",
      "isBackground": true,
      "problemMatcher": [],
      "group": { "kind": "build", "isDefault": true },
      "presentation": { "reveal": "always", "panel": "dedicated" }
    },
    {
      "label": "Record Sample",
      "type": "shell",
      "command": "./scripts/rec.sh ${input:sampleName}",
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "shared", "focus": true }
    },
    {
      "label": "Restart Sampler",
      "type": "shell",
      "command": "npm run sampler",
      "problemMatcher": [],
      "presentation": { "reveal": "always", "panel": "dedicated" }
    }
  ],
  "inputs": [
    {
      "id": "sampleName",
      "type": "promptString",
      "description": "Sample path (e.g. vocals/scream)",
      "default": "vocals/quick"
    }
  ]
}
```

### .vscode/extensions.json

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint"
  ]
}
```

## Default Scratchpad

### patterns/scratch.strudel

```javascript
// strudel-studio scratchpad
// save → auto-reloads in browser

samples('http://localhost:5555')
samples('github:tidalcycles/Dirt-Samples')

// --- drums ---
$: s("bd sd bd [sd bd]")
   .bank("RolandTR909")

$: s("hh*8")
   .gain(0.3)
   .bank("RolandTR909")

// --- your samples ---
// $: s("vocals:0").chop(8).speed("1 1.5 0.75 2")

// --- synth ---
// $: note("c3 eb3 g3 bb3")
//    .s("sawtooth").lpf(800).room(0.3)
```

## .gitignore

```
node_modules/
recordings/
samples/ai/
*.tmp.wav
.DS_Store
```

## GoXLR Routing

| Fader  | Source                 | Stream? |
|--------|------------------------|---------|
| Mic    | XLR mic (your voice)   | Yes     |
| Music  | Chrome / Strudel audio | Yes     |
| Game   | System / other         | No      |
| Chat   | Discord / comms        | No      |

Route Chrome's audio output to the GoXLR "Music" sink. In most Linux
environments the easiest way is:

- **PipeWire + `pavucontrol`**: start Chrome, open *pavucontrol → Playback*, and
  point Chrome's stream at the GoXLR Music sink.
- **`wpctl`**: `wpctl status` to find sink IDs, `wpctl set-default <id>` to switch.

OBS: add an **Audio Input Capture** source and pick the GoXLR *Broadcast Mix*
monitor (one source, mic + music, nothing else). On Linux use the PipeWire
variant of the audio capture source for best results.

## Daily Workflow

1. Open VS Code in `strudel-studio/`
2. `Ctrl+Shift+B` → "Start Studio" (or `npm run dev:watcher`)
3. Edit `patterns/scratch.strudel` — hear changes on save
4. Need a vocal? → Run "Record Sample" task → speak → press q
5. Reference the new sample in code — sampler auto-rescans, no restart needed
6. Streaming? → OBS: window capture REPL + GoXLR Broadcast Mix → go live
