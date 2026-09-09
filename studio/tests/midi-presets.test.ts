import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MidiPresets } from '../server/midi-presets';

test('MIDI presets persist across restarts, serialize saves, and reject invalid chains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midi-presets-'));
  try {
    const store = new MidiPresets(root);
    const code = 'MIDI.s("sine").lpf(slider(1000,100,8000))';
    const preset = await store.save({ name: 'Soft keys', code });
    assert.deepEqual(await new MidiPresets(root).list(), [preset]);
    const results = await Promise.allSettled([store.save({ name: 'Bass', code }), store.save({ name: 'Bass', code })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(store.save({ name: 'Invalid', code: 'note(60).s("sine")' }));
    await assert.rejects(store.save({ name: '', code }));
    assert.equal((await store.list()).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
