# 0005: External MIDI connections belong to the installation

- Status: Accepted
- Date: 2026-09-08
- Target: [MIDI devices and on-screen controller](../design/strudel-studio.md#midi-devices-and-on-screen-controller)
- Decision authority: user requested restoring the missing external controller and making the MIDI menu exclusively about connecting external devices before a PR

## Design before this change

Virtual MIDI mixed browser keys and knobs with external device settings. Enabled hardware profiles in each project determined a browser’s bridge subscriptions; switching to a new song could remove them, and closing browser clients changed the desired port list.

## Decision and reason

Persist external input choices at installation scope and change them only through explicit Connect/Disconnect actions. Session loading and WebSocket lifecycle no longer own subscriptions. Move hardware controls into the directly accessible MIDI devices view. Keep the useful browser controller under Project → On-screen controller, with mappings and diagnostics separate from device setup.

Copying profiles into every demo would only hide the bug for those songs. Client-only preferences would still let browser windows disagree. One atomic server-side connection store gives the local, single-user installation a consistent source of truth.

## Compatibility and validation

On first initialization, import enabled external profiles from saved projects. Persist even an empty choice so deliberately disconnected ports are not remigrated. Keep old project profile IDs for existing MIDI mappings; ignore obsolete WebSocket session subscription messages from pages awaiting reload. Device settings remain outside portable song backups.

Unit tests cover one-time migration, disconnect/restart persistence and concurrent connection updates. Browser regression coverage checks external input in a fresh song, session switches, reload, browser closure, unplug/replug status and explicit disconnect. Existing virtual-controller, transcription and mapping flows remain covered through the separate menu.
