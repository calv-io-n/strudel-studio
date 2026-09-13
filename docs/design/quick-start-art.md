# Quick-start illustrations

Three original illustrations generated with the built-in image generation tool, using the user's soft 3D, isometric reference. The earlier Wii booklet direction was superseded. Final assets live in `studio/client/public/help/`:

- `connect-midi-3d.png`
- `connect-audio-3d.png`
- `transcribe-midi-3d.png`
- `drag-pattern-browser.webm` and `drag-pattern-browser.png`: actual browser recording and poster, captured with Playwright.

The app pairs the physical-input and transcription illustrations with small CSS animations and real HTML instructions. The arrangement guide instead shows a recording of the actual browser dragging a real tab into a real track. Regenerate it with `STUDIO_GUIDE_URL=http://127.0.0.1:5192 FFMPEG=/path/to/ffmpeg npx tsx scripts/record-drag-guide.ts` against a running local dev server. The script uses an isolated browser session and verifies that the dropped clip survives save and reload. The illustrations are conceptual; the HTML supplies the actual control labels. Animations can be paused and default to paused when reduced motion is preferred. The help does not claim that the current MIDI instrument tab can record a new pattern directly.

## Generation prompts

Each scene prompt below was appended to this shared style prompt:

> Create an original square 3D instructional scene for Strudel Studio, matching the user's latest visual reference: premium softly rendered miniature isometric room, rounded semi-realistic cartoon proportions, dark desaturated blue room, soft blue key light and violet-pink rim light, matte materials, subtle depth and ambient shadows. One faceless human character with a smooth blank face with absolutely no eyes/nose/mouth, short dark sculpted hair, muted pale-blue sweatshirt, dark trousers, white sneakers, seated at a compact music desk. Use a consistent character, desk, and room across this series. Isometric elevated three-quarter camera, full person and relevant desk equipment visible, one shelf and plant in soft background. Purpose is teaching desktop music workflows. Clear equipment and action, no VR headset, no controllers, no branding, no text, no labels, no letters or digits. Keep the important hand/device action large enough to read.

### Connect MIDI

> The character is plugging a USB cable from a compact white MIDI piano keyboard into a laptop side port, with one hand on the plug and other steadying the keyboard. Make the piano keys and the cable's source and destination clear. Subtle cyan glow traces the cable and a small curved luminous arrow points toward the laptop port. Laptop screen contains generic connected-device blocks. The only input device is the MIDI keyboard.

### Connect audio

> The character plugs a microphone's XLR cable into a small two-channel desktop audio interface. A microphone on a short stand sits at face height at the desk. A separate USB cable connects the interface to the laptop. Clearly show the microphone, interface, and laptop as three distinct devices. A subtle cyan glow traces the signal cable, green input meter bars glow on the laptop screen. The character's mouthless blank face is visible in profile. No piano keyboard.

### Transcribe MIDI

> The character plays both hands on a compact white MIDI piano keyboard in front of a desktop monitor. A few floating cyan rectangular musical note blocks arc from the keys toward the monitor, becoming three short lines of abstract glowing code bars on its screen. A small coral recording dot appears in the screen corner. This visually explains performed notes becoming editable code. Keep the monitor and hands prominent, blank faceless head visible.
