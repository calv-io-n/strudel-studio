# Strudel Studio

A focused workspace for writing Strudel patterns, arranging two layers, and performing with MIDI.

## Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. Studio runs locally; the sample server runs on port 5555. Use a current Node.js version supported by the installed Vite release (Node 22.12+ or Node 24).

## Try the demo

Run `npm run studio:demo`, start Studio, then choose **Sessions → Neon Drive**. Select **Composition** and press **Play** for a 46-second original synth-pop arrangement across four tabs. The first two virtual knobs control lead brightness and bass cutoff. No samples or API key are needed.

See the [Neon Drive guide](patterns/sets/neon-drive/README.md) for the arrangement and editable source files. Installing it preserves existing projects and recovery.

## Workspace

- Write in named pattern tabs. Use **+** to add a pattern and **•••** for rename, close, or Add to composition.
- Choose **Current tab** or **Composition**, then Play. Stop silences playback, previews, and held notes.
- Typed code changes wait for **Apply changes** (Ctrl+Enter). MIDI and inline sliders affect the sound immediately. Code-defined tempo changes take effect on the next Play.
- Open **Composition**, **Virtual MIDI**, or **Export** from the footer. Click the active view again to return to the editor. The drawer remembers its view and height.
- **Dark mode** in the top bar switches the entire workspace and editor; light is the default. The choice is remembered in this browser.

## Composition

Drag a pattern tab onto either lane, or use **••• → Add to composition**. Click a clip to change its lane, start cycle, or length, or remove it. Drag clips to move them and their right edges to resize.

Clips snap to whole cycles, start their pattern at local cycle zero, and repeat for their length. Different lanes can overlap; clips in the same lane cannot. The composition uses one shared tempo (120 BPM by default, four beats per cycle), ignoring source patterns' tempo setters. Playback stops after the last clip. Stop before moving or resizing clips.

## MIDI

Select an inline slider, choose **MIDI Learn**, then move a virtual or physical knob. Browser controls work without MIDI hardware. Unassigned keyboard notes play a simple synth.

Virtual MIDI contains the device settings, mappings, sound slots, and diagnostics under **Devices, mappings & advanced controls**. OS MIDI uses the existing Python/ALSA bridge; see `studio/midi/` for its setup scripts. Hardware support requires a host with ALSA MIDI available.

## Sounds

Set `ELEVENLABS_API_KEY` in `.env` and restart Studio to enable generation. Keep the key on the server.

Open **Sounds**, describe a sound, generate, preview, and **Insert into pattern**. Duration is optional; looping defaults off. Inserting does not start playback or apply a running draft. Existing sample-to-pad and sound-slot assignment is available under the selected sound's advanced controls.

Type inside `s("…")` or `sound("…")` to find sounds by name or label; use arrow keys and **Tab** to complete. **Ctrl+Space** opens suggestions and **Escape** dismisses them. Typing after a dot suggests effects such as reverb and filters. Saved sound labels can be renamed in the Sounds panel.

Generated sounds are stored in `samples/ai/`. The app never generates automatically; every request starts with the Generate sound button.

## Projects

Use **+ beside Sessions** to create a named session; Enter or Confirm creates it. Sessions autosave to `.studio/projects/` and retain their identity and dropdown selection after reload. Switching sessions saves pending edits first. A local browser draft protects edits during interrupted saves; **Project → Save project** retries a failed save. Recovery is also saved to `.studio/projects/recovery.json`. Projects include all tabs, clips, mappings, slots, and controller values. Sounds remain in the local sound library, so retain that folder when backing up projects.

Older single-pattern projects migrate when opened. Their code and MIDI mappings are preserved; files are only rewritten when saved. Closing a tab asks before removing its code, clips, and mappings.

## Audio export

Open **Export** beside Virtual MIDI, choose **Full composition**, and click **Render & download WAV**. The offline renderer exports stereo 44.1 kHz, 16-bit audio with an adjustable effect tail (three seconds by default). You can also render a chosen number of cycles from the current tab. Rendering captures current code, slider values, and sound slots without interrupting playback; progress and cancellation are available. Maximum export length is fifteen minutes.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run studio` | Studio plus local sample server |
| `npm run studio:demo` | Install the four-tab Neon Drive demo without replacing existing work |
| `npm run studio:app` | Studio app only |
| `npm run studio:build` | Type checking and production client build |
| `npm run studio:test` | Model, MIDI, migration, persistence, and generation tests |
| `npm run studio:e2e` | Browser acceptance tests with fixture sounds |
| `npm run dev:watcher` | Original VS Code → strudel.cc file-watcher workflow |

Browser tests require Playwright Chromium (`npx playwright install chromium`). To use an existing Chromium binary, set `STUDIO_CHROMIUM=/path/to/chrome`. Set `STUDIO_E2E_ALSA=1` to include the hardware MIDI test on a compatible host. Automated sound tests use local fixtures and do not spend ElevenLabs credits.

The [design document](docs/design/strudel-studio.md) defines the interface. Automation lanes, mixing panels, and additional tracks are deferred.

For recording, sample preparation, GoXLR routing, and the original watcher workflow, see the [workspace guide](docs/human/guides/watcher-workflow.md).
