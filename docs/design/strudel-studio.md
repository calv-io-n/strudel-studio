# Strudel Studio

Design target for the project. This describes intended behavior, not a claim that every feature is implemented.

A focused Strudel workspace: write patterns in tabs, play MIDI notes into selected code sections, record instruments and vocals as reusable sounds, and arrange patterns into a composition. Generate sounds with ElevenLabs when you need them.

## Design principle

The code is the main workspace. Everything else opens when needed.

Keep the first screen useful and quiet: one pattern, one obvious Play action, and room to work. Add a visible control only when it supports a frequent action. Put occasional actions in a menu or contextual panel.

## Visual direction

- Use the restraint of Apple's interfaces: clear typography, generous spacing, and familiar controls.
- Use neutral surfaces and one accent color for selection and active controls. Offer light and dark appearances through a moon/sun icon toggle in the top bar. Default to light and remember the choice locally; update the editor and tools together.
- Keep the editor opaque and readable. Any liquid-glass treatment should be subtle and limited to floating surfaces; no decorative blur behind code.
- Use thin separators and a consistent spacing scale. Avoid cards inside cards, excessive borders, decorative gradients, and ornamental animation.
- Use subtle rounded scrollbars throughout the editor and tools: slim neutral thumbs, quiet tracks, and stronger hover/drag contrast in both themes. Retain native scrolling and native high-contrast styling.
- Keep labels legible, keyboard focus visible, and motion optional. Minimalism must not hide essential state.

## Workspace

### Header and editor

The header contains a Sessions dropdown beside the Strudel name, the project name, save status, playback target, Play, and Stop. The dropdown opens saved sessions and refreshes when used. A + button beside it creates a named session, saving the current work first and using a numbered suffix for duplicate names. A moon/sun icon toggle in the top bar switches between light and dark mode, with an accessible Dark mode label. Occasional actions such as saving, importing, and exporting live in a single Project menu.

A tab strip sits directly above the editor. Each tab holds one named Strudel pattern. Creating, renaming, and closing tabs should feel familiar. Closing a tab must not silently discard work or break a composition that uses it.

The editor takes the remaining space. Inline sliders stay close to the code they control. Do not add a permanent mapping sidebar, event log, or device dashboard.

### Context menus

Right-click a pattern tab, composition clip, or library sound to act on that item without changing the active pattern. Shift+F10 and the Context Menu key open the same menu from a focused item; arrow keys navigate, Enter or Space activates, and Escape dismisses.

- Patterns: choose a named color, rename, duplicate, add to composition, and close. Duplication copies current code with fresh slider identities, without copying mappings or clips.
- Clips: mute/unmute, edit, duplicate, open source pattern, and remove. Duplicate clips occupy the first available quarter-cycle space after the original in the same track. Structural composition editing requires stopped playback; colors and mutes remain available live.
- Sounds: preview, insert into the current pattern, and rename.

Existing buttons remain available. Pattern actions includes duplication, and the clip dialog includes duplication and source navigation. The code editor retains its native context menu.

### Bottom drawer

Use one resizable bottom drawer with three views: **Composition**, **Virtual MIDI**, and **Export**. Only one view is visible at a time. Selecting the active view again collapses the drawer. All views start collapsed for a new project; remember the user's choice thereafter.

Collapsing or switching a view does not stop playback or reset controls. On narrow screens, the active tool can fill the workspace while preserving a clear way back to the editor.

### Composition

Start with two named tracks, expandable to 16, with per-track and per-clip muting. Tab colors identify their composition clips.

- Drag a pattern tab onto a track to create a clip. Also provide an “Add to composition” action for keyboard and touch use.
- Each clip references its source tab and has a start position and length measured in Strudel cycles.
- Stop playback before moving, resizing, adding, or removing clips. Clips snap to a selectable 1, ½, or ¼ cycle grid with magnetic edge alignment and do not overlap within the same track; clips in different tracks play together.
- Show pattern names, cycle markers, and a playhead. An empty track gives one short instruction.
- New clips are four cycles long. Use one shared tempo, initially 120 BPM with four beats per cycle. Composition ignores source patterns’ global tempo setters. Each clip plays its pattern from cycle zero and repeats for the clip's length. Normal composition playback stops at the end of its last clip. The explicit Jam with composition mode repeats its selected range for live transcription or recording, as described below.

Use eight named colors: blue, cyan, teal, green, amber, orange, rose, and violet. New tabs cycle through them; duplicated tabs inherit the source color. Clip colors always follow the source tab. Track headers offer Mute, exclusive Solo, and Rename/Remove actions; confirm removal of populated tracks and prevent deleting the last track.

Keep the opaque track-header column flush against the left edge, masking the timeline, drag previews, and playhead during horizontal scrolling. The ruler corner must mask scrolling cycle labels too.

Solo isolates one track at a time. Selecting another track switches isolation; toggling the active Solo off restores prior track mute settings. Explicit track and clip mutes take precedence over Solo; a muted soloed track remains silent. Persist the selected solo track and include it in export; apply live changes at the same safe boundary as mute.

Mute tracks or individual clips independently. While composition plays, schedule mute changes at the next safe cycle boundary and display pending state. Muting must not compile drafts or shorten the composition. Export captures mute settings at render start. Standalone tab playback stays independent.

Dragging a tab reveals Composition and shows a colored source label at the pointer before it reaches a track. Highlight valid and invalid destinations. Dragging preserves the grab offset, previews the destination, and magnetically aligns nearby edges. Reject overlaps without shifting neighbors. Escape cancels. Provide edge scrolling and keyboard movement: Left/Right by the grid, Up/Down across tracks, Shift+Left/Right to resize. Keep numeric editing accessible in quarter-cycle increments.

Keep volume mixing, track reordering, automation lanes, nested arrangements, and detailed clip inspectors out of the first version.

### Virtual MIDI

Show a compact set of knobs, sliders, and a small keyboard for testing and performance. Device selection and connection state belong here. Layout customization is secondary.

To map a control, select an inline slider, choose **MIDI Learn**, and move a physical or virtual control. Show the resulting mapping beside the selected slider, with a way to remove it. Offer Cancel while learning.

Mapped MIDI sliders and knobs must change their Strudel effect parameters live during tab and composition playback wherever the effect supports it, without restarting playback or requiring Apply changes. For example, moving a slider mapped to filter cutoff or reverb amount updates the audible effect and its inline value together. Keep parameter ranges and scaling consistent between physical MIDI, virtual controls, and inline sliders; smooth rapid changes where appropriate to avoid audible stepping or clicks.

Apply a live value to sounding or sustained audio when the underlying effect supports that update. Parameters evaluated only when a note starts affect the next scheduled notes; label that behavior. If an effect requires recompilation or cannot update live, show the limitation at the mapping and explain when the change will become audible. Live parameter updates must not apply unrelated draft edits, reset the playhead, or retrigger the pattern. Persist the latest control values; offline export captures them at render start rather than recording subsequent controller movements.

Virtual controls use the browser route by default and work without connected hardware. Unassigned keyboard notes play a simple synth; sample assignments override that sound. Connection failures and advanced routing options appear here when relevant, rather than occupying the main workspace.

### Play notes into selected code

Highlight a sound's code section to use its instrument and effects for live MIDI performance. Choose the output explicitly:

| Action | Result | Keeping the result |
| --- | --- | --- |
| Audition | Hear the sound while riffing; no saved output | No code or audio is created |
| Transcribe | Infer editable Strudel notes and rhythm during live play | Replace the selected musical expression after review |
| Record | Capture the actual played audio, including live effects | Save a reusable sound, then insert a sample reference into a tab |

Record uses the same audio-take workflow for a highlighted sound as for XLR or other external audio input. It does not require Transcribe. These workflows and their implementation status are tracked in [ADR 0003](../adr/0003-midi-note-capture-and-audio-recording.md) and [the architecture notes](../architecture/performance-input.md).

Highlight a note sequence or musical expression in a tab and choose **Play into selection** from an editor action available by keyboard and pointer. This arms that section as the destination for a physical MIDI keyboard or the virtual keyboard. Show the destination tab and highlight the armed range distinctly from ordinary text selection. Users can target different sections in succession; only one section receives notes at a time.

The transcription flow is: highlight a melody → riff alternative melodies on the MIDI keyboard with that section's instrument and effects → see code inferred as the notes are played → keep the preferred take in the highlighted section. The highlighted phrase supplies the musical context; incoming notes supply the new melody and rhythm. Users can freely try different pitches and phrases without being restricted to the notes already written.

- Audition incoming notes immediately using the selected section's sound and effects where supported. Explain when a section cannot be auditioned and offer an explicit fallback sound. Note input must not also trigger an unrelated sample assignment or overwrite a MIDI Learn mapping.
- Provide distinct **Audition**, **Transcribe**, and **Record** actions. Audition plays without creating code or an audio take. Transcribe infers editable Strudel code from played note pitches, order, timing, durations, rests, chords, and velocity. Update the proposed code beside the highlighted destination during live play, rather than waiting until transcription stops; held-note lengths remain provisional until release. Hearing a riff and seeing its inferred code must not require inserting or applying it first.
- Let users retry a melody over the same selected phrase without reselecting its sound or effects. Keep the current take available until explicitly replaced or discarded, and offer take preview before insertion. While riffing over running accompaniment, offer temporary suppression of the selected phrase's original notes so the alternative melody can be heard clearly; leave other sections playing and restore the original on cancel or leaving the performance mode. This temporary performance state does not modify saved code or track mute settings.
- In both Transcribe and Record, offer **Jam with composition**: loop a chosen composition range (defaulting to the full arrangement) while temporarily excluding every clip sourced from the current destination tab. Keep the other tabs playing as accompaniment and route live MIDI through the destination sound and effects. Transcribe converts only the incoming MIDI performance into Strudel syntax, with a code preview that updates while playing. Record saves only the selected live sound output or external audio input as an audio take, preserving played timing and live effects; accompaniment is neither transcribed nor mixed into the recording. This action explicitly starts the loop when stopped. Show the loop range and the temporarily excluded tab, keep the destination pinned, and restore its normal playback eligibility on leaving jam mode, cancelling the jam, or global Stop without altering saved track/clip mutes or Solo. Stopping only a take keeps the jam loop and temporary tab exclusion active for another take. Respect the existing mix for the remaining tabs.
- For Transcribe, let the user choose phrase length in cycles and timing quantization, including unquantized timing, with an optional count-in. Use the active playback tempo and cycle position when playing; when stopped, show the transcription tempo and cycle length before starting. Transcription and preview must preserve the intended phrase duration and chord overlaps.
- Show Transcribe as a live before/after code diff. Offer isolated preview and preview with accompaniment without accepting the proposal. **Accept into selection** keeps the whole proposed phrase; Discard leaves the original intact. Proposed notes remain separate from saved code until acceptance.
- **Insert into selection** replaces only the armed musical expression as one undoable edit. Preserve surrounding code, sound choices, effects, and unrelated sections. If an arbitrary selection cannot be safely replaced, explain why and let the user select a supported expression or explicitly insert a new expression. Never silently rewrite a whole tab.
- Pin a take to its original tab and range. Changing the destination ends transcription or recording and requires keeping or discarding the pending take before arming another section. If intervening edits invalidate the range, block insertion until the user chooses a valid destination. Switching tabs must not redirect incoming notes silently.
- Offer Stop, Cancel, and retry. Global Stop ends transcription or recording and releases held notes while retaining the take for review; disconnecting a device does the same and reports the interruption. An empty take must not erase existing code. Cancel discards the take without changing the tab.

**Record** captures the actual audio produced by the highlighted sound while the user plays MIDI, including performed timing, note expression, and audible live effect changes. It does not infer or quantize a note pattern, and does not recreate the take later from MIDI events. Save the performance as an audio asset through the same preview, trim, name, save, and sample-insertion flow as XLR/input recording. Inserting that take adds sample-playing code, not a transcription of its melody. Preserve the captured effects in the audio; sample insertion must not automatically apply the original effect chain a second time.

Transcribe and Record can each be used independently; neither requires the other. Label the output before starting: **Editable pattern** or **Audio take**. Recording a highlighted sound captures only that live performance, excluding other tabs, accompaniment, and the original sequenced phrase. Capture effect tails with a visible finishing state and an explicit way to end the tail. If the sound cannot be isolated, explain the limitation before recording rather than silently saving the full mix.

Inserted code remains a draft under the existing Play / Apply changes rules. MIDI Learn continues to map knobs and sliders to parameters; Transcribe and Record are separate contextual actions. Transcribe infers code from MIDI note events; recorded audio does not need automatic pitch transcription for this version.

## Sound library

Open the library from a single **Sounds** action. It is a temporary panel, closed by default, with exactly two source tabs: **Generate** and **Import**. Default to Import for new projects and remember the last used tab. Keep one shared searchable library of saved sounds and packs accessible beneath either tab, so users do not have to remember how a sound was acquired. Switching tabs preserves unfinished prompts, import selections, and recording state.

Generate contains sound generation. Import contains **Upload files or pack**, **From GitHub**, and **Record audio**. Upload supports drag-and-drop and a file picker; every flow also works by keyboard. Neither importing nor recording requires an ElevenLabs key or a generation request.

### Generate

The primary generation flow is: describe a sound → generate → preview → insert into the current pattern. Keep duration optional and looping off by default. These are secondary options below the prompt.

Show progress while generating, a useful error if generation fails, and a clear setup message when ElevenLabs is not configured. Never generate automatically or retry a paid request without an explicit action.

Keep sound assignment to MIDI controls contextual. Do not require users to understand sound slots or routing before they can hear and insert a sample.

### Import samples and packs

Make traditional sample use a short flow: upload files or paste a GitHub link → review samples → import → preview → insert into a pattern. Do not require editing sample registrations, cloning a repository, using a terminal, or configuring a separate sample server.

- **Upload files or pack:** accept individual audio files, multiple files, folders where supported, and ZIP sample packs. Support at least WAV, MP3, OGG, and FLAC, converting for playback when needed while retaining the originals. Show supported formats and size limits before upload; report unreadable or unsupported files individually without losing valid selections. A ZIP or multi-file picker remains available when folder upload is unavailable.
- **From GitHub:** accept a public repository, a folder within a repository, or an individual audio-file link. Resolve the selected branch, tag, or commit; discover playable samples without requiring a particular repository layout. Show a pack name, source, sample count, and available size information, with search, per-sample selection, and Select all. Preserve relative folders as useful browsing groups. Private repositories may report that authentication is unavailable and offer ZIP/file upload as a fallback.
- Preview individual samples from the review list before importing where available. Show progress and allow cancellation during discovery and import. On network failure, rate limiting, a missing path, or an unsupported pack, explain the issue and offer retry or upload. Report partial successes and allow retry of failed files without duplicating successful imports. Fetch sample data and metadata only; importing a repository must not execute its code or install dependencies.
- Import selected sounds into durable local storage with stable identifiers. Keep the source URL and resolved revision for GitHub imports, and retain pack names, original filenames, and supplied license/attribution files as metadata. Once imported, playback must work without GitHub access. Upstream changes never silently change an existing sample; refreshing a pack is explicit.
- Keep packs grouped in the shared library, searchable by pack, sample name, and folder. Offer immediate preview and **Insert into pattern** for each sample. Single files do not require creating a pack manually. Handle duplicate imports and naming collisions visibly, reusing identical assets where possible without overwriting different sounds or breaking references.
- Insert valid sample-playing code at the chosen editor location as one undoable edit. Preserve surrounding code, use stable sample identifiers, and follow the existing Play / Apply changes rules. Imported sounds support MIDI assignment, reuse across tabs, composition playback, and rendered WAV export just like generated and recorded sounds.

Renaming a pack or sample must not break existing patterns. Save/reopen and project backup/export must retain imported audio and its references, or explicitly identify the files needed for recovery. The library shows missing files with a recovery action. Large packs use a scrollable review list and progressive loading so browsing and cancellation remain responsive.

### Record instruments and vocals

The Sounds panel offers **Record audio** in its Import tab; Record on a highlighted sound opens that same workflow. Support microphones and instruments connected through an XLR-capable audio interface exposed as an audio input by the host. The user selects the interface and available input channel(s), including a single mono input; do not assume that an XLR connector is directly accessible to the browser. Hardware gain and phantom power remain controls on the interface.

Both external input and highlighted-sound recordings produce the same reusable audio-take asset. The Sounds panel shows the source explicitly: an external audio input or the highlighted sound’s live output. Recording internal sound output does not require microphone permission.

The flow is: choose source → check level → record → stop → preview and trim → save sound → insert into a tab.

- Request microphone/audio-input permission only when the user opens input setup or recording. Show the selected input, an input-level meter, clipping feedback, and a clear recording indicator. Explain denied permission, unavailable inputs, unsupported channel selection, and disconnected devices with a way to retry or choose another input.
- Input monitoring is optional and off by default. Support recording with the tab or composition playing as accompaniment, plus an optional count-in and cycle-length capture. Record the selected external input only; accompaniment must not be mixed into the saved take. Retain the take's tempo and start offset so a cycle-aligned phrase can be inserted without guessing its timing.
- **Jam with composition** is also available for audio recording from either source. Repeat the selected arrangement range with the destination tab’s clips temporarily excluded, and record continuously across loop boundaries until Stop recording or the chosen take length is reached. Do not overwrite earlier passes or automatically quantize, stretch, or loop the captured audio. Retain the take’s start offset and full duration. Stop recording ends the take while accompaniment continues; global Stop ends both. Restore the original tab eligibility on leaving jam mode.
- Stop recording, including global Stop, retains the take for review. Preview, trim start/end, rename, save, discard, and retry are explicit actions. On input loss, preserve recoverable audio and report that the take is incomplete. Never silently replace an existing recording.
- Save a kept take as a local audio asset with a stable sound identifier and an editable display name. Insert valid sample-playing Strudel code at the chosen location in the current tab, preserving unrelated code as one undoable edit. Insertion does not start playback or apply a running draft.
- Recorded sounds can be reused across tabs, assigned to MIDI controls, arranged through their source tabs, and included in rendered WAV exports. Renaming a sound or tab must not break its references. A sample's natural duration, trimming, and any explicit loop or timing treatment must be visible when previewing and inserting it; looping is opt-in.

Keep recording controls in the temporary Sounds panel, also reachable through Record on a highlighted sound, rather than adding a permanent recording track or another bottom-drawer view. Saving must retain the audio asset as well as its reference; project backup/export must include referenced recordings or explicitly identify the files needed to reopen the project. Missing assets produce a visible recovery action rather than silent playback failure.

## Playback and saving

- Use one Play button with a compact target selector: **Current tab** or **Composition**. Default to Current tab. Disable composition playback when the arrangement is empty.
- Play starts the selected target from the beginning. Stop ends playback and any preview or held notes. Switching tabs or changing the target does not start playback; stop the current target before switching playback modes.
- During playback, expose **Apply changes** to update the playing code at the next cycle boundary. Typing, saving, or switching tabs alone must not change the sound. MIDI and inline slider movements remain live. Code-defined tempo changes take effect on the next Play. Composition clips use the last applied version of their source pattern.
- Show the active playback target and playing/stopped state near the transport, including the source tab's name when applicable.
- Save tabs, composition, mappings, control values, and sound references together as one project, retaining referenced generated, imported, and recorded local audio assets and pack metadata. Show a quiet save status and a visible error if saving fails.

Audio rendering is available in the Export drawer beside Virtual MIDI, as specified below. Exporting pattern code remains a separate Project action.

## First-version acceptance

- A new project opens directly into an editable pattern with a working Play action.
- The editor remains the dominant surface; secondary tools are closed until requested.
- Users can arrange two overlapping patterns and play the composition without learning a full DAW.
- Users can map a physical or virtual MIDI control to an inline slider and see the result.
- During tab and composition playback, moving a mapped physical or virtual MIDI slider changes a supported Strudel effect audibly and updates the inline value without Apply changes, playback restart, or applying unrelated draft code. Verify sustained audio for effects that support continuous updates, next-note behavior for event-based parameters, and visible feedback for effects that cannot update live.
- Users can highlight a musical expression, audition and transcribe a MIDI phrase containing chords, rests, varied note lengths, and velocities, then insert inferred code into only that section. Repeating the flow on another section targets that section; undo restores the prior code and surrounding code remains intact.
- Users can highlight an existing melody and riff multiple different melodies with its instrument and effects while accompaniment continues. In Transcribe, inferred code updates visibly during live play; the original phrase can be temporarily suppressed without muting other sections. Keeping a take replaces only the selected phrase, and cancel restores the original playback behavior.
- Users can start Jam with composition in Transcribe, hear a repeating accompaniment with all clips from the destination tab excluded, and riff live through that tab’s selected sound while Strudel syntax appears. The loop continues across takes; keeping a take uses the normal review/insertion flow. Leaving the mode restores the tab without changing stored mix settings, and only live MIDI notes appear in the transcription.
- Users can Record over the same repeating composition with the destination tab excluded, using either the highlighted sound played through MIDI or an external instrument/vocal input. A take can span multiple loop passes without being overwritten at a loop boundary. Stopping the take leaves accompaniment running for review or another take; global Stop stops both. The saved audio contains only the selected source, preserves live timing/effects, and can be previewed, trimmed, saved, and inserted as a sample without transcription.
- Transcription works with the virtual keyboard without hardware. Cancel, an empty take, a device disconnect, or an invalidated selection cannot erase or misdirect code; inserted notes affect running playback only after Apply changes.
- Users can choose Record on a highlighted sound and save a riff as audio without generating inferred note code. The take preserves performed timing and live effect movements, excludes accompaniment, and remains unchanged when the original sound or effects are later edited. It uses the same review, storage, reuse, and export flow as external-input recordings; inserting it does not double-apply the original effects.
- Users can select an XLR audio interface input, record an instrument or vocal take, preview and trim it, and insert it as a reusable sound in a tab. Permission denial and input loss have visible recovery paths; monitoring starts off.
- A recording made alongside playback contains only the selected input. A cycle-aligned take retains its timing when inserted, plays through tab and composition playback, and is audible in rendered WAV export.
- Users can generate, preview, and insert a sound without leaving the workspace.
- Sounds has Generate and Import tabs with a shared saved library. A new project opens Import when Sounds is requested; importing and recording work without generation setup.
- Users can upload an individual sample, several files, a folder where supported, or a ZIP pack; preview and import selected sounds; and insert a working sample into a tab without editing registrations. Unsupported files do not prevent valid files from importing.
- Users can paste a public GitHub repository, subfolder, or audio-file link, choose samples, and import a locally retained pack. After importing, disconnecting from GitHub does not prevent playback, reopening, or WAV export. No repository code is executed.
- Pack/sample renames and repeated imports preserve existing references. Cancellation, partial failures, unavailable GitHub sources, and missing local assets have visible recovery paths. Import progress remains usable for large packs.
- Reopening a saved project restores its musical content, mappings, and recorded sounds. Renaming recordings preserves references; missing audio is reported with a recovery action.
- Essential actions work with keyboard input and have visible labels or accessible names.

When deciding whether to add something, ask: does this make writing, arranging, or performing easier right now? If not, defer it.

### Sound and effect completion

The code editor opens suggestions while typing in `s("…")` or `sound("…")`.
Search registered sound names or readable labels (`kick` finds `sbd`, the synth kick),
use arrows to select and Tab to insert. Ctrl+Space opens suggestions explicitly;
Escape dismisses them. Tab otherwise retains normal editor behavior.
Suggestions replace only the current sound name, preserving mini-notation.
After a dot, common effects include editable defaults, such as `.room(0.3)` for reverb.
The popup follows the workspace's light or dark appearance.

Saved sounds have editable display names in the existing Sounds panel. Labels are
searchable; inserted code uses stable sound identifiers, so renaming cannot break
patterns. Saved sample URLs register at startup without downloading audio until
used. No extra permanent browser, AI completion service, or sample-pack download is required.

### Rendered audio export

Export sits beside Virtual MIDI in the bottom drawer bar. It renders the full
composition from cycle zero to the last clip, or a chosen number of cycles from
the current tab. The default effect tail is three seconds, adjustable from zero
to fifteen. Output is a stereo, 44.1 kHz, 16-bit WAV, up to fifteen minutes long.
Render & download WAV captures the current code, slider values and active sound
slots. Offline rendering runs in an isolated frame, with progress, cancellation,
error feedback and a repeat-download link. It does not record later live MIDI
changes. Playback and editing remain available during export.

### Session persistence

Sessions receive a stable storage identity when created. Edits autosave to that
session's JSON file as well as recovery; the dropdown restores the selected session
after reload. Switching or adding a session flushes pending edits first. A browser
draft protects changes made immediately before reload or during a failed disk save.
The save status reports failures and Save project retries them. Creation assigns
collision-safe names on the server without replacing existing sessions.
