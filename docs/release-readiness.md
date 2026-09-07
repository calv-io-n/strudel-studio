# Initial release preparation

This is preparation for the first GitHub release, not a published release announcement. The package version remains `1.0.0`; `private: true` prevents accidental npm publication. GitHub is the intended source distribution channel.

## Draft release notes

**Strudel Studio — a local-first music workspace built with Strudel.**

Write independent pattern tabs, arrange two layers on a shared clock, perform with virtual or optional physical MIDI, and render stereo WAV without leaving the editor. The included Neon Drive demo introduces the workflow without an account, API key, or downloaded samples.

Highlights:

- Named tabs and contextual rename/duplicate actions.
- Two-lane, whole-cycle composition and explicit Apply changes during playback.
- Inline sliders, MIDI Learn, virtual controls, and optional Linux/ALSA hardware routing.
- Local session autosave, recovery drafts, and migration from earlier project files.
- Optional ElevenLabs generation with a user-supplied server key.
- Offline stereo WAV export, dark/light appearance, and keyboard-accessible context menus.
- AGPL-3.0-or-later licensing, upstream attribution, explicit optional setup, and Linux/Node 24 CI.
- Deferred autocomplete focus-loss handling to avoid nested editor updates when a focused suggestion is redrawn.

### Known limitations

Linux is the first-release target. macOS and Windows have not been verified. Physical MIDI requires an ALSA-capable host. Studio uses a development server on localhost; it is not a production multi-user hosting package. Imported patterns execute JavaScript and should be reviewed before running. External sounds require their own licensing and availability checks. The older watcher depends on the upstream REPL's changing interface. Audio-engine bundles are large and an upstream soundfont dependency uses eval; the build reports these warnings.

### Next priorities

Improve setup feedback and accessibility based on reports; validate additional platforms; simplify UI modules as concrete changes warrant it. More lanes, automation, and hosted accounts are not promised for this release.

## Maintainer steps after the readiness PR

- Review and merge only after CI passes and the licensing/security review has no unresolved release blockers.
- Enable GitHub private vulnerability reporting, then verify the Security tab's reporting link. The current policy includes a no-details contact-request fallback until enabled.
- Require the `Linux / Node 24` check for protected `master` updates. Do not create a required check before the workflow exists on the default branch.
- Update the repository description to “A local-first music workspace built with Strudel: patterns, two-lane composition, MIDI and WAV export.” Suggested topics: `strudel`, `live-coding`, `music`, `midi`, `web-audio`.
- Review original-content provenance and third-party notices before tagging. Do not add downloaded/generated audio without a rights review.
- Confirm README media and source links on `master`, then publish a release from the reviewed commit using the draft notes above. No tag or release is created by this preparation PR.

## Audit and validation record

Audit date: 2026-09-07. Gitleaks v8.30.1, verified against its official release checksum, found zero findings in all available Git history and in the isolated release source tree. A separate local-directory scan detected the expected ignored `.env` credential; it is absent from both tracked source and Git history. No raw reports or secrets are committed.

The initial npm audit reported `concurrently` → `shell-quote` advisories GHSA-w7jw-789q-3m8p and GHSA-395f-4hp3-45gv. `concurrently` was updated within major version 9 to 9.2.4, resolving `shell-quote` to 1.9.0. The resulting clean install reported zero npm vulnerabilities. Although listed as a dev dependency, concurrently launches the local application; this was fixed rather than dismissed as test-only. Audit results reflect known advisories at the time, not a guarantee of security.

No audio binaries were tracked before adding release media. Installed packages were checked for declared licenses; the legacy watcher omits the package field but includes an MIT LICENSE. Strudel's AGPL packages and the watcher's MIT license are documented in third-party notices. External samples remain outside the software's license grant.

The lockfile pins the optional watcher to HTTPS for anonymous installation, with no user Git configuration or warm npm cache required. The browser pattern-query regression now resolves Strudel through Vite’s module resolver instead of a generated cache filename; its timing assertions are preserved. Validation results are recorded in the readiness PR. On the development host, Playwright's `--with-deps` step requires interactive sudo; browser-only installation is verified separately. Ubuntu CI performs the system-library step on its hosted runner.

### Completed local checks

- Clean anonymous `npm ci` with an empty npm cache and no user Git configuration: passed; no automatic browser installation.
- Node 24 production build/type check: passed, with the documented upstream bundle warnings.
- Unit suite: 20 passed.
- Browser suite using explicitly installed Chromium in the clean checkout: 23 passed, 1 physical ALSA test skipped.
- Autocomplete focus regression and existing completion flow: passed three repetitions each.
- Explicit browser-only and watcher setup commands: passed. System-library installation requires interactive sudo on this development host.
- GitHub Markdown rendering: all README images loaded in light and dark previews; narrow layout has no horizontal overflow; local documentation links resolve.
- npm audit: zero reported vulnerabilities after the compatible dependency update. Gitleaks history, release-source, and staged-change scans: zero findings.
