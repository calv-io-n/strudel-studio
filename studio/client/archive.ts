import { extractArchive, importLimits, type ArchiveLimits } from '../shared/archive';
export async function unpack(blob: Blob, limits: ArchiveLimits = importLimits, signal?: AbortSignal) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
  if (typeof Worker === 'undefined') return extractArchive(bytes, limits);
  return new Promise<Record<string, Uint8Array<ArrayBuffer>>>((resolve, reject) => {
    const worker = new Worker(new URL('./archive-worker.ts', import.meta.url), { type: 'module' });
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(new DOMException('Import cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = event => { clean(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => { clean(); if (data.error) reject(new Error(data.error)); else resolve(data.files); };
    worker.postMessage({ bytes, limits }, [bytes.buffer]);
  });
}
