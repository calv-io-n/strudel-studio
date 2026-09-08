# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: live-coders who already know or are learning Strudel and install Strudel Studio from GitHub on Linux (Node 24, Chromium-based browser). They want a local workspace that turns individual patterns into a song, lets them perform with a MIDI controller, and keeps sessions on disk. They arrive cold via `npm ci && npm run dev`, so first-run clarity and defaults matter.

Reference user: the maintainer, who uses Studio for noodling and for live streaming via OBS on Linux with a GoXLR mixer and an M-Audio Axiom AIR Mini 32 controller. Their workflow is the acceptance case, not the only audience.

## Product Purpose

Strudel Studio is a local-first workspace for writing Strudel patterns in named tabs, arranging them as colored clips on tracks, shaping them live with virtual or hardware MIDI, playing MIDI phrases into highlighted code, and exporting a stereo WAV. Success is a user going from an empty pattern to an arranged, performed, exported piece without leaving the workspace or learning a full DAW.

## Positioning

Three claims, in priority order:

1. **Independent patterns arranged as a song.** Named pattern tabs become colored clips on up to 16 tracks with mute, solo, snapping and a shared tempo. A live-coding language gains song structure without becoming a DAW. The strudel.cc REPL has one buffer and no arrangement; a DAW has no pattern language.
2. **Playing MIDI into code.** Highlight a note expression, riff on a keyboard with that expression's instrument and effects, and get editable Strudel notation back (Transcribe), or keep the actual audio as a sample (Record). Performance becomes text.
3. **Local-first ownership.** Sessions, samples, recordings and exports live on the user's machine under `.studio/` and `samples/`. No account, no cloud, localhost-only server.

Strudel Studio is an independent application built with Strudel; it is not the upstream REPL or an official Strudel release.

## Operating Context

- Runs as `npm run dev`: a Node server (`studio/server`) on localhost:5173 serving a Vite client, plus `@strudel/sampler` on port 5555 serving `./samples`. The server refuses non-localhost Host/Origin.
- Linux is the verified platform. Hardware MIDI uses a Python/ALSA bridge (`studio/midi/bridge.py`); virtual MIDI in the browser needs nothing installed. macOS and Windows are unverified.
- Typed code is a draft until **Apply changes** (Ctrl+Enter). Inline sliders and MIDI are live. Stop silences playback, previews and held notes. This distinction is load-bearing for every playback surface.
- Sessions autosave to `.studio/projects/` as JSON (format v4) with browser recovery drafts. Generated sounds go to `samples/ai/`. Project backups bundle referenced audio.
- Optional integrations: ElevenLabs key for sound generation (server-side, never automatic), FFmpeg/yt-dlp for recording helpers, GitHub public repos as sample sources.
- Used on stream via OBS, so the workspace is sometimes on camera at 1080p with a dark or light theme.
- Playwright e2e suite (`studio/tests/*.spec.ts`) and node:test unit suite guard UI flows; CI runs on Linux/Node 24.

## Capabilities and Constraints

Confirmed capabilities (as built, see `docs/workspace.md`):
- Pattern tabs with color, rename, duplicate, add-to-composition, close; code completion for sounds and effects; inline sliders.
- Composition: 2 to 16 named tracks, drag-to-create clips, 1/½/¼ cycle snapping with magnetic edges, per-track and per-clip mute, exclusive solo, keyboard clip movement, numeric clip editing, playhead, scheduled mute/solo at safe cycle boundaries.
- Virtual MIDI drawer: knobs, sliders, pads, keyboard; MIDI Learn onto inline sliders; device selection; live parameter updates without Apply.
- Play into selection / Audition / Transcribe / Record; Jam with composition; Transcribe on composition with loop range and take history.
- Sounds panel: Generate (ElevenLabs), Import (files, folders, ZIP, GitHub), Record audio (interface/mic); one shared searchable library; preview and insert.
- Export drawer: offline stereo 44.1 kHz 16-bit WAV of the composition or N cycles of a tab, up to 15 minutes, with effect tail.
- Sessions dropdown, Project menu (save, backup, restore, export code), light/dark toggle remembered per browser.

Binding product direction (from `DEFICIENCIES.md`, confirmed as current intent on 2026-09-08):
- **Simplify.** The editor and the composition are the core. Every other capability is secondary: reachable on demand, never resident on the first screen.
- **Sounds becomes a first-class sample library drawer**, renamed toward "Samples" or "Sample library", searchable by name, tag and description. It opens as a modal sheet over a dimmed, blurred workspace; keep the blurred overlay and preserve the underlying layout.
- **Timeline owns transport.** Playback controls and scrubbers move onto the composition timeline, in the manner of a video editor. Two scrubbers (play position and loop range) replace the separate loop start/end markers and the transcribe-on-composition controls. The track header column stays locked while tracks scroll.
- **Tabs are recoverable.** Tabs get an explicit close affordance and a top-level menu to reopen closed tabs.
- **Note and sound interaction is fluid.** Clicking a note or sound expression should lead directly to typing a new sample name or recording live MIDI, not to a configuration surface.
- Known deficiencies to resolve, not preserve: dead UI regions, a non-functional "Play into selection" affordance, poor UX when creating MIDI from live play, over-complicated Transcribe on composition.

Constraints future work must preserve:
- Localhost-only server; no loosening of Host/Origin checks.
- Draft-vs-live playback distinction (Apply changes vs sliders/MIDI).
- Persistent format rules live in `studio/shared/` (Zod schema, migrations), not in UI code. Format changes require a migration.
- Structural composition edits require stopped playback; mutes, solo and colors stay available live.
- Renaming sounds, packs or tabs must never break pattern references.
- Essential actions must work by keyboard with visible labels or accessible names; context menus support Shift+F10 and arrow navigation.
- Keep volume mixing, track reordering, automation lanes and nested arrangements out of scope.

Terminology: **pattern** (a named tab of Strudel code), **clip** (a placement of a pattern on a track), **track**, **cycle** (Strudel's time unit, four beats), **session** (a saved project), **take** (a pending Transcribe or Record result), **Apply changes**, **Jam with composition**, **sound / sample** (the library is moving toward "sample" wording).

Undecided: the exact final name of the Sounds drawer ("Samples" vs "Sample library"); whether Virtual MIDI and Export stay as drawer views or fold into menus under the simplification.

## Brand Commitments

- Name: **Strudel Studio**. Always disclose that it is an independent application built with Strudel, not the upstream project.
- License: AGPL-3.0-or-later for original code and docs; Strudel attribution preserved.
- Visual constraint volunteered by the user (recorded, not expanded): the restraint of Apple's interfaces, iOS-style minimalism; neutral surfaces with one accent; light default with a moon/sun toggle; opaque, readable editor; any liquid-glass treatment subtle and limited to floating surfaces. See `docs/design/strudel-studio.md` "Visual direction".
- Voice (from README and docs): plain, direct, second person, short sentences, no hype. Feature names are capitalized product terms (Apply changes, Play into selection, Jam with composition).

## Evidence on Hand

- `docs/media/hero.svg`, `docs/media/studio-dark.png`, `docs/media/studio-light.png`: current workspace screenshots and hero art.
- `docs/media/walkthrough.webm` and `walkthrough-poster.png`: captioned demo walkthrough.
- `patterns/sets/neon-drive/`: the Neon Drive demo session (46-second synth-pop arrangement, four patterns, two tracks, two mapped controls), installed by `npm run studio:demo`.
- `docs/design/strudel-studio.md`: target design and first-version acceptance criteria. `docs/architecture/`: as-built notes. `docs/adr/`: decisions.
- `DEFICIENCIES.md`: the maintainer's current list of UI/UX problems.
- No testimonials, user research, usage metrics, press or customer logos exist. Do not fabricate any.

## Product Principles

1. **The code is the workspace; the composition is the song.** Both are core. Everything else opens when needed and closes when done.
2. **Simplicity over configuration.** A visible control must earn its place by supporting a frequent action. Occasional actions live in menus and contextual panels. Remove before adding.
3. **Nothing changes the sound by surprise.** Typing is a draft; Apply, sliders and MIDI are the only live paths. Stop means silence. State that is pending or scheduled is shown.
4. **Performance becomes editable text.** Playing a controller should produce Strudel code or a reusable sample with the fewest steps, and always with review before commit.
5. **A stranger can run it cold.** Install, demo and first screen must work on a fresh Linux machine without hardware, keys or accounts; optional layers announce themselves only when relevant.

## Accessibility & Inclusion

- Keyboard-operable essentials: context menus via Shift+F10 / Context Menu key, arrow navigation, Enter/Space activate, Escape dismisses; clip movement and resizing by keyboard; completion by keyboard.
- Visible focus rings on all interactive controls; visible labels or accessible names for essential actions.
- Motion optional; minimalism must not hide essential state (pending mute, armed range, recording indicator, save status).
- Light and dark appearances both supported; native high-contrast styling retained; native scrolling preserved.
- Audio-input permission requested only on explicit user action, with visible denial and recovery paths.
