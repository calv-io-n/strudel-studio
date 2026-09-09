import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultInstrument } from '../shared/midi-instrument';
import { newProject } from '../shared/model';
import { createProject, loadProject } from '../client/storage/workspace';
import { saveSession, sameSession } from '../client/storage/session-save';
import { decodeDraft } from '../client/session-draft';
import { write, read } from '../client/storage/database';

test('unchanged saves and stale unchanged tabs do not advance revisions', async () => {
  const base = await createProject(newProject());
  const noop = await saveSession(base, base); assert.equal(noop.kind, 'unchanged'); assert.equal(noop.project.revision, base.revision);
  const edited = await saveSession({ ...base, name: 'Remote edit' }, base); assert.equal(edited.kind, 'saved');
  const refreshed = await saveSession(base, base); assert.equal(refreshed.kind, 'refreshed'); assert.equal(refreshed.project.name, 'Remote edit');
  const again = await saveSession(refreshed.project, refreshed.project); assert.equal(again.project.revision, edited.project.revision);
});
test('revision-only drift permits real local edits; divergent content keeps both sessions', async () => {
  const base = await createProject(newProject());
  await write([{ collection: 'projects', key: base.sessionId!, value: { ...base, revision: 20 } }]);
  const first = await saveSession({ ...base, name: 'First edit' }, base); assert.equal(first.kind, 'saved'); assert.equal(first.project.revision, 21);
  const conflict = await saveSession({ ...base, name: 'Second edit' }, base); assert.equal(conflict.kind, 'copied');
  assert.notEqual(conflict.project.sessionId, base.sessionId); assert.match(conflict.project.name, /conflict copy/);
  assert.equal((await loadProject(base.sessionId!)).name, 'First edit');
  assert.equal((await saveSession(conflict.project, conflict.project)).kind, 'unchanged');
});
test('legacy drafts cannot overwrite a newer version; base-aware unchanged recovery refreshes', async () => {
  const base = await createProject(newProject());
  const saved = await saveSession({ ...base, name: 'Newer saved' }, base);
  const old = decodeDraft(JSON.stringify(base)); const result = await saveSession(old.project, old.base); assert.equal(result.kind, 'copied');
  assert.equal((await saveSession(old.project, old.base)).project.sessionId, result.project.sessionId);
  const draft = decodeDraft(JSON.stringify({ version: 1, project: base, base }));
  const recovered = await saveSession(draft.project, draft.base); assert.equal(recovered.kind, 'refreshed'); assert.ok(sameSession(recovered.project, saved.project));
});
test('project and recovery publication roll back together on a storage error', async () => {
  const base = await createProject(newProject()), put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'settings') throw new DOMException('Full', 'QuotaExceededError'); return put.call(this, value, key); };
  try { await assert.rejects(saveSession({ ...base, name: 'Unsaved' }, base)); } finally { IDBObjectStore.prototype.put = put; }
  assert.ok(sameSession((await read('projects', base.sessionId!))!, base));
  assert.equal((await saveSession({ ...base, name: 'Unsaved' }, base)).kind, 'saved');
});

test('legacy starter records without revisions accept their first edited save', async () => {
  const base = { ...newProject(), sessionId: 'Legacy-starter' };
  await write([{ collection: 'projects', key: base.sessionId, value: base }]);
  const result = await saveSession({ ...base, name: 'Edited legacy starter' }, base);
  assert.equal(result.kind, 'saved'); assert.equal(result.project.revision, 1);
  assert.equal((await loadProject(base.sessionId)).name, 'Edited legacy starter');
});

test('materialized editor defaults are not mistaken for unsaved edits', () => {
  const p = newProject();
  assert.ok(sameSession(p, { ...p, midiInstrument: defaultInstrument(), appliedPatterns: {}, appliedPatternAnchors: {} }));
});
