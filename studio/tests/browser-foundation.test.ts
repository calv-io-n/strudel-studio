import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
import { extractArchive } from '../shared/archive';
import { compileAudioEffects } from '../shared/audio-input';
import { newProject, parseProject } from '../shared/model';
import { createProject, saveProject, deleteProject, loadProject } from '../client/storage/workspace';
import { write, read } from '../client/storage/database';

test('stale saves and deletion preserve the newer session', async () => {
  const initial = await createProject(newProject());
  const next = await saveProject(initial.sessionId, { ...initial, name: 'Newer' });
  await assert.rejects(saveProject(initial.sessionId, { ...initial, name: 'Stale' }), /another tab/);
  await assert.rejects(deleteProject(initial.sessionId, initial.revision), /another tab/);
  assert.equal((await loadProject(initial.sessionId)).name, 'Newer');
  await write([{ collection: 'audio', key: 'personal', value: new Blob(['keep']) }]);
  await deleteProject(next.sessionId, next.revision); assert.equal(await read('projects', next.sessionId), undefined); assert.ok(await read('audio', 'personal'));
});

test('archive bounds use actual inflated bytes and reject unsafe and duplicate entries', () => {
  const data = new Uint8Array(100000).fill(1), archive = zipSync({ 'tone.wav': data });
  assert.equal(extractArchive(archive)['tone.wav'].length, data.length);
  assert.throws(() => extractArchive(archive, { bytes: 1000, fileBytes: 200000, files: 4 }), /actual decompressed/);
  assert.throws(() => extractArchive(zipSync({ '../tone.wav': data })), /Unsafe/);
  assert.throws(() => extractArchive(zipSync({ 'C:/tone.wav': data })), /Unsafe/);
  assert.throws(() => extractArchive(archive.subarray(0, 15)), /ZIP/);
});

test('AUDIO accepts continuous controls and rejects computed, patterned, and sample-only modifiers', () => {
  const values = compileAudioEffects('AUDIO.gain(slider(0.5,0,1)).lpf(2000).room(0.2).delay(0.3)');
  assert.equal(values.gain, .5); assert.equal(values.lpf, 2000);
  for (const code of ['AUDIO.reverse()', 'AUDIO.gain("0 1")', 'AUDIO.gain(Math.random())', 'AUDIO["gain"](1)', 'AUDIO.pan(2)', 'const x = AUDIO']) assert.throws(() => compileAudioEffects(code));
  assert.equal(parseProject({ ...newProject(), version: 5 }).version, 6);
});

test('legacy cleanup leaves personal audio, project JSON and provenance intact', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, access } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const { cleanupPlan, applyCleanup } = await import('../../scripts/legacy-cache-cleanup');
  const root = await mkdtemp(path.join(tmpdir(), 'studio-cleanup-')), cache = path.join(root, 'libraries'), projects = path.join(root, 'projects'), personal = path.join(root, 'personal');
  await Promise.all([cache, projects, personal].map(p => mkdir(p)));
  const id = crypto.randomUUID(), imported = crypto.randomUUID();
  const a = { id, createdAt: '', provider: 'github', format: 'wav', contentHash: 'a'.repeat(64), pack: { id: crypto.randomUUID(), name: 'Downloaded' }, source: { name: 'kick.wav', url: 'https://github.com/example/pack', revision: 'b'.repeat(40), originalFormat: 'wav' } };
  await writeFile(path.join(cache, id + '.json'), JSON.stringify(a)); await writeFile(path.join(cache, id + '.wav'), 'cache');
  await writeFile(path.join(cache, imported + '.json'), JSON.stringify({ ...a, id: imported, provider: 'upload' })); await writeFile(path.join(cache, imported + '.wav'), 'personal import');
  const p = { ...newProject(), assetIds: [id] }; await writeFile(path.join(projects, 'session.json'), JSON.stringify(p));
  const plan = await cleanupPlan(cache, projects, personal); assert.equal(plan.candidates.length, 1); assert.deepEqual(plan.candidates[0].projects, ['session.json']);
  await access(path.join(cache, id + '.wav')); await applyCleanup(plan);
  await assert.rejects(access(path.join(cache, id + '.wav'))); await access(path.join(cache, imported + '.wav'));
  assert.equal(JSON.parse(await readFile(path.join(cache, id + '.json'), 'utf8')).source.revision, a.source.revision);
  assert.deepEqual(JSON.parse(await readFile(path.join(projects, 'session.json'), 'utf8')), p);
});
