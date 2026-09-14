# Transient-surface audit — follow-up #47

The shared `overlay.ts` handler tracks the top open surface. Native dialogs are discovered automatically; custom menus, sheets, the catalogue and new-pattern popover register their existing close callbacks. An outside gesture must begin and end outside the same top surface. Its click is consumed before any underlying transport or destructive action. Escape closes that surface only. Focus restoration uses the existing trigger callbacks or native dialog behavior.

| Surface / entry | Primitive and dismissal | Verification |
| --- | --- | --- |
| Patterns tab strip, including Rhythm: right-click / Shift+F10 | ContextMenu; outside, Escape, item activation | Browser: menu activation, rename, closed/open tab transitions |
| Pattern creation: + beside tabs | Registered form popover; outside/Escape retains name and color draft | Browser audit |
| Pattern rename (double-click/F2), session/track rename, tempo | Native edit dialog; outside/Escape cancel, draft fields retained for reopening | Browser: Rhythm rename, drag release outside, no click-through, preserved draft |
| Pattern color | Native dynamic dialog; outside/Escape close; color changes require explicit selection | Browser audit |
| Track and clip context menus | ContextMenu; outside/Escape returns focus | Browser audit |
| Clip position/length/source-offset editor | Native dialog; only explicit save/mute/duplicate/remove applies actions | Browser: beat editing, trims and cancellation |
| Search / closed-pattern selector | Registered native dialog; outside/Escape calls palette close | Browser: keyboard filtering, nested closed-pattern selection, eight stable defaults |
| MIDI, Audio input, Record settings, Export | Sheets with backdrop; outside/Escape closes top sheet | Browser: inputs, render, nested Quick Start and retained parent |
| Sample Catalogue, including note sound-token entry | Registered modal panel; existing close releases audition voices | Browser: sample insertion, external installation and capture flows |
| Sample metadata, pack-removal and other confirmations | Automatically registered native dialogs; cancel return value never submits | Browser audit |
| note() and slider() function menus | ContextMenu; opening alone starts no recording or learn | Browser: audition, recording arming, direct slider values, mapping cancellation/persistence |
| Quick Start, including contextual help inside a sheet | Native dialog; outside/Escape pauses all videos and restores parent focus | Browser: nested dismissal, preference unchanged, explicit opt-out/reopening |

The composition timeline, editor/input tabs and Record bar are persistent workspace controls. They are not registered overlays and remain open when the editor is clicked. The full sample-import page is navigation rather than a modal; its draft/review state is retained by the existing import controllers. Closing a surface does not stop a MIDI take, save dialog edits, accept imports, or discard recovery data.

The removed transcription sheet and slider-mapping panel have no remaining entry paths. Legacy clip-take recovery appears in the Record bar and cannot start new captures. Native form drafts remain in page memory, keyed by dialog identity and original field values; explicit submission clears that cached draft.
