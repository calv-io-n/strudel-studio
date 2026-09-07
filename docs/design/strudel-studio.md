# Strudel Studio

Design target for the project. This describes intended behavior, not a claim that every feature is implemented.

A focused Strudel workspace: write patterns in tabs, arrange them into a composition, and perform with MIDI controls. Generate sounds with ElevenLabs when you need them.

## Design principle

The code is the main workspace. Everything else opens when needed.

Keep the first screen useful and quiet: one pattern, one obvious Play action, and room to work. Add a visible control only when it supports a frequent action. Put occasional actions in a menu or contextual panel.

## Visual direction

- Use the restraint of Apple's interfaces: clear typography, generous spacing, and familiar controls.
- Use neutral surfaces and one accent color for selection and active controls. Offer light and dark appearances through a single Dark mode checkbox in the top bar. Default to light and remember the choice locally; update the editor and tools together.
- Keep the editor opaque and readable. Any liquid-glass treatment should be subtle and limited to floating surfaces; no decorative blur behind code.
- Use thin separators and a consistent spacing scale. Avoid cards inside cards, excessive borders, decorative gradients, and ornamental animation.
- Keep labels legible, keyboard focus visible, and motion optional. Minimalism must not hide essential state.

## Workspace

### Header and editor

The header contains a Sessions dropdown beside the Strudel name, the project name, save status, playback target, Play, and Stop. The dropdown opens saved sessions and refreshes when used. A + button beside it creates a named session, saving the current work first and using a numbered suffix for duplicate names. Dark mode is directly accessible in the top bar. Occasional actions such as saving, importing, and exporting live in a single Project menu.

A tab strip sits directly above the editor. Each tab holds one named Strudel pattern. Creating, renaming, and closing tabs should feel familiar. Closing a tab must not silently discard work or break a composition that uses it.

The editor takes the remaining space. Inline sliders stay close to the code they control. Do not add a permanent mapping sidebar, event log, or device dashboard.

### Bottom drawer

Use one resizable bottom drawer with two views: **Composition** and **Virtual MIDI**. Only one view is visible at a time. Selecting the active view again collapses the drawer. Both views start collapsed for a new project; remember the user's choice thereafter.

Collapsing or switching a view does not stop playback or reset controls. On narrow screens, the active tool can fill the workspace while preserving a clear way back to the editor.

### Composition

Start with a simple two-lane sequencer, enough to arrange patterns and layer two at once.

- Drag a pattern tab onto a lane to create a clip. Also provide an “Add to composition” action for keyboard and touch use.
- Each clip references its source tab and has a start position and length measured in Strudel cycles.
- Stop playback before moving, resizing, adding, or removing clips. Clips snap to whole cycles and do not overlap within the same lane; clips in different lanes play together.
- Show pattern names, cycle markers, and a playhead. An empty lane gives one short instruction.
- New clips are four cycles long. Use one shared tempo, initially 120 BPM with four beats per cycle. Composition ignores source patterns’ global tempo setters. Each clip plays its pattern from cycle zero and repeats for the clip's length. The composition stops at the end of its last clip.

Keep mixing, automation lanes, nested arrangements, and detailed clip inspectors out of the first version.

### Virtual MIDI

Show a compact set of knobs, sliders, and a small keyboard for testing and performance. Device selection and connection state belong here. Layout customization is secondary.

To map a control, select an inline slider, choose **MIDI Learn**, and move a physical or virtual control. Show the resulting mapping beside the selected slider, with a way to remove it. Offer Cancel while learning.

Virtual controls use the browser route by default and work without connected hardware. Unassigned keyboard notes play a simple synth; sample assignments override that sound. Connection failures and advanced routing options appear here when relevant, rather than occupying the main workspace.

## Sound library

Open the library from a single **Sounds** action. It is a temporary panel, closed by default, and contains both saved sounds and sound generation.

The primary generation flow is: describe a sound → generate → preview → insert into the current pattern. Keep duration optional and looping off by default. These are secondary options below the prompt.

Show progress while generating, a useful error if generation fails, and a clear setup message when ElevenLabs is not configured. Never generate automatically or retry a paid request without an explicit action.

Keep sound assignment to MIDI controls contextual. Do not require users to understand sound slots or routing before they can hear and insert a sample.

## Playback and saving

- Use one Play button with a compact target selector: **Current tab** or **Composition**. Default to Current tab. Disable composition playback when the arrangement is empty.
- Play starts the selected target from the beginning. Stop ends playback and any preview or held notes. Switching tabs or changing the target does not start playback; stop the current target before switching playback modes.
- During playback, expose **Apply changes** to update the playing code at the next cycle boundary. Typing, saving, or switching tabs alone must not change the sound. MIDI and inline slider movements remain live. Code-defined tempo changes take effect on the next Play. Composition clips use the last applied version of their source pattern.
- Show the active playback target and playing/stopped state near the transport, including the source tab's name when applicable.
- Save tabs, composition, mappings, and control values together as one project. Show a quiet save status and a visible error if saving fails.

Audio rendering is available in the Export drawer beside Virtual MIDI, as specified below. Exporting pattern code remains a separate Project action.

## First-version acceptance

- A new project opens directly into an editable pattern with a working Play action.
- The editor remains the dominant surface; secondary tools are closed until requested.
- Users can arrange two overlapping patterns and play the composition without learning a full DAW.
- Users can map a physical or virtual MIDI control to an inline slider and see the result.
- Users can generate, preview, and insert a sound without leaving the workspace.
- Reopening a saved project restores its musical content and mappings.
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
