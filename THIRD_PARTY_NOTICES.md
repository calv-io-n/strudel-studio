# Licensing and attribution

Strudel Studio is an independent application built with [Strudel](https://strudel.cc), not the upstream Strudel REPL or an official release of it. Strudel is developed by its contributors, including Alex McLean and Felix Roos. Original project code and documentation are licensed under **AGPL-3.0-or-later**; see [LICENSE](LICENSE). Existing third-party copyrights and license terms remain in force.

## Software

| Component | Source | License |
| --- | --- | --- |
| `@strudel/*` packages | https://codeberg.org/uzu/strudel | AGPL-3.0-or-later; preserve package notices |
| CodeMirror and Lezer packages | https://github.com/codemirror and https://github.com/lezer-parser | MIT |
| `strudel-server` legacy watcher | https://github.com/micahkepe/strudel-server | MIT |
| `python-rtmidi` optional MIDI bridge dependency | https://github.com/SpotlightKid/python-rtmidi | MIT; bundled RtMidi notices also apply |

This table names major integrations, not every transitive dependency. Exact JavaScript versions and sources are recorded in `package-lock.json`; installed distributions contain their own license texts. Do not remove these notices when redistributing dependencies or bundles. Separate MIDI MCP tooling is opt-in and retains its upstream license.

### Watcher modification

The legacy watcher is pinned to upstream commit `b7b4e5742a54ffda7781bd0d1ef33d6a0588c73e`. `scripts/patch-strudel-server.mjs` updates outdated `#code` selectors to `.code-container` so the watcher can interact with the current upstream REPL. The modification is documented here on 2026-09-07 and is applied explicitly by `npm run setup:watcher`; the upstream MIT notice is preserved. The patch is reproducible from this repository and does not change the upstream license.

## Patterns, samples, and media

The Neon Drive demo is a project-authored, synth-only arrangement. It is distributed with the project under AGPL-3.0-or-later and does not bundle third-party audio. The README hero, screenshots and walkthrough are project-produced release materials under the same license, with upstream UI/code attribution retained.

No audio binaries are committed in the initial source tree. Some older patterns reference external libraries, including Dirt-Samples, soundfonts and sample banks. Those references do not grant redistribution rights to the audio. Check the source library's license before downloading, sharing or bundling those sounds. User recordings, manually downloaded samples and ElevenLabs outputs are not relicensed by this repository's software license.

## Source availability

The complete application source, build instructions, lockfile and dependency patch are available at https://github.com/calv-io-n/strudel. If you distribute or host a modified version, provide the corresponding source for that version and preserve license notices. Update the in-app source links to your own source distribution when it differs from this repository. See [Strudel's licensing guidance](https://strudel.cc/technical-manual/project-start/) and the full license for the applicable terms.
