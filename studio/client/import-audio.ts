import { encodeAudio } from './encode';
import type { Asset } from '../shared/model';
export async function prepareAudio(original: ArrayBuffer, format: string, context: AudioContext, selection?: [number, number]) {
  let left: Float32Array<ArrayBuffer>, right: Float32Array<ArrayBuffer>, rate: number, channels: number, bits: number | undefined;
  if (format === 'wav') {
    return new Promise<{ wav: ArrayBuffer; precision: Asset['precision'] }>((resolve, reject) => {
      const worker = new Worker(new URL('./prepare-audio-worker.ts', import.meta.url), { type: 'module' });
      worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => { worker.terminate(); if (data.error) reject(new Error(data.error)); else resolve(data); };
      const bytes = original.slice(0); worker.postMessage({ bytes, selection }, [bytes]);
    });
  } else {
    const decoded = await context.decodeAudioData(original.slice(0));
    if (decoded.duration <= 0 || decoded.duration > 900 || decoded.length * decoded.numberOfChannels * 4 > 256_000_000) throw new Error('Decoded sample exceeds the duration or memory limit.');
    if (decoded.numberOfChannels > 2 && !selection) throw new Error('Choose one or two source channels for multichannel audio.');
    if (selection?.some(c => c >= decoded.numberOfChannels)) throw new Error('Selected channel is unavailable.');
    left = decoded.getChannelData(selection?.[0] ?? 0).slice(); right = decoded.getChannelData(selection?.[1] ?? Math.min(1, decoded.numberOfChannels - 1)).slice();
    rate = decoded.sampleRate; channels = decoded.numberOfChannels;
  }
  const workingChannels = selection?.[0] === selection?.[1] && selection || channels === 1 ? 1 : 2;
  const wav = (await encodeAudio(left, right, rate, { format: 'float32', channels: workingChannels })).buffer;
  const precision: Asset['precision'] = { rate, channels, bits, working: 'float32', originalAvailable: true };
  return { wav, precision };
}
