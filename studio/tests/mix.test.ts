import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClipMuted } from '../shared/mix';
import { newProject, ProjectSchema, type Clip } from '../shared/model';

test('exclusive solo restores track mute flags and preserves individual clip mutes', () => {
  const p = newProject(); p.tracks[0].muted = true;
  const a: Clip = { id: 'a', tabId: 'pattern-1', trackId: 'track-1', muted: false, start: 0, length: 4 };
  const b = { ...a, id: 'b', trackId: 'track-2' };
  assert.equal(isClipMuted(a, p.tracks), true);
  assert.equal(isClipMuted(b, p.tracks), false);
  assert.equal(isClipMuted(a, p.tracks, 'track-1'), true);
  assert.equal(isClipMuted(b, p.tracks, 'track-1'), true);
  assert.equal(isClipMuted({ ...a, muted: true }, p.tracks, 'track-1'), true);
  assert.equal(isClipMuted(a, p.tracks, 'track-2'), true);
  assert.equal(isClipMuted(b, p.tracks, 'track-2'), false);
  assert.equal(isClipMuted(a, p.tracks), true);
  assert.deepEqual(p.tracks.map(t => t.muted), [true, false]);
});

test('solo is optional for existing v3 projects and validates persisted track references', () => {
  const p = newProject();
  assert.equal(ProjectSchema.parse(p).soloTrackId, undefined);
  assert.equal(ProjectSchema.parse({ ...p, soloTrackId: 'track-2' }).soloTrackId, 'track-2');
  assert.equal(ProjectSchema.safeParse({ ...p, soloTrackId: 'missing' }).success, false);
});
