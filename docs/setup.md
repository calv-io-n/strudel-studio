# Setup, hosting, and migration

Studio is a static browser application. All project persistence, audio processing, recording, and WAV export run on the visitor's device. The only required hosting is static file delivery over HTTPS.

## Local development

Use Node 24 and npm. Run `npm ci`, then `npm run dev`, and open http://localhost:5173. There is no separate sample server and no Python, Bun, ElevenLabs key, or backend service requirement. Use a Chromium-based desktop browser for the verified workflow. Browser codec and Web MIDI availability vary.

`npm run studio:build` generates the small starter collection, checks TypeScript, and builds `studio/dist`. `npm run studio:preview` serves those exact production files locally. `npm run studio:starters` regenerates the six original CC0 WAVs and two starter projects.

## Cloudflare Pages

Production uses the Cloudflare Pages Direct Upload project `strudel-studio`, with production branch `main` and custom domain `strudelstudio.online`. GitHub Actions in `.github/workflows/ci.yml` builds on Node 24, runs unit and browser tests, then deploys the verified `studio/dist` artifact after a successful push to `main`. Pull requests only run checks. The CI workflow can also be run manually on `main` to redeploy.

GitHub repository variable `CLOUDFLARE_ACCOUNT_ID` identifies the Cloudflare account. Repository secret `CLOUDFLARE_API_TOKEN` must contain a token with **Account → Cloudflare Pages → Edit**, scoped to that account. These credentials are used only by the deployment job, not by the browser application. No Pages Functions or runtime secrets are needed. See [Cloudflare's Direct Upload CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

The custom domain points to `strudel-studio.pages.dev`; Cloudflare activates it and provisions HTTPS after nameserver and domain validation. Push the browser-only application changes together with the workflow before the first release.

Publish only `studio/dist`, never the repository root or local data directories. The build contains the application, its isolated render page, headers, and the starter manifest/audio. Imported samples and saved projects are never part of a build.

The import route is `/#/samples/import`, so direct navigation works without a server-side router. `/render.html` must remain a separate HTML entry for isolated WAV rendering. `_headers` allows same-origin MIDI and microphone access, revalidates HTML and starter assets, and caches hashed application assets. Do not add a policy blocking blob audio/worklets or JavaScript evaluation: the Strudel live-coding engine requires them. HTTPS permits browser storage locks, Web MIDI, and microphone access; localhost is also a secure context for development.

Before publishing, run the build, unit tests, and browser tests. In a fresh browser on the final URL, play both starter projects, save/reload an edit, import a GitHub sample, export a WAV, and download/restore a backup. Verify there are no `/api/`, localhost-service, or application WebSocket requests. Cloudflare Pages supports static hosting without paid backend services; platform limits still apply.

## Data and backups

IndexedDB database `strudel-studio` holds projects, assets, playback audio, originals, presets, and settings. Recovery drafts and pending recordings/import reviews also use browser-local storage. Projects keep the existing schema and stable sample IDs.

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

Run `npm run studio:build`, `npm run studio:test`, and `npm run studio:e2e`. Install Chromium with `npm run setup:browser-tests`, or provide `STUDIO_CHROMIUM` for an existing executable. The browser suite serves `studio/dist` on port 5175; build first after changing application files.

The production Pages suite is `studio/tests/pages.spec.ts`. Earlier server-dependent browser specs remain as historical regression references, not a runnable server target. Pure domain tests and legacy project/backup compatibility tests still run in the unit suite. The retained filesystem helper modules support those compatibility checks; they are not included in the client or exposed as a server.
