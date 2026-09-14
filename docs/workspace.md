# Workspace guide

Studio saves projects and sounds in this browser. See [setup and migration](setup.md) for hosting and moving existing projects.

## Layout

- **Top bar:** the session picker and **+** to add a session, the project name, and the transport. The transport has a **Tab | Composition** target switch, **Play**, **Stop** and **● Record**. After that come **Search** (Ctrl+K, or Cmd+K on macOS) and the moon/sun appearance toggle.
- **Editor:** the rest of the page. When a pattern has typed edits that haven't been applied, an **Unapplied edits · Apply** pill floats in the lower right.
- **Bottom bar:** the pattern tabs, with **+** for a new pattern, and the **Input** and **MIDI** tabs with their activity meters. It also shows playback status and save state with **Save**, and has a **Composition** toggle that opens the timeline drawer.
- **Command palette:** press Ctrl+K anywhere, or click **Search**. The empty search pins Open pattern tab, Open Sample Catalogue, MIDI & on-screen controller, Audio input, Export full song render, Quick start guide, Import .strudel file, and Import GitHub Samples. The GitHub import entry opens the existing repository-import page directly. Other project actions remain searchable. Open pattern tab lists only closed patterns; it explains when all are open. Open patterns stay in the tab strip; their actions are in the tab menu. Type to filter, use the arrow keys to choose, press Enter to run, and press Escape to close.
- **Settings sheets:** **MIDI**, **Audio input**, **Record** and **Export** open as a sheet on the right. Press Escape or click outside the sheet to return to the editor.
- **Appearance:** light is the default. The choice applies to the whole workspace and editor and is remembered in this browser.
- **Quick start:** the guide opens on each page load until you check **Don’t show this again**. Closing it does not opt out. Reopen it with **Quick start guide** in Search; uncheck the preference to restore automatic opening.

## Patterns and playback

- Write in named pattern tabs. **+** asks for a name and one of eight colors. Right-click a tab for Color, Rename, Duplicate, Pattern tempo, Add to composition, Close or Delete. Double-click a tab or focus it and press F2 to rename.
- Choose **Tab** or **Composition** in the top bar, then press **Play**. Click the metronome icon beside Record to cycle Off (gray) → Count-in only (yellow) → Continuous (yellow with a loop badge) → Off. Both enabled modes count 4–3–2–1 before playback or recording; Continuous keeps clicking at project BPM throughout playback and capture. You can change modes during playback. Stop cancels clicks and the countdown; the preference is remembered in this browser. Metronome clicks go to speakers rather than the internal recording bus. Stop silences playback, previews and held notes.
- Typed code changes wait for **Apply** (Ctrl+Enter). MIDI and inline sliders affect the sound immediately. The top-bar BPM is the project clock. Change it while stopped; every pattern’s protected tempo header updates without replacing its body. Old standalone tempo setters are preserved as comments. Embedded setters are marked and cannot change the clock.

## Composition

Open the drawer with **Composition** in the bottom bar. Drag a pattern tab onto a track, or right-click the tab and choose **Add to composition**. New clips are 16 beats (four cycles) long. Tab colors carry through to every clip made from that pattern, including duplicates.

Projects start with two tracks. **Add track** adds a new track and selects it, so later additions land there, up to 16 tracks. The track **•••** menu renames or removes a track; removing a track that has clips asks for confirmation first. A project always keeps at least one track. Track headers stay pinned to the left edge when you scroll sideways, and the track area scrolls vertically.

Choose **4 beats**, **2 beats** or **1 beat** snapping. One cycle remains four beats in Strudel code.
- **Dragging a tab** opens Composition and shows a colored label that follows the pointer. The destination track highlights when you can drop there.
- **Moving or resizing a clip** shows a preview, and edges snap to nearby clips. Overlapping placements are rejected. Clips keep your original grab offset while moving. Escape cancels any drag.
- **From the keyboard:** focus a clip, then use Left/Right to move it by the grid, Up/Down to change tracks, and Shift+Left/Right to trim the right edge and Alt+Left/Right to trim the left edge. Both edges also have drag handles. Click a clip to edit its beat position and duration; position 1 is the beginning of the song. Advanced source offset remains in source cycles.
- **Changing the grid** leaves existing timing intact.

**Looping:** while playback is stopped, drag across the ruler to select a range. The drawer then shows **Looping beats…**, and playback repeats that range. **Clear selection** turns the loop off and resets the range to the whole song. Clicking the ruler without dragging moves the playhead. The range handles and the playhead can also be moved with the arrow keys. **Return to range start** and **Loop the selected range** are in the command palette.

**Mute:** use a track's **Mute** button or a clip's right-click **Mute/Unmute** action. Track mute silences the track's clips without changing their own mute settings. During composition playback, changes take effect at the next safe cycle boundary shown in the toolbar, and notes or effect tails that are already sounding can finish. Mutes never apply unfinished code edits, affect tab playback, or shorten the arrangement. Stop clears pending changes; the next Play uses the saved settings.

**Solo:** isolates one track immediately while stopped, or at the next safe cycle boundary during playback. Click another track's Solo to switch; click the active Solo again to restore the previous mix. Solo respects both track mutes and clip mutes, so unmute a soloed track to hear it. Solo is saved with the session, included in WAV exports, and cleared if the soloed track is removed.

Structural edits require stopped playback. A new clip begins at source cycle zero. Moving preserves its source offset; trimming the left edge advances its source offset while keeping the right edge fixed. Resizing changes the source window, including repeating or evolving material. All tracks share the project clock of four beats per cycle, and playback ends at the last clip, including muted clips. Right-click a clip for Edit, Duplicate, Open source pattern and Remove.

**Pattern tempo:** a tab’s **Pattern tempo…** menu accepts a BPM or `project` to inherit. An override belongs to the source pattern and affects every placement, tab playback and rendering. Duplicate a pattern for an independent rate. An 84 BPM pattern in a 168 BPM project advances half a source cycle per project cycle. This changes event timing, including sample triggers; it does not stretch recorded audio or change a sample’s pitch. Recorded-take patterns retain their natural speed and cannot have overrides.

## MIDI

The **MIDI** tab edits the MIDI instrument: its output sound, presets and effects chain. When MIDI isn't enabled, or no input is connected, a banner explains what's missing and offers **Enable MIDI** or a link to settings. The tab's dot turns blue when an input is connected and pulses as notes and controls arrive.

Open **MIDI & on-screen controller** from the command palette to connect external keyboards and controllers through Web MIDI. Choose **Enable MIDI**, grant browser access, select an input, then choose **Connect**.
- Remembered inputs show **Connected** or **Waiting for device**, with an explicit **Disconnect**.
- The activity line confirms arriving notes and CC messages.
- Your input selection doesn't change when you switch projects. Selected devices reconnect when you replug them, and reloading resumes them when browser permission was already granted.
- Browsers without Web MIDI can still use the on-screen controller.

The same sheet contains the on-screen controller: browser knobs, sliders, pads and keys. Under **Mappings, sound slots & diagnostics** you'll find your mappings, sound slots and a MIDI event monitor. To map a control, click the underlined `slider` function name in the editor, choose **Bind MIDI control**, then move a physical or on-screen control. Unassigned keyboard notes play a simple synth. There is no Python bridge or OS loopback route.

## Sounds

The bundled collection contains six original CC0 drum sounds. Add more through **Add sounds** in the Sample Catalogue, using public GitHub links or file uploads.

**Open Sample Catalogue** in the command palette opens the sound library as a sheet; clicking a sound name in your code opens it too. Each sound row has these actions:
- **Insert**, or **Swap** when you opened the library from a sound name. Insert adds the new phrase on its own line after the statement at the caret, so it never splits an expression. Inserting doesn't start playback or apply a running draft.
- **Preview** (▶).
- **Assign to MIDI**.
- **Live**, which plays the sound from your MIDI controller or the test keys without recording anything.

Assigning a sample to a pad or sound slot is available under the selected sound's advanced controls.

Type inside `s("…")` or `sound("…")` to find sounds by name or label. Use the arrow keys and **Tab** to complete, **Ctrl+Space** to open suggestions, and **Escape** to dismiss them. Typing after a dot suggests effects such as reverb and filters. Saved sound labels can be renamed in the library.

Recorded-take tabs play the recording once at its natural duration. Effects edited through **Show code** apply to tab playback, composition clips and exports; clip timing and trims remain intact. **Play recording** uses the shared transport, so it cannot overlap a separate tab preview.

Imported and recorded sounds are stored as browser-local audio files. AI generation is not part of this version.

## Recording

**● Record** in the top bar opens the record bar. Choose **Audio input** or **MIDI**.

**Audio input:**
1. Pick a track under **Record to**, then choose **Record audio input**.
2. Studio asks for microphone permission if it doesn't have it, rolls the composition from the playhead, and draws the take on the track as it records.
3. Stop to save the take onto the timeline.

**Settings** opens the Record sheet: wet or dry capture, latency compensation and a one-cycle count-in. If a save fails, the record bar stays open with **Retry save**, **Download recording** and **Discard recording…**.

**The Input tab** edits the live input's `AUDIO` effects chain. While no input is connected, a banner offers **Connect microphone**. Once connected, the input bar shows the device, a level meter and **Monitor input**. Monitoring starts off; use headphones to avoid feedback. **Audio input settings…** covers the rest:
- device, channel and monitor track
- input and output levels
- effects presets
- **Test vocal effects**, which applies the current chain to a recorded take without changing it

**MIDI** has separate audition and capture actions:
1. Click the outlined `note()` function name (or focus it and press Enter). **Test MIDI** auditions that instrument without creating a take or changing code.
2. **Record MIDI on pattern** arms the clicked phrase and plays its entire owning tab as accompaniment when recording starts. **Record MIDI solo** arms the same destination without pattern or composition accompaniment. Both open the existing top Record bar in Tab/MIDI mode; neither starts recording yet.
3. Press the top **Record** button when ready. The enabled metronome counts in first. Incoming notes appear inline beside the highlighted phrase. Press the top **Stop**, preview, then **Keep take** or **Discard** in the same bar. Keep take edits the source and therefore all its placements; switching tabs never redirects the take. There is no MIDI settings form or duplicate count-in: the metronome beside Record handles the lead-in. Stop determines the phrase length, rounded up to a beat. The compact bar shows only the destination/accompaniment and, after Stop, Preview, Keep take and Discard. If recovery loses its destination, Use selected phrase appears to repair it.

Gray code and timeline placeholders indicate preparing, recording, finishing, review and saving. They are temporary UI, never saved code. Existing phrases remain highlighted while a take is pending. **Record highlighted sound** captures the played audio, including effects, into a new audio pattern on the destination track shown before recording. Failed saves retain work for retry; discard removes pending feedback.

MIDI takes, import reviews and interrupted audio recordings can be recovered in the browser. Recovered work stays stopped and needs explicit review; recovered MIDI takes reopen the shared Record bar. Older clip-targeted takes remain reviewable there and keep their original clip-variation destination. Browser storage limits can prevent recovery, and Studio reports when that happens.

## Projects

Use **+** beside the session picker to create a named session. Press **Ctrl+S** (Cmd+S on macOS) or **Save** in the bottom bar to save immediately, and wait for **Saved in this browser** before closing the page.
- **Autosave:** sessions save automatically in IndexedDB and keep their identity after reload. Switching sessions saves pending edits first.
- **Recovery:** recovery drafts protect interrupted saves, and Save retries a failed one.
- **What's saved:** every tab, clip, mapping, slot and controller value.
- **Session commands:** the command palette has **Save session as copy**, **Reload saved session** and **Delete session…**.

Older single-pattern and two-lane projects migrate to format v7 when opened. Their code and MIDI mappings are preserved, and the stored records are updated on the next save. Closing a tab hides it from the tab strip; deleting a pattern removes its code, clips and mappings after confirmation.

## Audio export

Run **Export full song render…** from the command palette, choose **Full composition**, and click **Render & download WAV**.
- **Format:** stereo WAV. Choose the sample rate and format (24-bit PCM, 16-bit PCM or 32-bit float), plus an adjustable effect tail (three seconds by default).
- **Current tab:** you can instead render a chosen number of cycles from the current tab.
- **What's captured:** current code, slider values, sound slots, and track and clip mutes. Rendering doesn't interrupt playback, and you can follow progress or cancel.
- **Limit:** exports can be up to fifteen minutes long.

## Import samples and back up projects

Open **Sample Catalogue** from Search and follow the import link under **Add sounds**. On the import page:
- **From GitHub:** paste a link to a public repository, folder or audio file, find samples, select which to download, and import them after review.
- **From your device:** upload audio files, a folder or a ZIP pack.

Downloads only happen when you ask; no pack is fetched automatically. Identical files reuse the existing sound, and renaming a pack or sound keeps references intact. **Back to Studio** returns to your draft.

Imports support WAV, MP3, OGG and FLAC wherever the browser can decode them. The limits are 64 MB per source file, 256 MB unpacked and 500 files per review. Originals are kept alongside the playback WAVs. Individual failures stay visible, and imports that already succeeded survive cancellation.

**Download project backup** bundles the session with its referenced audio and any available originals. The manifest lists missing files and external URLs.
- **Restore project backup…** creates a new session and leaves your existing sessions untouched.
- **Size limit:** backups are limited to 256 MB; if a project exceeds that, export smaller selections.
- **Missing audio:** sounds whose audio is missing from the library offer **Recover sound** for re-importing the original file.

## Follow-up interaction details

Sliders change values directly with pointer or keyboard. Use the `slider()` function-name menu to bind, inspect, or unbind a MIDI control; the compact listening status has Cancel learning. Opening device settings remains a separate deliberate action.

Outside clicks/taps and Escape dismiss only the top transient surface. Gestures begun inside do not dismiss it on release outside, and modal dismissal does not click through. Uncommitted dialog fields are retained for reopening within the page; dismissal does not save edits or accept/discard takes. The timeline and Record bar are persistent workspace controls. See [overlay audit](overlay-audit.md).

The built-in session is **DEMO: Neon Drive**. Its storage ID remains `Neon-Drive`; the update changes only the default display name, preserving music and user-renamed sessions.

Quick Start pairs focused actual-app videos with its existing illustrations and written instructions. Videos play deliberately, stay muted, and pause on topic changes or closing help. Capture recipes and virtual-MIDI fixture details are in [tutorial media](tutorial-media.md).
