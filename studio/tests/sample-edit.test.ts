import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEditableWav, extractRegion, validateRegion, waveformPeaks } from '../shared/sample-edit';
import { encodeWav, decodeWav, wavInfo } from '../shared/wav';
import { AssetSchema } from '../shared/model';

test('sample extraction preserves exact frame boundaries, rate and channels without mutating its source', () => {
  const left = new Float32Array([0, .125, -.25, .5, 1]), right = new Float32Array([1, -.5, .25, -.125, 0]);
  for (const channels of [1, 2] as const) for (const format of ['pcm16', 'pcm24', 'float32'] as const) {
    const bytes = new Uint8Array(encodeWav(left, right, 48000, { format, channels }).buffer);
    const source = decodeEditableWav(bytes), original = source.left.slice();
    const snippet = extractRegion(source, 1, 4), result = decodeWav(new Uint8Array(snippet));
    assert.equal(result.rate, 48000); assert.equal(result.channels, channels); assert.equal(result.isFloat, true);
    assert.deepEqual(result.left, source.left.slice(1, 4)); assert.deepEqual(result.right, source.right.slice(1, 4));
    assert.deepEqual(source.left, original); assert.equal(wavInfo(new Uint8Array(extractRegion(source, 4, 5))).frames, 1);
    assert.deepEqual(new Uint8Array(extractRegion(source, 1, 4)), new Uint8Array(snippet));
  }
});
test('waveform includes both channels and retains transients', () => {
  const source = decodeEditableWav(new Uint8Array(encodeWav(new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, -.75, 0]), 8000, { format: 'float32' }).buffer));
  assert.deepEqual([...waveformPeaks(source, 2)], [0, 1, -.75, 0]);
});
test('invalid selections, malformed audio, multichannel sources and excessive durations fail before editing', () => {
  for (const [start, end] of [[-1, 1], [1, 1], [2, 1], [0, 11], [NaN, 1], [.1, 1], [0, Infinity]]) assert.throws(() => validateRegion(start, end, 10));
  assert.throws(() => decodeEditableWav(new Uint8Array(60)), /WAV/);
  const bytes = new Uint8Array(encodeWav(new Float32Array(8), new Float32Array(8), 8000).buffer), view = new DataView(bytes.buffer);
  view.setUint16(22, 4, true); view.setUint16(32, 8, true); view.setUint32(28, 64000, true);
  assert.throws(() => decodeEditableWav(bytes), /mono or stereo/);
  const long = new Uint8Array(encodeWav(new Float32Array(8000 * 901), new Float32Array(8000 * 901), 8000, { channels: 1 }).buffer);
  assert.throws(() => decodeEditableWav(long), /15 minutes/);
  const fake = { left: { length: 20_000_000 }, channels: 2 } as any;
  assert.throws(() => extractRegion(fake, 0, 10_000_000), /64 MB/);
});
test('optional extraction provenance validates boundaries and remains backward compatible', () => {
  const old = { id: '00000000-0000-4000-8000-000000000001', createdAt: '', format: 'wav', provider: 'upload' };
  assert.equal(AssetSchema.parse(old).extraction, undefined);
  const extraction = { name: 'Source.wav', hash: 'a'.repeat(64), rate: 44100, startFrame: 20, endFrame: 30 };
  assert.deepEqual(AssetSchema.parse({ ...old, extraction }).extraction, extraction);
  assert.throws(() => AssetSchema.parse({ ...old, extraction: { ...extraction, endFrame: 10 } }));
});
