# Setup, hosting, and migration

Studio is a static browser application. All project persistence, audio processing, recording, and WAV export run on the visitor's device. The only required hosting is static file delivery over HTTPS.

## Local development

Use Node 24 and npm. Run `npm ci`, then `npm run dev`, and open http://localhost:5173. There is no separate sample server and no Python, Bun, ElevenLabs key, or backend service requirement. Use a Chromium-based desktop browser for the verified workflow. Browser codec and Web MIDI availability vary.

`npm run studio:build` generates catalogue metadata, checks TypeScript, and builds `studio/dist`. `npm run studio:preview` serves those exact production files locally. `npm run studio:starters` generates the pinned catalogue manifest and starter projects without downloading or bundling audio. The optional source generator is `scripts/generate-starter-audio.ts`.

## Local StemKit → WAV editor

StemKit stays a separate desktop application. Export its stems as WAV, then open them in Studio's WAV editor; there is no local bridge or automatic transfer.

On Linux x64, the optional local launcher expects the official Debian package extracted under `.local/stemkit/app` (ignored by Git). This installs no system packages:

```bash
mkdir -p .local/stemkit
curl -fL https://github.com/danielravina/stemkit/releases/download/v0.1.23/StemKit-0.1.23-linux-amd64.deb -o .local/stemkit/StemKit-0.1.23-linux-amd64.deb
echo 'a85b7fd49f43e0a9c7649779af211ad937aa5b2f3d31a7d6c4b7e9974162abbb  .local/stemkit/StemKit-0.1.23-linux-amd64.deb' | sha256sum --check -
dpkg-deb -x .local/stemkit/StemKit-0.1.23-linux-amd64.deb .local/stemkit/app
npm run stemkit:local
```

Complete StemKit's one-time engine setup. Its environment and song library live in `~/.config/StemKit`; models and dependencies are downloaded locally. The default Linux engine runs on CPU. GPU and higher-quality vocal options are optional downloads in StemKit's settings.

In another terminal, run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`, then open **http://127.0.0.1:5173/#/samples/edit**. In StemKit, split a local audio file or supported YouTube link, select the completed song, and export the desired stem as WAV. In Studio, choose **Open WAV**, select that exported file, audition a region, then **Save and insert**. You can repeat this for additional samples from the same stem.

Keep using the same Studio address: `127.0.0.1`, `localhost`, and `strudelstudio.online` have separate browser libraries. Use project backup/restore to move samples and sessions between them.

## Cloudflare Pages


Production uses the Cloudflare Pages Direct Upload project `strudel-studio`, with production branch `main` and custom domain `strudelstudio.online`. GitHub Actions in `.github/workflows/ci.yml` builds on Node 24, runs unit and browser tests, then deploys the verified `studio/dist` artifact after a successful push to `main`. Pull requests only run checks. The CI workflow can also be run manually on `main` to redeploy.

GitHub repository variable `CLOUDFLARE_ACCOUNT_ID` identifies the Cloudflare account. Repository secret `CLOUDFLARE_API_TOKEN` must contain a token with **Account → Cloudflare Pages → Edit**, scoped to that account. These credentials are used only by the deployment job, not by the browser application. No Pages Functions or runtime secrets are needed. See [Cloudflare's Direct Upload CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

The custom domain points to `strudel-studio.pages.dev`; Cloudflare activates it and provisions HTTPS after nameserver and domain validation. Push the browser-only application changes together with the workflow before the first release.

Publish only `studio/dist`, never the repository root or local data directories. The build contains the application, its isolated render page, headers, and the starter manifest. Imported samples and saved projects are never part of a build.

The import route is `/#/samples/import`, so direct navigation works without a server-side router. `/render.html` must remain a separate HTML entry for isolated WAV rendering. `_headers` allows same-origin MIDI and microphone access, revalidates HTML and starter assets, and caches hashed application assets. Do not add a policy blocking blob audio/worklets or JavaScript evaluation: the Strudel live-coding engine requires them. HTTPS permits browser storage locks, Web MIDI, and microphone access; localhost is also a secure context for development.

Before publishing, run the build, unit tests, and browser tests. In a fresh browser on the final URL, play Neon Drive, explicitly install the CC0 pack and play Drum Basics, save/reload an edit, import a GitHub sample, export a WAV, and download/restore a backup. Verify there are no `/api/`, localhost-service, or application WebSocket requests. Cloudflare Pages supports static hosting without paid backend services; platform limits still apply.

## Data and backups

IndexedDB database `strudel-studio` version 2 holds projects, asset metadata, presets, settings, and audio references. Immutable large audio and pending capture chunks use OPFS when available, with IndexedDB Blob fallback. Metadata commits publish staged files atomically; unreferenced staged files are collected on startup. Recovery drafts and pending recordings/import reviews also use browser-local storage. Project schema v6 migrates v1–v5 without replacing stable sample IDs. Save revisions detect stale edits from another tab.

Storage belongs to the site's origin and browser profile. A Pages preview URL, localhost, a `pages.dev` domain, and a custom domain have separate data. Use ZIP project backups to move music between them. Clearing browsing/site data can remove it; private browsing may not retain it. The import page shows usage and can request persistent storage, which the browser may decline.

**Project → Download project backup** includes the project, referenced audio and available originals. Its manifest lists missing audio and external URLs. **Restore project backup** creates a separately named session, preserves existing data, and rejects conflicting sample IDs with different audio. The backup limit remains 256 MB unpacked; use smaller project selections if necessary. WAV export preserves the sound, not an editable arrangement.

## Move from the previous local-server version

Before updating an old installation, open it and download a project ZIP backup for each session you want to keep. Then open the hosted/browser version and restore each backup using Project. The new version accepts the existing ZIP format and project schema migrations.

The website cannot automatically read `.studio/projects/` or `samples/` from your computer. Those existing folders are left untouched. If you already updated without exporting, run the preceding Git revision in a separate checkout with copies of your old project and sample directories, export backups there, then restore them here. Keep the original directories until you have verified the restored music.

Old session mappings remain readable, but Linux/ALSA port names do not identify browser MIDI ports. Enable and reconnect each hardware device in the browser, then remap any controls tied to old port profiles. AI generation and OS loopback are no longer application features; already saved generated audio still imports through project backups.

## GitHub imports

Only public HTTPS GitHub repositories, folders, and supported audio-file links are accepted. Discovery resolves the selected revision to a commit, lists matching audio, and downloads selected raw files directly. Imported audio stays available in browser storage after download; there is no streaming dependency on GitHub for that imported sound.

GitHub may rate-limit unauthenticated discovery. Choose a narrower folder, retry later, or download a ZIP/file yourself and use Upload. No GitHub token is requested or embedded in the app. Audio rights remain those of the source repository; inclusion on GitHub does not establish permission to redistribute a pack.

## Verification

Run `npm run studio:build`, `npm run studio:test`, and `npm run studio:e2e`. Install Chromium with `npm run setup:browser-tests`, or provide `STUDIO_CHROMIUM` for an existing executable. The browser suite serves `studio/dist` on port 5185; build first after changing application files.

The production Pages suite is `studio/tests/pages.spec.ts`. Earlier server-dependent browser specs remain as historical regression references, not a runnable server target. Pure domain tests and legacy project/backup compatibility tests still run in the unit suite. The retained filesystem helper modules support those compatibility checks; they are not included in the client or exposed as a server.

## Optional legacy downloaded-cache cleanup

The browser cannot delete old filesystem caches. `scripts/legacy-cache-cleanup.ts` is a separate local tool: first run it with explicit `--cache`, `--projects`, and `--personal-audio` paths to inspect a dry-run report. Only add `--apply` after reviewing that report. It requires provenance metadata, rejects ambiguous directories and symlinks, reports project references, and retains personal imports, recordings, generated audio, and project files. Missing provenance is a reason to keep a file. No cleanup runs during application startup or build.

See [browser audio](browser-audio.md) for capture, precision, and render behavior.

### Aligning a sample to the song

Add a tab containing one saved sample to the composition to place it as **Play once**. The clip covers the whole sample; extending adds silence and trimming limits playback. Right-click a WAV clip and choose **Align…** (or click the clip and choose **Align**). Nothing in the sample changes: alignment is stored on the clip as *anchors*, pairs of a second in the sample and a beat from the clip start. Between anchors the audio stretches without changing pitch (0.5×–2× per interval); before the first anchor the clip is silent, after the last it plays at its natural speed.

- **Play with song** loops the clip with the composition, respecting mutes and solos. **Original / Aligned** compares the saved timing with your draft; prepared changes enter on the next loop.
- Hollow markers are suggested attacks (audio onsets, not words). Drag one onto a beat or offbeat to make it an anchor; snapping is to sixteenths, Alt gives free timing, arrow keys nudge, double-click adds an anchor, Delete removes the selected one. Drag the first anchor to give the phrase a pickup or lead-in.
- **Smart snap** pulls every suggested attack that sits within 70 ms of a grid line (beat, 1/8 or 1/16) onto it, nearest first, skipping any that would exceed the stretch limit. The status line reports how many were snapped.
- **Fit phrase to 1/2/4/8 bars** stretches the audible window uniformly and sets the clip length to match.
- **Apply** saves the anchors and length on this clip only; other clips, the pattern and the sample are untouched. **Cancel** saves nothing. Duplicate a clip to give the copy its own alignment.

Anchors are beats, so changing the project tempo re-renders every aligned clip automatically. A tempo change is refused while it would push an interval outside 0.5×–2×; open **Align…** on the named clip first. Rendered audio is prepared when playback or export starts and cached per sample, tempo and anchors; stretched spans are limited to 60 seconds of source and 120 seconds of output.

Timeline waveforms show each audio clip's source through its anchors, including lead silence and space after the sample ends.

### Swapping a named chop

Click a marked sound name in a pattern, such as `opening` in `opening.struct(...)`, or its name above the editor. The catalogue opens for that destination. Select a sound and play your connected MIDI controller or the test keys. For a sample, drag a region of the waveform to audition a smaller cut; the beat grid, snapping and click track are under the collapsed advanced controls; fit or align the saved cut from its clip.

Choose **Use for Opening** to save the selected cut and replace that chop's source. Its rhythm and effects remain in the pattern. During playback, the confirmed replacement is queued for the next cycle; unrelated code drafts remain unapplied. Cancel leaves the pattern unchanged. If the destination changed or does not exist in the playing version, stop playback and select it again. Undo restores the previous source in the editor; use Apply to hear an undo during playback.


