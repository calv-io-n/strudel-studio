import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlace } from '../shared/clips';
import { newProject, ProjectSchema, type Clip } from '../shared/model';

const clip = (id: string, tabId: string, lane: 0 | 1, start: number, length: number): Clip => ({ id, tabId, trackId: `track-${lane + 1}`, muted: false, start, length });
test('legacy projects migrate without losing code, slider identity, controls or bindings', () => {
  const current = newProject();
  const { tabs, activeTabId, clips, bpm, ...legacy } = current;
  const anchors = [{ id: 'stable-slider', from: 7, fingerprint: 'slider()' }];
  const result = ProjectSchema.parse({ ...legacy, version: 1, code: 'slider(.5)', anchors,
    bindings: [{ id: 'binding', profileId: 'virtual', channel: 1, kind: 'cc', number: 20, target: { kind: 'slider', sliderId: 'stable-slider' }, pickup: false, enabled: true }] });
  assert.equal(result.version, 3); assert.equal(result.tabs[0].code, 'slider(.5)');
  assert.deepEqual(result.tabs[0].anchors, anchors); assert.deepEqual(result.controls, current.controls);
  assert.deepEqual(result.bindings[0].target, { kind: 'slider', sliderId: 'stable-slider', tabId: result.tabs[0].id });
});
test('clips permit layering but reject overlap, invalid timing, and dangling references', () => {
  const a = clip('a', 'pattern-1', 0, 0, 4);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 1, 0, 4)), true);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 0, 3, 4)), false);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 0, 4, 4)), true);
  assert.equal(canPlace([], clip('b', 'pattern-1', 0, .3, 4)), false);
  assert.equal(ProjectSchema.safeParse({ ...newProject(), clips: [clip('x', 'missing', 0, 0, 4)] }).success, false);
  assert.equal(ProjectSchema.safeParse({ ...newProject(), clips: [a, clip('b', 'pattern-1', 0, 2, 4)] }).success, false);
});

test('v2 migration preserves sessions, timing and mappings; v3 validates track identity and limits', () => {
  const p = newProject();
  const legacy = { ...p, version: 2, sessionId: 'existing', tabs: [...p.tabs, { ...p.tabs[0], id: 'second' }], clips: [{ id: 'old', tabId: 'pattern-1', lane: 1, start: 3, length: 2 }] };
  const result = ProjectSchema.parse(legacy);
  assert.equal(result.sessionId, 'existing'); assert.deepEqual(result.tabs.map(t => t.color), ['blue', 'cyan']);
  assert.deepEqual(result.clips[0], { id: 'old', tabId: 'pattern-1', trackId: 'track-2', muted: false, start: 3, length: 2 });
  result.clips[0].start = .25; result.clips[0].length = .75; result.clips[0].muted = true; result.snap = .25;
  assert.deepEqual(ProjectSchema.parse(result), result);
  for (const tracks of [[], Array(17).fill(p.tracks[0]), [p.tracks[0], p.tracks[0]]]) assert.equal(ProjectSchema.safeParse({ ...p, tracks }).success, false);
  assert.equal(ProjectSchema.safeParse({ ...result, tracks: [p.tracks[0]] }).success, false);
});
