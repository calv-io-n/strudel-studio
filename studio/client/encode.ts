import type { WavOptions, encodeWav } from '../shared/wav';
/** Transfers owned channel arrays; caller must not reuse them. */
export function encodeAudio(left: Float32Array<ArrayBuffer>, right: Float32Array<ArrayBuffer>, rate: number, options: WavOptions, signal?: AbortSignal): Promise<ReturnType<typeof encodeWav>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./encode-worker.ts', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(new DOMException('Encoding cancelled', 'AbortError')); };
    if (signal?.aborted) { abort(); return; } signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = event => { clean(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => { clean(); if (data.error) reject(new Error(data.error)); else resolve(data); };
    worker.postMessage({ left, right, rate, options }, [...new Set([left.buffer, right.buffer])]);
  });
}
