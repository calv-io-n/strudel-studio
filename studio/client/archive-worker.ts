import { extractArchive } from '../shared/archive';
self.onmessage = ({ data }) => {
  try { const files = extractArchive(data.bytes, data.limits); self.postMessage({ files }, { transfer: Object.values(files).map(bytes => bytes.buffer) }); }
  catch (error) { self.postMessage({ error: (error as Error).message }); }
};
