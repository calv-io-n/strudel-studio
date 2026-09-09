import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../shared/model';
import { encodeWav } from '../shared/wav';
import { placeRecordedTake, checkTakeCapacity, type TakeIdentity } from '../shared/recorded-take';
import { commitRecordedTake, takeAsset } from '../client/storage/recorded-take';
import { createProject, loadProject, saveProject } from '../client/storage/workspace';
import { read, write } from '../client/storage/database';
import { assetReferences } from '../shared/asset-references';
const identity = (): TakeIdentity => ({ assetId: crypto.randomUUID(), dryAssetId: crypto.randomUUID(), tabId: crypto.randomUUID(), trackId: 'track-2', clipId: crypto.randomUUID(), name: 'Audio take 1' });
async function recorded(id: TakeIdentity) {
  const data = new Float32Array(4800).fill(.125), blob = new Blob([encodeWav(data, data, 48000, { format: 'float32' }).buffer]);
  const asset = await takeAsset(id.assetId, id.name, { source: 'external', bpm: 120, offsetCycles: 2.13, latencySeconds: .02, duration: .1, trimStart: 0, trimEnd: .1, incomplete: false, mode: 'wet' }, blob);
  return { asset, blob };
}
test('a recorded take creates a tab on the selected track, preserves timing and references after clip deletion', async () => {
  const id = identity(), { asset } = await recorded(id), next = placeRecordedTake(newProject(), asset, id);
  assert.equal(next.tracks.length, 2); assert.equal(next.clips[0].trackId, 'track-2'); assert.equal(next.tabs.at(-1)?.audioAssetId, asset.id);
  const clip = next.clips[0]; assert.ok(Math.abs(clip.start + clip.takeLeadSeconds! * .5 - 2.12) < 1e-10);
  next.clips = []; next.assetIds = []; next.tabs.at(-1)!.code = 'silence'; assert.ok(assetReferences(next).includes(asset.id));
  assert.equal(placeRecordedTake(next, asset, id), next);
  assert.throws(() => checkTakeCapacity({ ...newProject(), tabs: Array.from({ length: 50 }, (_, i) => ({ ...newProject().tabs[0], id: `tab-${i}` })) }), /50-tab/);
});
test('recording commits audio and placement together, retries once, and preserves a conflicting recording as a copy', async () => {
  const project = await createProject(newProject()), id = identity(), audio = await recorded(id);
  await write([{ collection: 'pending', key: 'record-meta', value: id }]);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'projects') throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key); };
  try { await assert.rejects(commitRecordedTake(project, id, [audio], 'record-meta')); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal(await read('audio', id.assetId), undefined); assert.equal((await loadProject(project.sessionId!)).tabs.length, 1); assert.ok(await read('pending', 'record-meta'));
  const { project: next } = await commitRecordedTake(project, id, [audio], 'record-meta');
  assert.equal(next.tabs.length, 2); assert.ok(await read('audio', id.assetId)); assert.equal(await read('pending', 'record-meta'), undefined);
  assert.equal((await commitRecordedTake(project, id, [audio], 'record-meta')).project.tabs.length, 2);
  await saveProject(next.sessionId!, { ...next, name: 'Newer edit' });
  const other = { ...identity(), trackId: 'track-1' }; const copied = await commitRecordedTake(next, other, [await recorded(other)], 'other-meta');
  assert.equal(copied.kind, 'copied'); assert.ok(await read('audio', other.assetId));
  assert.equal((await loadProject(next.sessionId!)).name, 'Newer edit');
  assert.equal((await commitRecordedTake(next, other, [await recorded(other)], 'other-meta')).project.sessionId, copied.project.sessionId);
});
