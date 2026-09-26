import { decodeEditableWav, waveformPeaks } from '../shared/sample-edit';
import { suggestAttacks, renderAnchoredAudio } from '../shared/anchor-render';
/** analyze: peaks (and optional attacks) for a region; render: timeline-linear audio for anchors at a tempo. */
self.onmessage = async ({ data }) => {
  try {
    const audio = decodeEditableWav(new Uint8Array(data.bytes));
    if (data.kind === 'analyze') {
      const start = data.start ?? 0, end = data.end ?? audio.left.length;
      const peaks = waveformPeaks({ ...audio, left: audio.left.subarray(start, end), right: audio.right.subarray(start, end) }, data.bins ?? 4096);
      const attacks = data.attacks ? suggestAttacks(audio, start, end).map(frame => frame / audio.rate) : [];
      self.postMessage({ rate: audio.rate, channels: audio.channels, duration: audio.left.length / audio.rate, peaks, attacks }, { transfer: [peaks.buffer] });
    } else if (data.kind === 'render') {
      const bytes = await renderAnchoredAudio(audio, data.anchors, data.bpm);
      self.postMessage({ bytes }, { transfer: [bytes] });
    } else throw new Error('Unknown audio job.');
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
