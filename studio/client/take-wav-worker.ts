import { readPending } from './recovery';
import { encodeWav } from '../shared/wav';
self.onmessage = async ({ data }) => {
  try {
    const parts: BlobPart[] = []; let cursor = 0;
    const unsaved = new Map<string, { left: Float32Array; right: Float32Array }>(data.unsaved);
    for (const entry of data.chunks) {
      const a = Math.max(0, data.from - cursor), b = Math.min(entry.frames, data.to - cursor);
      if (b > a) {
        let chunk = unsaved.get(entry.key);
        if (!chunk) {
          const blob = await readPending<Blob>(entry.key); if (!(blob instanceof Blob)) throw new Error('Capture chunk is missing.');
          const bytes = await blob.arrayBuffer(); chunk = { left: new Float32Array(bytes, 0, entry.frames), right: new Float32Array(bytes, entry.frames * 4, entry.frames) };
        }
        const encoded = encodeWav(chunk.left.subarray(a, b), chunk.right.subarray(a, b), data.rate, { format: 'float32' });
        parts.push(new Blob([encoded.buffer.slice(56)]));
      }
      cursor += entry.frames;
    }
    const frames = data.to - data.from;
    const header = encodeWav(new Float32Array(1), new Float32Array(1), data.rate, { format: 'float32' }).buffer.slice(0, 56);
    const view = new DataView(header); view.setUint32(4, frames * 8 + 48, true); view.setUint32(44, frames, true); view.setUint32(52, frames * 8, true);
    self.postMessage({ blob: new Blob([header, ...parts], { type: 'audio/wav' }) });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
