import type { Asset } from '../shared/model';
import { clipAnchors, isStretched, renderKey, type ClipAnchor } from '../shared/clip-timing';
const caches = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const pending = new Map<string, { promise: Promise<ArrayBuffer>; worker: Worker; waiters: number }>();
/** Run one job on the clip render worker; the caller's signal releases its interest and the worker stops when nobody waits. */
export function audioJob<T>(message: object, bytes: ArrayBuffer, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./clip-render-worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort);
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data); };
    worker.onerror = () => { finish(); reject(new Error('Audio preparation failed.')); };
    worker.postMessage({ ...message, bytes }, [bytes]);
  });
}
function renderShared(key: string, bytes: ArrayBuffer, anchors: ClipAnchor[], bpm: number, signal?: AbortSignal) {
  let job = pending.get(key);
  if (!job) {
    const worker = new Worker(new URL('./clip-render-worker.ts', import.meta.url), { type: 'module' });
    const promise = new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = ({ data }) => { pending.delete(key); worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.bytes); };
      worker.onerror = () => { pending.delete(key); worker.terminate(); reject(new Error('Audio preparation failed.')); };
      worker.postMessage({ kind: 'render', anchors, bpm, bytes }, [bytes]);
    });
    job = { promise, worker, waiters: 0 }; pending.set(key, job);
  }
  const current = job; current.waiters++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const release = () => { current.waiters--; signal?.removeEventListener('abort', abort); if (!current.waiters && pending.get(key) === current) { pending.delete(key); current.worker.terminate(); } };
    const abort = () => { release(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort);
    current.promise.then(bytes => { signal?.removeEventListener('abort', abort); current.waiters--; resolve(bytes); }, error => { signal?.removeEventListener('abort', abort); current.waiters--; reject(error); });
  });
}
/** Bounded decoded cache keyed by sample, tempo and anchors; stretching runs in a worker and is shared between waiters. */
export async function takeBuffer(context: BaseAudioContext, asset: Asset, blob: Blob, anchors: ClipAnchor[] = clipAnchors({}), bpm = 120, signal?: AbortSignal) {
  let cache = caches.get(context); if (!cache) { cache = new Map(); caches.set(context, cache); }
  const variant = renderKey(anchors, bpm), key = `${asset.id}:${asset.contentHash ?? asset.createdAt}:${variant}`;
  const cached = cache.get(key); if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  let bytes = await blob.arrayBuffer();
  if (isStretched(anchors, bpm)) {
    if (asset.format !== 'wav') throw new Error('Save this sample as WAV in the editor before aligning it.');
    bytes = await renderShared(key, bytes, anchors, bpm, signal);
  }
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const buffer = await context.decodeAudioData(bytes.slice(0)); cache.set(key, buffer);
  let size = [...cache.values()].reduce((sum, b) => sum + b.length * b.numberOfChannels * 4, 0);
  while (size > 64_000_000 && cache.size > 1) { const oldest = cache.keys().next().value!, value = cache.get(oldest)!; cache.delete(oldest); size -= value.length * value.numberOfChannels * 4; }
  return buffer;
}
