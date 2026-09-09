# Workspace guide

Studio saves projects and sounds in this browser. See [setup and migration](setup.md) for hosting and moving existing projects.

## Workspace

- Write in named pattern tabs. Use **+** to add a pattern. Right-click a tab for Color, Rename, Duplicate, Add to composition, or Close; **•••** also offers these actions.
- Use **Play pattern** below the editor or **Play composition** in the timeline. Stop silences playback, previews, and held notes.
- Typed code changes wait for **Apply changes** (Ctrl+Enter). MIDI and inline sliders affect the sound immediately. Code-defined tempo changes take effect on the next Play.
- Open **Composition** or **MIDI devices** from the footer. **Project** contains **On-screen controller** and **Export**. Click the active view again to return to the editor. The drawer remembers its view and height.
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

**MIDI devices** connects external keyboards and controllers through Web MIDI. Choose **Enable MIDI**, grant browser access, select an input, and choose **Connect**. Remembered inputs show Connected or Waiting for device, with an explicit Disconnect action. Input activity confirms arriving notes and CC messages. Selection stays independent of the current project. Selected devices reconnect when replugged; reload resumes them when browser permission is already granted. Unsupported browsers can still use the on-screen controller.

**Project → On-screen controller** contains browser keys, knobs, sliders, mappings, sound slots, and event feedback. MIDI Learn works with physical or on-screen controls. There is no Python bridge or OS loopback route.

## Sounds

The bundled collection contains six original CC0 drum sounds. Add more through **Import samples**, using public GitHub links or file uploads.

**Sample library** is a drawer view alongside Composition and MIDI devices: open it from the top bar or by clicking a sound name in your code, and keep editing or playing while it is open. Each sound has **Insert** (or **Swap** when you opened it from a sound name), a preview button, and **Live**, which plays that sound from your MIDI controller or the test keys without recording anything. Insert adds the new phrase on its own line after the statement at the caret, so it never splits an expression. Import a sound, preview it, then choose **Insert into pattern**. Inserting does not start playback or apply a running draft. Existing sample-to-pad and sound-slot assignment is available under the selected sound's advanced controls.

Type inside `s("…")` or `sound("…")` to find sounds by name or label; use arrow keys and **Tab** to complete. **Ctrl+Space** opens suggestions and **Escape** dismisses them. Typing after a dot suggests effects such as reverb and filters. Saved sound labels can be renamed in the Sounds panel.

Imported and recorded sounds are stored as browser-local audio blobs. AI generation is not part of this version.

## Projects

Use **+ beside Sessions** to create a named session. Press **Ctrl+S** (Cmd+S on macOS) or **Save** to save immediately. Wait for **Saved in this browser** before closing the page. Sessions autosave in IndexedDB and retain their identity after reload. Switching sessions saves pending edits first. Recovery drafts protect interrupted saves; Save retries a failure. Projects include all tabs, clips, mappings, slots, and controller values. Download a ZIP project backup to retain both the project and referenced sound files independently of browser storage.

Older single-pattern and two-lane projects migrate to format v5 when opened. Their code and MIDI mappings are preserved; stored records are updated when saved. Closing a tab hides it from the editor strip; deleting a pattern removes its code, clips and mappings after confirmation.

## Audio export

Open **Project → Export**, choose **Full composition**, and click **Render & download WAV**. The offline renderer exports stereo 44.1 kHz, 16-bit audio with an adjustable effect tail (three seconds by default). You can also render a chosen number of cycles from the current tab. Rendering captures current code, slider values, sound slots, and track/clip mute settings without interrupting playback; progress and cancellation are available. Maximum export length is fifteen minutes.

## Perform, review and keep a take

Highlight a note expression and choose **Play into selection**. **Audition** plays its sound without saving anything. **Transcribe** shows inferred Strudel code beside the original while you play; choose phrase length, quantization and optional count-in before starting. **Stop take** retains the proposal. **Preview isolated** hears it alone; **Preview with accompaniment** retains the playing mix. **Accept into selection** replaces the armed expression as one undoable draft edit. Discard leaves the code unchanged, and Retry explicitly replaces the pending take.

**Jam with composition** repeats the displayed range while temporarily excluding the destination tab. Stopping a take keeps the jam running. Global Stop ends both. Original-phrase suppression and jam exclusions never change saved mutes or Solo.

**Record highlighted sound** captures the actual played audio and effects. For an interface or microphone, open **Sample library → Add sounds → Record audio**, select the source, and set it up. Check levels before recording; monitoring starts off. Stop, finish the tail, preview/trim, name and save the take. Insert it from the library as a separate sample phrase; the original effects are not added again.

MIDI proposals, import reviews and audio-take chunks have browser recovery. Recovered work stays stopped and requires explicit review. Keep important audio with **Save sound**; browser storage limits can prevent recovery and are reported.

## Import samples and back up projects

Open **Import samples** in the header, or follow the import link under **Sample library → Add sounds**. On the dedicated page, paste a public GitHub repository/folder/audio-file link, find samples, select downloads, and import them after review. Alternatively upload audio files, a folder, or ZIP pack. Downloading is explicit; no pack is fetched automatically. Identical files reuse sound identities, and pack/sound renames preserve references. Back to Studio returns to your draft.

Imports support WAV, MP3, OGG and FLAC where the browser decoder supports them, up to 64 MB per source file, 256 MB unpacked and 500 files per review. Originals are retained alongside playback WAVs. Individual failures remain visible; valid imports survive cancellation.

**Project → Download project backup** bundles referenced audio and available originals with the session. The manifest lists missing files and external URLs. **Restore project backup** creates a new session, preserving existing sessions. Backups are limited to 256 MB; export smaller project selections if a backup exceeds that limit. Missing library audio offers **Recover sound** for reimporting the original file.
