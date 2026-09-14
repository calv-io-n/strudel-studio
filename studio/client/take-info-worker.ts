import { wavInfo } from '../shared/wav';
self.onmessage = async ({ data: blob }: MessageEvent<Blob>) => {
  try {
    const bytes = await blob.arrayBuffer(), info = wavInfo(new Uint8Array(bytes));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const contentHash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    self.postMessage({ info, contentHash });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
