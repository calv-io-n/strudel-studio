import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPlace } from '../shared/clips';
import { newProject, ProjectSchema, type Clip } from '../shared/model';

const clip = (id: string, tabId: string, lane: 0 | 1, start: number, length: number): Clip => ({ id, tabId, lane, start, length });
test('legacy projects migrate without losing code, slider identity, controls or bindings', () => {
  const current = newProject();
  const { tabs, activeTabId, clips, bpm, ...legacy } = current;
  const anchors = [{ id: 'stable-slider', from: 7, fingerprint: 'slider()' }];
  const result = ProjectSchema.parse({ ...legacy, version: 1, code: 'slider(.5)', anchors,
    bindings: [{ id: 'binding', profileId: 'virtual', channel: 1, kind: 'cc', number: 20, target: { kind: 'slider', sliderId: 'stable-slider' }, pickup: false, enabled: true }] });
  assert.equal(result.version, 2); assert.equal(result.tabs[0].code, 'slider(.5)');
  assert.deepEqual(result.tabs[0].anchors, anchors); assert.deepEqual(result.controls, current.controls);
  assert.deepEqual(result.bindings[0].target, { kind: 'slider', sliderId: 'stable-slider', tabId: result.tabs[0].id });
});
test('clips permit layering but reject overlap, invalid timing, and dangling references', () => {
  const a = clip('a', 'pattern-1', 0, 0, 4);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 1, 0, 4)), true);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 0, 3, 4)), false);
  assert.equal(canPlace([a], clip('b', 'pattern-1', 0, 4, 4)), true);
  assert.equal(canPlace([], clip('b', 'pattern-1', 0, .5, 4)), false);
  assert.equal(ProjectSchema.safeParse({ ...newProject(), clips: [clip('x', 'missing', 0, 0, 4)] }).success, false);
  assert.equal(ProjectSchema.safeParse({ ...newProject(), clips: [a, clip('b', 'pattern-1', 0, 2, 4)] }).success, false);
});
