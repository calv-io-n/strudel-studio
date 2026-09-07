# strudel-studio

Personal live coding music workspace. `npm run dev:watcher` and go.

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
# Node 20+ (use your distro's package manager or nvm)
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

> Playwright Chromium does **not** need to be installed manually. The repo's
> `postinstall` runs `node ./scripts/ensure-watcher.mjs`, which calls
> `playwright install chromium` for you and re-runs every time `npm install`
> resolves a different strudel-server / playwright version. It's a no-op when
> the right build is already cached, and the bun-on-PATH check warns loudly
> (without failing the install) if Bun is missing.

### GoXLR on Linux (optional)

If you're using a GoXLR, install [goxlr-utility](https://github.com/GoXLR-on-Linux/goxlr-utility) — it provides the daemon that makes the faders, routing, and channels work under PipeWire/PulseAudio. Without it, the GoXLR still shows up as a plain USB audio device but loses its mixer features.

## Setup

```bash
git clone <repo-url> strudel-studio
cd strudel-studio
npm install
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

## package.json

```json
{
  "name": "strudel-studio",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "postinstall": "node ./scripts/patch-strudel-server.mjs && node ./scripts/ensure-deps.mjs",
    "patch-strudel-server": "node ./scripts/patch-strudel-server.mjs",
    "ensure-deps": "node ./scripts/ensure-deps.mjs",
    "sampler": "PORT=5555 npx @strudel/sampler --dir ./samples",
    "watch": "bun node_modules/strudel-server/src/main.ts patterns/scratch.strudel",
    "dev": "concurrently -n sam,watch -c blue,green \"npm run sampler\" \"npm run watch\"",
    "rec": "./scripts/rec.sh",
    "chop": "./scripts/chop.sh",
    "trim": "./scripts/trim.sh",
    "norm": "./scripts/norm.sh",
    "yt": "./scripts/yt.sh"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "strudel-server": "github:micahkepe/strudel-server"
  },
  "dependencies": {
    "@strudel/sampler": "^0.2.4"
  }
}
```

> `strudel-server` isn't on npm — it's pulled from GitHub. Its bin is a `.ts`
> file that must be run with Bun, so the `watch` script invokes `bun` on the
> installed source directly. `@strudel/sampler`'s real flags are `--dir <path>`
> for the samples folder and `PORT=<n>` (env var, not a flag) for the port —
> the default if unset is `5432`.
>
> **Boot is fully automated.** `npm install` runs `postinstall`, which:
>
> 1. **Patches strudel-server's stale selectors.** strudel.cc removed the `#code`
>    wrapper from its DOM and upstream `strudel-server` still hardcodes
>    `#code .cm-content`. Without the patch the watcher hangs 30s waiting for
>    an editor that never appears. `scripts/patch-strudel-server.mjs` rewrites
>    7 `#code` references → `.code-container` in
>    `node_modules/strudel-server/src/main.ts`. Idempotent — no-op on repeat
>    runs. Re-run manually with `npm run patch-strudel-server`.
>
> 2. **Verifies every dev tool the workspace expects.** `scripts/ensure-deps.mjs`
>    checks `bun`, Playwright Chromium (running `playwright install chromium`
>    automatically against strudel-server's pinned version), `ffmpeg`, and
>    `yt-dlp` — and warns loudly with copy-paste install commands for any tool
>    that's missing. **No check fails the install** so a fresh clone can run
>    `npm install` before its host has every tool. Skip the Chromium step with
>    `STRUDEL_SKIP_PLAYWRIGHT_INSTALL=1`. Re-run manually with
>    `npm run ensure-deps`.
>
> Net effect: clone → `npm install && npm run dev:watcher` → working stack, every
> time, on any machine that has Node + Bun + ffmpeg + yt-dlp.

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
