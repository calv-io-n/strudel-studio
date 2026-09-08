import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, decodeWav } from '../shared/wav';
test('WAV export preserves stereo PCM layout and bounds samples', () => {
  const { buffer, clipped } = encodeWav(new Float32Array([-1, 0, 1, 2]), new Float32Array([1, 0.5, -0.5, NaN]), 44100);
  const bytes = Buffer.from(buffer);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt32LE(24), 44100);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt16LE(34), 16);
  assert.equal(bytes.readUInt32LE(40), 16);
  assert.equal(bytes.readInt16LE(44), -32768);
  assert.equal(bytes.readInt16LE(46), 32767);
  assert.equal(bytes.readInt16LE(58), 0);
  assert.equal(clipped, 1);
});
test('WAV decoding round-trips the encoder and widens mono, 24-bit and float files to stereo', () => {
  const left = new Float32Array([0, 0.5, -0.5, 0.25]), right = new Float32Array([1, -1, 0, 0.125]);
  const decoded = decodeWav(new Uint8Array(encodeWav(left, right, 48000).buffer));
  assert.equal(decoded.rate, 48000); assert.equal(decoded.left.length, 4);
  for (let i = 0; i < 4; i++) { assert.ok(Math.abs(decoded.left[i] - left[i]) < 1e-4); assert.ok(Math.abs(decoded.right[i] - right[i]) < 1e-4); }
  const mono = pcm({ channels: 1, bits: 16, rate: 44100, frames: [[-32768], [32767]] });
  const m = decodeWav(mono); assert.equal(m.rate, 44100); assert.deepEqual([...m.left], [...m.right]); assert.ok(m.left[0] < -0.99 && m.left[1] > 0.99);
  const twentyFour = pcm({ channels: 2, bits: 24, rate: 44100, frames: [[8388607, -8388608]] });
  const t = decodeWav(twentyFour); assert.ok(t.left[0] > 0.99 && t.right[0] < -0.99);
  const float = pcm({ channels: 1, bits: 32, rate: 22050, frames: [[0.5]], float: true });
  assert.ok(Math.abs(decodeWav(float).left[0] - 0.5) < 1e-6);
  const extraChunk = pcm({ channels: 1, bits: 8, rate: 8000, frames: [[255], [0]], list: true });
  const e = decodeWav(extraChunk); assert.ok(e.left[0] > 0.99 && e.left[1] < -0.99);
  assert.throws(() => decodeWav(new Uint8Array(10)), /WAV/);
  assert.throws(() => decodeWav(pcm({ channels: 1, bits: 16, rate: 44100, frames: [[1]], format: 0x55 })), /PCM/);
});
function pcm({ channels, bits, rate, frames, float = false, list = false, format = float ? 3 : 1 }: { channels: number; bits: number; rate: number; frames: number[][]; float?: boolean; list?: boolean; format?: number }) {
  const bytes = bits / 8, dataSize = frames.length * channels * bytes, listSize = list ? 12 : 0;
  const buffer = new ArrayBuffer(44 + listSize + dataSize), view = new DataView(buffer);
  const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, format, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * bytes, true); view.setUint16(32, channels * bytes, true); view.setUint16(34, bits, true);
  let offset = 36;
  if (list) { word(offset, 'LIST'); view.setUint32(offset + 4, 4, true); word(offset + 8, 'INFO'); offset += 12; }
  word(offset, 'data'); view.setUint32(offset + 4, dataSize, true); offset += 8;
  for (const frame of frames) for (const sample of frame) {
    if (float) view.setFloat32(offset, sample, true);
    else if (bits === 8) view.setUint8(offset, sample);
    else if (bits === 16) view.setInt16(offset, sample, true);
    else if (bits === 24) { view.setUint8(offset, sample & 0xff); view.setUint8(offset + 1, (sample >> 8) & 0xff); view.setUint8(offset + 2, (sample >> 16) & 0xff); }
    else view.setInt32(offset, sample, true);
    offset += bytes;
  }
  return new Uint8Array(buffer);
}
