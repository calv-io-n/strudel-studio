import { wavInfo, decodeWav, encodeWav } from '../shared/wav';
self.onmessage = ({ data }) => {
  try {
    const info = wavInfo(new Uint8Array(data.bytes));
    if (info.frames / info.rate > 900 || info.frames * 8 > 256_000_000) throw new Error('Decoded sample exceeds the duration or memory limit.');
    const decoded = decodeWav(new Uint8Array(data.bytes), data.selection);
    const channels = info.channels === 1 || data.selection && data.selection[0] === data.selection[1] ? 1 : 2;
    const result = encodeWav(decoded.left, decoded.right, info.rate, { format: 'float32', channels });
    self.postMessage({ wav: result.buffer, precision: { rate: info.rate, channels: info.channels, bits: info.bits, working: 'float32', originalAvailable: true } }, { transfer: [result.buffer] });
  } catch (error) { self.postMessage({ error: (error as Error).message }); }
};
