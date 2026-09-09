import { encodeWav } from '../shared/wav';
self.onmessage = ({ data }) => {
  try { const result = encodeWav(data.left, data.right, data.rate, data.options); self.postMessage(result, { transfer: [result.buffer] }); }
  catch (error) { self.postMessage({ error: (error as Error).message }); }
};
