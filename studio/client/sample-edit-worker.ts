import { decodeEditableWav, extractRegion, waveformPeaks, type EditableAudio } from '../shared/sample-edit';

let audio: EditableAudio | undefined;
self.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'open') {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data.bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      audio = decodeEditableWav(new Uint8Array(data.bytes));
      const peaks = waveformPeaks(audio);
      self.postMessage({ id: data.id, result: { rate: audio.rate, channels: audio.channels, frames: audio.left.length, hash, peaks } }, { transfer: [peaks.buffer] });
    } else if (data.kind === 'crop') {
      if (!audio) throw new Error('Open a WAV first.');
      const bytes = extractRegion(audio, data.start, data.end);
      self.postMessage({ id: data.id, result: bytes }, { transfer: [bytes] });
    } else throw new Error('Unknown sample editor operation.');
  } catch (error) { self.postMessage({ id: data.id, error: (error as Error).message }); }
};
