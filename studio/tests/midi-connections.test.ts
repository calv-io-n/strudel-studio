import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MidiConnections } from '../server/midi-connections';

test('hardware choices migrate once and explicit disconnect survives restart', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'studio-midi-settings-'));
  try {
    const applied: string[][] = [];
    const settings = new MidiConnections(directory, ports => applied.push(ports));
    await settings.init(['Keyboard', 'Keyboard']);
    assert.deepEqual(settings.ports, ['Keyboard']);
    await settings.update({ port: 'Keyboard', connected: false });
    const restarted = new MidiConnections(directory, ports => applied.push(ports));
    await restarted.init(['Keyboard']);
    assert.deepEqual(restarted.ports, []);
    assert.deepEqual(applied.at(-1), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('concurrent device changes merge and invalid inputs cannot change saved choices', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'studio-midi-settings-'));
  try {
    const settings = new MidiConnections(directory, () => {});
    await settings.init([]);
    await Promise.all([settings.update({ port: 'Keys', connected: true }), settings.update({ port: 'Pads', connected: true })]);
    assert.deepEqual(settings.ports, ['Keys', 'Pads']);
    assert.throws(() => settings.update({ port: 'studio:virtual', connected: true }));
    assert.throws(() => settings.update({ port: '', connected: true }));
    const restarted = new MidiConnections(directory, () => {});
    await restarted.init([]);
    assert.deepEqual(restarted.ports, ['Keys', 'Pads']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
