import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Store } from '../server/store';
import { Generator } from '../server/generation';
import { newProject } from '../shared/model';

async function store() { const root = await mkdtemp(path.join(os.tmpdir(), 'strudel-test-')); const store = new Store(path.join(root, 'projects'), path.join(root, 'samples')); await store.init(); return store; }
async function finished(generator: Generator, id: string) {
  for (let i = 0; i < 100 && generator.jobs.get(id)?.state === 'running'; i++) await new Promise((r) => setTimeout(r, 10));
  return generator.jobs.get(id)!;
}
test('projects round-trip code and controls atomically; traversal is refused', async () => {
  const db = await store(); const project = newProject(); await db.save('test', project);
  assert.deepEqual(await db.load('test'), project); assert.deepEqual(await db.projects(), ['test']);
  await assert.rejects(() => db.save('../outside', project)); await assert.rejects(() => db.save('test', { version: 2 }));
  assert.deepEqual(await db.load('test'), project);
});
test('fixture generation produces persistent playable WAV, and serializes requests', async () => {
  const db = await store(), generator = new Generator(db, undefined, true);
  const job = generator.start({ prompt: 'test bass', duration: 1, loop: false });
  assert.throws(() => generator.start({ prompt: 'duplicate', duration: 1, loop: false }), /already running/);
  const result = await finished(generator, job.id); assert.equal(result.state, 'complete');
  const list = await db.assets(); assert.equal(list.length, 1); assert.equal(list[0].provider, 'fixture');
  const audio = await readFile(path.join(db.samplesRoot, `${list[0].id}.wav`)); assert.equal(audio.subarray(0, 4).toString(), 'RIFF');
  const renamed = await db.labelAsset(list[0].id, 'Metal impact');
  assert.equal(renamed.label, 'Metal impact');
  assert.equal(renamed.prompt, list[0].prompt);
  assert.equal((await db.asset(renamed.id)).label, 'Metal impact');
  assert.deepEqual(await readFile(path.join(db.samplesRoot, `${list[0].id}.wav`)), audio);
  await assert.rejects(() => db.labelAsset(renamed.id, ''));
  assert.equal((await db.asset(renamed.id)).label, 'Metal impact');
});
test('real provider request uses server-side key and API fields; errors do not retry', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++; assert.match(String(url), /v1\/sound-generation/);
    assert.equal((init?.headers as Record<string, string>)['xi-api-key'], 'secret');
    assert.deepEqual(JSON.parse(String(init?.body)), { text: 'rain', duration_seconds: 2, loop: true, model_id: 'eleven_text_to_sound_v2' });
    return new Response('private upstream detail', { status: 429 });
  };
  const generator = new Generator(await store(), 'secret', false, fetcher);
  const result = await finished(generator, generator.start({ prompt: 'rain', duration: 2, loop: true }).id);
  assert.equal(result.state, 'failed'); assert.match(result.error!, /429/); assert.doesNotMatch(result.error!, /private upstream/); assert.equal(requests, 1);
});

test('session creation is collision-safe and survives a fresh store instance', async () => {
  const db = await store();
  const sessions = await Promise.all([db.create({ ...newProject(), name: 'My jam' }), db.create({ ...newProject(), name: 'My jam' })]);
  assert.deepEqual(sessions.map(p => p.sessionId).sort(), ['My-jam', 'My-jam-2']);
  const reopened = new Store(db.root, db.samplesRoot);
  for (const session of sessions) assert.deepEqual(await reopened.load(session.sessionId!), session);
  assert.notEqual((await db.create({ ...newProject(), name: 'recovery' })).sessionId, 'recovery');
});

test('sample descriptions and tags persist without changing audio identity', async () => {
  const db = await store(), generator = new Generator(db, undefined, true);
  const job = await finished(generator, generator.start({ prompt: 'Metadata fixture', duration: .5, loop: false }).id);
  const asset = job.asset!;
  const updated = await db.updateAsset(asset.id, { description: 'Soft wooden percussion', tags: ['wood', 'soft'] });
  assert.equal(updated.id, asset.id); assert.equal(updated.prompt, asset.prompt);
  assert.deepEqual((await db.asset(asset.id)).tags, ['wood', 'soft']);
  assert.equal((await db.asset(asset.id)).description, 'Soft wooden percussion');
  await assert.rejects(() => db.updateAsset(asset.id, { tags: ['x'.repeat(51)] }));
});
