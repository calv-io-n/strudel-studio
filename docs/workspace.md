# Workspace guide

## Workspace

- Write in named pattern tabs. Use **+** to add a pattern. Right-click a tab for Color, Rename, Duplicate, Add to composition, or Close; **•••** also offers these actions.
- Choose **Current tab** or **Composition**, then Play. Stop silences playback, previews, and held notes.
- Typed code changes wait for **Apply changes** (Ctrl+Enter). MIDI and inline sliders affect the sound immediately. Code-defined tempo changes take effect on the next Play.
- Open **Composition**, **Virtual MIDI**, or **Export** from the footer. Click the active view again to return to the editor. The drawer remembers its view and height.
- The **moon/sun toggle** in the top bar switches the entire workspace and editor; light is the default. The choice is remembered in this browser.

## Composition

Drag a pattern tab onto a track, or use **••• → Add to composition**. New clips are four cycles long. Tab colors carry through to every source clip, including duplicates. Use **Color…** in the tab menu to choose one of eight named colors.

Projects start with two tracks. **Add track** appends and selects a new track for subsequent additions, up to 16. Track **•••** menus rename or remove tracks; removing a populated track confirms removal of its clips. Keep at least one track. Opaque headers remain flush against the left edge and cover the timeline when scrolling horizontally, and the track area scrolls vertically.

Choose **1 cycle**, **½ cycle**, or **¼ cycle** snapping. Dragging a tab opens Composition and displays a colored label following the pointer. The destination track highlights when you can drop. Moving and resizing show a preview and align magnetically to nearby clip edges. Invalid overlapping placements are rejected; Escape cancels a gesture. Clips keep their original grab offset while moving. Focus a clip and use Left/Right to move by the grid, Up/Down to change tracks, or Shift+Left/Right to resize. Click a clip for numeric editing in quarter-cycle increments. Changing the grid leaves existing timing intact.

Use a track's **Mute** button or a clip's right-click **Mute/Unmute** action. Track mute silences its clips without changing their individual mute settings. During composition playback, changes take effect at the next safe cycle boundary shown in the toolbar. Existing notes and effect tails can finish. Mutes never apply unfinished code edits, affect standalone tab playback, or shorten the arrangement. Stop clears pending scheduling; the next Play uses saved settings.

**Solo** isolates one track immediately while stopped, or at the next safe cycle boundary during playback. Click another track’s Solo to switch; click the active Solo again to restore the previous mix. Solo respects both track mute and individual clip mutes. Unmute a soloed track to hear it. It is saved with the session, included in WAV exports, and cleared if the soloed track is removed.

Structural edits require stopped playback. Each clip starts its source pattern from cycle zero. All tracks use the shared composition tempo, with four beats per cycle, and playback ends at the last clip, including muted clips. Right-click clips for Edit, Duplicate, Open source pattern, and Remove.

## MIDI

Select an inline slider, choose **MIDI Learn**, then move a virtual or physical knob. Browser controls work without MIDI hardware. Unassigned keyboard notes play a simple synth.

Virtual MIDI contains the device settings, mappings, sound slots, and diagnostics under **Devices, mappings & advanced controls**. OS MIDI uses the existing Python/ALSA bridge; see [setup](setup.md) for bridge installation. Hardware support requires a host with ALSA MIDI available.

## Sounds

Set `ELEVENLABS_API_KEY` in `.env` and restart Studio to enable generation. Keep the key on the server.

**Sample library** is a drawer view beside Composition and Virtual MIDI: open it from the footer or by clicking a sound name in your code, and keep editing or playing while it is open. Each sound has **Insert** (or **Swap** when you opened it from a sound name), a preview button, and **Live**, which plays that sound from your MIDI controller or the test keys without recording anything. Insert adds the new phrase on its own line after the statement at the caret, so it never splits an expression. Describe a sound, generate, preview, and **Insert into pattern**. Duration is optional; looping defaults off. Inserting does not start playback or apply a running draft. Existing sample-to-pad and sound-slot assignment is available under the selected sound's advanced controls.

Type inside `s("…")` or `sound("…")` to find sounds by name or label; use arrow keys and **Tab** to complete. **Ctrl+Space** opens suggestions and **Escape** dismisses them. Typing after a dot suggests effects such as reverb and filters. Saved sound labels can be renamed in the Sounds panel.

Generated sounds are stored in `samples/ai/`. The app never generates automatically; every request starts with the Generate sound button.

## Projects

Use **+ beside Sessions** to create a named session; Enter or Confirm creates it. Press **Ctrl+S** (Cmd+S on macOS) or the **Save** button beside the save status to save immediately. Sessions also autosave to `.studio/projects/` and retain their identity and dropdown selection after reload. Switching sessions saves pending edits first. A local browser draft protects edits during interrupted saves; **Project → Save project** retries a failed save. Recovery is also saved to `.studio/projects/recovery.json`. Projects include all tabs, clips, mappings, slots, and controller values. Sounds remain in the local sound library, so retain that folder when backing up projects.

Older single-pattern and two-lane projects migrate to format v4 when opened. Their code and MIDI mappings are preserved; files are only rewritten when saved. Closing a tab asks before removing its code, clips, and mappings.

## Audio export

Open **Export** beside Virtual MIDI, choose **Full composition**, and click **Render & download WAV**. The offline renderer exports stereo 44.1 kHz, 16-bit audio with an adjustable effect tail (three seconds by default). You can also render a chosen number of cycles from the current tab. Rendering captures current code, slider values, sound slots, and track/clip mute settings without interrupting playback; progress and cancellation are available. Maximum export length is fifteen minutes.

## Perform, review and keep a take

Highlight a note expression and choose **Play into selection**. **Audition** plays its sound without saving anything. **Transcribe** shows inferred Strudel code beside the original while you play; choose phrase length, quantization and optional count-in before starting. **Stop take** retains the proposal. **Preview isolated** hears it alone; **Preview with accompaniment** retains the playing mix. **Accept into selection** replaces the armed expression as one undoable draft edit. Discard leaves the code unchanged, and Retry explicitly replaces the pending take.

**Jam with composition** repeats the displayed range while temporarily excluding the destination tab. Stopping a take keeps the jam running. Global Stop ends both. Original-phrase suppression and jam exclusions never change saved mutes or Solo.

**Record highlighted sound** captures the actual played audio and effects. For an interface or microphone, open **Sounds → Import → Record audio**, select the source, and set it up. Check levels before recording; monitoring starts off. Stop, finish the tail, preview/trim, name and save the take. Insert it from the library as a separate sample phrase; the original effects are not added again.

MIDI proposals, import reviews and audio-take chunks have browser recovery. Recovered work stays stopped and requires explicit review. Keep important audio with **Save sound**; browser storage limits can prevent recovery and are reported.

## Import samples and back up projects

Sounds has **Generate** and **Import** tabs above one searchable library. Upload audio files, a folder or a ZIP pack, review the selections, then choose **Import selected**. Public GitHub links have a discovery and download-review step before importing. Packs listed in `STUDIO_LIBRARIES` are cached automatically when the server starts and show up here as imported packs. Identical files reuse existing sound identities; pack and sound renames preserve patterns.

Imports support WAV, MP3, OGG and FLAC where the browser decoder supports them, up to 64 MB per source file, 256 MB unpacked and 500 files per review. Originals are retained alongside playback WAVs. Individual failures remain visible; valid imports survive cancellation.

**Project → Download project backup** bundles referenced audio and available originals with the session. The manifest lists missing files and external URLs. **Restore project backup** creates a new session, preserving existing sessions. Backups are limited to 256 MB; larger projects can be copied using their JSON and referenced files from local storage. Missing library audio offers **Recover sound** for reimporting the original file.
