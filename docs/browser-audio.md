# Browser audio workflow

## Catalogue and storage

A new workspace contains synth-only Neon Drive and no downloaded samples. Open **Sample Catalogue** for available packs and your installed sounds. **Install pack** downloads pinned, checksum-verified audio; opening the catalogue only fetches metadata. Folder, ZIP, file, and public GitHub imports join the same library. Removing a downloaded pack lists project references and keeps personal copies; reinstall restores stable sound IDs.

Large audio uses immutable OPFS files; IndexedDB stores references and metadata. Unsupported or unavailable OPFS falls back to IndexedDB Blobs. Quota failures preserve the previous committed state and pending work. Save revisions reject overwriting another tab's newer project. Browser storage is per origin/profile, may be evicted, and is not cloud synchronization. Keep portable project ZIP backups, including audio, available originals, and linked dry takes.

WAV imports preserve native sample rate and source precision in float32 working audio. Compressed audio uses browser decoding, whose rate/codec behavior varies. Sources with more than two channels require explicit selection. Retained originals can rebuild legacy lower-precision working copies before rendering. A wider export cannot restore precision when no original survives.

## Live input

Open **Audio input**, choose the device, mono channel or stereo pair, and destination track, then connect. Browser permission requires an explicit action. Device hints stay local; project backups do not require the same hardware. One continuous input is supported per project. Monitoring starts off and is disabled on Stop or device loss.

```js
AUDIO
  .gain(slider(0.8, 0, 1))
  .pan(0.5)
  .lpf(6000)
  .room(0.2)
```

The code editor retains drafts until Apply. Sliders and MIDI Learn update supported controls live. Supported operations are `gain`, `pan` (0 left, 1 right), `lpf`/`cutoff`, `hpf`, `delay`, `delaytime`, `delayfeedback`, and `room`. Values must be numeric scalars or literal slider calls. Patterned values, arbitrary expressions, reverse, slicing, and sample-speed transformations produce errors and retain the previous applied graph. These are Studio input effects, not a new upstream Strudel API.

The input graph runs in the shared playback AudioContext and routes through the master output. Track enable/mute/solo gates monitoring; the meter shows input and processed levels. Headphones make monitoring practical with a microphone. Device channels exposed by GoXLR depend on its driver and browser. Automated tests use synthetic input; verify your actual channel pair, permission behavior, and latency locally.

## Record from the composition

Choose **Record to** in the composition toolbar, then press the red **Record audio input** button. It connects the selected microphone/interface if necessary and starts recording alongside the composition at the playhead. If the composition is already playing, recording joins it. Press **Stop recording** or either transport Stop control to finish. No sample-library form or separate Save action is required.

The default captures your applied vocal effects and retains a dry original. After a three-second effects tail, Studio automatically saves a new **Audio take N** pattern tab and places its clip on the selected existing track. The tab offers playback, rename, and **Show code**. The recording remains available in the catalogue and project backup. Audio input is for testing effects: monitor your microphone, or choose a saved recording and **Test vocal effects**. Tests prefer the dry original and never overwrite the saved sound.

The selected track needs empty space at the playhead. Recording stops before the next existing clip, reserving space for the effects tail. It also works on an empty composition and beyond existing material. Recording temporarily disables looping, seeking, tempo changes, and session changes. Monitoring stops when the take finishes. Capture timing uses the shared audio sample clock, retaining the precise offset inside the enclosing timeline clip.

**Recording settings** contains dry/editable capture, one-cycle count-in, and latency compensation. Defaults are processed capture, no count-in, and zero compensation. Device/channel selection stays in Audio input; it is not duplicated in another recorder form. Highlighted-instrument recording remains a separate feature.

Capture uses durable chunks, float32 working audio, and the existing duration/memory limits (up to fifteen minutes and 256 MB per stream). Saving publishes audio and pattern/clip placement together and checks project revisions. Device loss retains an interrupted take. Reload recovery and failed saves appear beside the composition Record button with **Retry save**, **Download recording**, and **Discard recording**. Retrying uses the same take identity to prevent duplicates.

Offline rendering needs a recorded performance. An enabled live input blocks export unless you explicitly exclude it. Future microphone sound and later knob movements cannot be included in an already-started offline job.

## Full Song Render

**Project → Export** renders the full composition or a chosen current-tab duration. Choose 44.1/48 kHz and 16-bit PCM, 24-bit PCM, or 32-bit float. Default is 48 kHz/24-bit. Optional TPDF dither applies only at final integer quantization. Float preserves over-range finite values; integer export reports clipping. Non-finite samples fail rather than silently corrupting output.

When drafts differ from applied code, select which version to render. The job freezes code, slider values, mute/solo state, sound slots, arrangement timing, take metadata, and audio bytes before starting its isolated render frame. Edits and MIDI movements afterward do not alter that snapshot. Preflight reports missing sounds, unsupported external sample dependencies, and unsupported live functions. It schedules the validated event snapshot and includes the selected tail (default three seconds, up to fifteen).

Limits are fifteen minutes, 100,000 scheduled events, and an estimated 512 MiB job budget, with at most 170 MB source audio. These bounds are intentionally conservative; browser/device limits can still be lower. Cancel releases the render frame and buffers. Large jobs should be reduced before retrying.

The input reverb has a deterministic three-second impulse; this is not convolution-IR import. Rendering isolates engine globals but does not make user-written JavaScript a security sandbox. Only run pattern code you trust. Third-party synthesis may not be bit-identical between browser versions.

## Saving in multiple tabs

Save compares session content with the version that tab last accepted. Saving unchanged content does not increment its revision. An unchanged tab can load a newer saved session; if both tabs have different edits, Studio automatically saves the local work as a clearly named conflict copy and keeps both versions. Each browser tab remembers its selected session independently.

Only unsaved work enters draft recovery, together with its saved base. Duplicated tabs use separate draft keys. On reload, recovery checks the current saved record before restoring a draft; older drafts without a base are preserved as copies when they conflict. Recording commits use the same policy and save their audio and placement atomically. Storage-full and validation failures still retain the draft and report a retryable save error.
