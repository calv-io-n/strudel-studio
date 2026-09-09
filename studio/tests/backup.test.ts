import { defaultInstrument } from '../shared/midi-instrument';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { Store } from '../server/store';
import { backupProject, restoreBackup } from '../server/backup';
import { AssetSchema, newProject, ProjectSchema } from '../shared/model';
import { encodeWav } from '../shared/wav';
import { sampleInsertion } from '../shared/sample-insertion';

test('backup restores referenced audio and creates a collision-safe session', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-backup-'));
  try {
    const source = new Store(path.join(root, 'projects'), path.join(root, 'sounds')); await source.init();
    const target = new Store(path.join(root, 'restored'), path.join(root, 'restored-sounds')); await target.init();
    const asset = AssetSchema.parse({ id: randomUUID(), createdAt: new Date().toISOString(), label: 'Take', format: 'wav', provider: 'recording', duration: .1 });
    const wav = new Uint8Array(encodeWav(new Float32Array(4410), new Float32Array(4410), 44100).buffer); await source.writeAsset(asset, wav);
    const project = newProject(); project.assetIds = [asset.id]; project.midiSound = `studio_${asset.id.replaceAll('-', '')}`; project.tabs[0].code = `s("studio_${asset.id.replaceAll('-', '')}")`;
    project.midiInstrument = defaultInstrument(project.midiSound);
    const bytes = await backupProject(project, source);
    const restored = await restoreBackup(bytes, target); assert.equal(restored.project.version, 5); assert.deepEqual(restored.missing, []); assert.equal(restored.project.midiSound, project.midiSound); assert.deepEqual(restored.project.midiInstrument, project.midiInstrument);
    assert.deepEqual(await readFile(path.join(target.samplesRoot, `${asset.id}.wav`)), Buffer.from(wav));
    const duplicate = await restoreBackup(bytes, target); assert.notEqual(duplicate.project.sessionId, restored.project.sessionId);
    project.assetIds.push(randomUUID()); const missing = unzipSync(await backupProject(project, source));
    assert.equal(JSON.parse(strFromU8(missing['manifest.json'])).missing.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('v3 sessions migrate and sample insertion preserves surrounding code without duplicating effects', () => {
  const project = newProject(); const { assetIds, ...old } = project;
  const next = ProjectSchema.parse({ ...old, version: 3 }); assert.equal(next.version, 5); assert.deepEqual(next.assetIds, []);
  const asset = AssetSchema.parse({ id: randomUUID(), createdAt: '', format: 'wav', provider: 'recording', duration: 2, label: 'Take', recording: { source: 'internal', bpm: 120, offsetCycles: .5, duration: 2, trimStart: 0, trimEnd: 2 } });
  const code = 'note(60).s("triangle").room(.5)\n$: s("bd")'; const change = sampleInsertion(code, 5, asset, 120);
  assert.equal(code.slice(0, change.from), 'note(60).s("triangle").room(.5)');
  assert.equal(change.insert.includes('.room'), false); assert.ok(change.insert.includes('timeCat([0.5, silence]'));
});
