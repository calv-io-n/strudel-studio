# Workspace guide

## Workspace

- Write in named pattern tabs. Use **+** to add a pattern. Right-click a tab for Rename, Duplicate, Add to composition, or Close; **•••** also offers these actions.
- Choose **Current tab** or **Composition**, then Play. Stop silences playback, previews, and held notes.
- Typed code changes wait for **Apply changes** (Ctrl+Enter). MIDI and inline sliders affect the sound immediately. Code-defined tempo changes take effect on the next Play.
- Open **Composition**, **Virtual MIDI**, or **Export** from the footer. Click the active view again to return to the editor. The drawer remembers its view and height.
- The **moon/sun toggle** in the top bar switches the entire workspace and editor; light is the default. The choice is remembered in this browser.

## Composition

Drag a pattern tab onto either lane, or use **••• → Add to composition**. Click a clip to change its lane, start cycle, or length, or remove it. Drag clips to move them and their right edges to resize.

Clips snap to whole cycles, start their pattern at local cycle zero, and repeat for their length. Different lanes can overlap; clips in the same lane cannot. The composition uses one shared tempo (120 BPM by default, four beats per cycle), ignoring source patterns' tempo setters. Playback stops after the last clip. Stop before moving or resizing clips.

## MIDI

Select an inline slider, choose **MIDI Learn**, then move a virtual or physical knob. Browser controls work without MIDI hardware. Unassigned keyboard notes play a simple synth.

Virtual MIDI contains the device settings, mappings, sound slots, and diagnostics under **Devices, mappings & advanced controls**. OS MIDI uses the existing Python/ALSA bridge; see [setup](setup.md) for bridge installation. Hardware support requires a host with ALSA MIDI available.

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
