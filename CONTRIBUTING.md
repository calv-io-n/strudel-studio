> The current app is browser-only. Follow [setup](docs/setup.md) and run the production Pages suite; older server workflows are historical. No backend service or sample server is required.

# Contributing to Strudel Studio

Thanks for helping make a focused music workspace. This is an independent application built with Strudel; please report Studio-specific issues here and upstream language/audio issues to [Strudel](https://codeberg.org/uzu/strudel/issues).

## Development

Use Linux, Node 24 and npm. Clone the repository, run `npm ci`, then `npm run dev`. Optional integrations are described in [setup](docs/setup.md). Never use personal API keys or sessions in automated tests.

Before opening a pull request:

```bash
npm run studio:build
npm run studio:test
npm run setup:browser-tests
npm run studio:e2e
```

On Linux, browser system libraries can be installed with `npm run setup:browser-tests -- --with-deps`. This may require administrator privileges. The Pages browser tests use isolated browser contexts, fixture downloads, and simulated MIDI/audio inputs. Build first: the tests serve production static output. Use `STUDIO_CHROMIUM` only when intentionally testing another Chromium build.

## Choosing a change

Read the [architecture](docs/architecture/README.md) and [design direction](docs/design/strudel-studio.md). Small fixes, clearer documentation, accessibility improvements, and reproducible bug reports are welcome. Discuss major feature or dependency changes in an issue first. Track reordering, volume mixing, automation and hosted accounts remain outside the current target.

Keep PRs focused. Explain the user-visible problem and resulting behavior, describe validation, and include screenshots for visible UI changes. Add regression coverage for behavior that could break playback, persistence, mappings, or export. Do not add tests that merely repeat markup or implementation details.

Preserve project compatibility and keep user data out of fixtures. Do not reformat unrelated files, bundle dependency upgrades with unrelated changes, or introduce automatic paid requests. Changes to patched dependencies must record the upstream revision, purpose, and date in the attribution notes.

## Documentation changes

- **Target build:** update [docs/design/](docs/design/README.md) for intended product behavior and acceptance criteria. The main target is [strudel-studio.md](docs/design/strudel-studio.md).
- **Departure from the design:** add a numbered record in [docs/adr/](docs/adr/README.md), using its template. Cite the target section, explain the difference and why it is needed, and document alternatives, consequences, and validation. Mark new proposals as proposed; accepted decisions stay in history and can be superseded.
- **As built:** update [docs/architecture/](docs/architecture/README.md) in the implementation PR so it describes actual components, data flow, compatibility, and limitations. Include code links and relevant tests. Do not describe unimplemented plans as existing behavior.

A change that implements the target directly needs an architecture update when the implementation changes, but no departure ADR. An intentional target change should include the design update and a decision record explaining what changed. Keep README and workspace instructions consistent with the resulting behavior.

## Licensing and conduct

By submitting a contribution, you agree to license your original contribution under AGPL-3.0-or-later. Only contribute material you have the right to share; identify any third-party content and its license. No separate contributor agreement is required.

Be considerate and specific. Critique ideas and code, respect contributors' time, and avoid harassment or personal attacks. Maintainers may remove abusive content or close contributions outside the project's scope. Maintenance is best effort; no response-time commitment is implied.

Report security issues using [SECURITY.md](SECURITY.md), not a public bug report.
