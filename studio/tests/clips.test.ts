import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicatePlacement } from '../shared/clips';
import type { Clip } from '../shared/model';
const clip = (id: string, start: number, length = 4, lane: 0 | 1 = 0): Clip => ({ id, tabId: 'pattern-1', start, length, trackId: `track-${lane + 1}`, muted: false });
test('clip duplication finds the first fitting gap in its own lane', () => {
  const original = clip('a', 0);
  const clips = [clip('later', 12), clip('blocked', 5, 3), original, clip('other-lane', 8, 20, 1)];
  assert.deepEqual(duplicatePlacement(clips, original, 'copy'), clip('copy', 8));
  assert.deepEqual(clips.map(c => c.id), ['later', 'blocked', 'a', 'other-lane']);
  assert.equal(duplicatePlacement([clip('end', 4096)], clip('end', 4096), 'copy'), undefined);
});

test('snapping chooses valid nearby edges and grid positions without changing length', async () => {
  const { snapPlacement, canPlace } = await import('../shared/clips');
  const moving = clip('moving', 0, 1), neighbor = clip('neighbor', 2.25, 1);
  assert.deepEqual(snapPlacement([neighbor], moving, 1.3, 1).clip, { ...moving, start: 1.25 });
  assert.equal(snapPlacement([], moving, 1.3, .5).clip.start, 1.5);
  assert.equal(snapPlacement([], moving, 1.3, .25).clip.start, 1.25);
  assert.equal(snapPlacement([neighbor], moving, 2.2, .25, true).clip.length, 2.25);
  assert.equal(canPlace([neighbor], { ...moving, start: 2 }), false);
  assert.equal(canPlace([], { ...moving, length: .25 }), true);
  assert.equal(canPlace([], { ...moving, start: -.25 }), false);
  assert.equal(canPlace([], { ...moving, length: .1 }), false);
});
