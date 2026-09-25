import { decodeWav, encodeWav, wavInfo } from './wav';

export const SOURCE_LIMIT = 256_000_000;
export const SAMPLE_LIMIT = 64_000_000;
export type EditableAudio = ReturnType<typeof decodeWav>;
export function decodeEditableWav(bytes: Uint8Array): EditableAudio {
  if (bytes.byteLength > SOURCE_LIMIT) throw new Error('Source exceeds 256 MB. Choose a smaller WAV.');
  const info = wavInfo(bytes);
  if (info.channels > 2) throw new Error('Choose a mono or stereo WAV. Multichannel editing is not supported.');
  if (!info.frames || info.frames / info.rate > 900) throw new Error('Choose nonempty audio up to 15 minutes long.');
  // The decoder holds two float channels, including for mono input.
  if (info.frames * 8 > SOURCE_LIMIT) throw new Error('Decoded audio exceeds 256 MB. Choose a shorter WAV.');
  return decodeWav(bytes);
}
export function validateRegion(start: number, end: number, frames: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > frames || end <= start) throw new Error('Choose a start and end within the audio, with end after start.');
}
export function extractRegion(audio: EditableAudio, start: number, end: number) {
  validateRegion(start, end, audio.left.length);
  if ((end - start) * audio.channels * 4 + 56 > SAMPLE_LIMIT) throw new Error('Selection exceeds 64 MB. Select a shorter region.');
  return encodeWav(audio.left.subarray(start, end), audio.right.subarray(start, end), audio.rate, { format: 'float32', channels: audio.channels as 1 | 2 }).buffer;
}
export function waveformPeaks(audio: EditableAudio, bins = 16384) {
  const count = Math.min(bins, audio.left.length), peaks = new Float32Array(count * 2);
  for (let bin = 0; bin < count; bin++) {
    let min = 0, max = 0;
    const end = Math.floor((bin + 1) * audio.left.length / count);
    for (let i = Math.floor(bin * audio.left.length / count); i < end; i++) {
      min = Math.min(min, audio.left[i], audio.right[i]); max = Math.max(max, audio.left[i], audio.right[i]);
    }
    peaks[bin * 2] = min; peaks[bin * 2 + 1] = max;
  }
  return peaks;
}
