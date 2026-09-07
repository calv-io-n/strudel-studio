import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../shared/wav';
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
