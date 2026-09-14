import { transcribe } from '../shared/performance';
self.onmessage = ({ data }) => {
  try { self.postMessage({ code: transcribe(data.notes, data.length, data.grid, data.now, data.normalizeVelocity) }); }
  catch (error) { self.postMessage({ error: (error as Error).message }); }
};
