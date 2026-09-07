import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicatePlacement } from '../shared/clips';
import type { Clip } from '../shared/model';
const clip = (id: string, start: number, length = 4, lane: 0 | 1 = 0): Clip => ({ id, tabId: 'pattern-1', start, length, lane });
test('clip duplication finds the first fitting gap in its own lane', () => {
  const original = clip('a', 0);
  const clips = [clip('later', 12), clip('blocked', 5, 3), original, clip('other-lane', 8, 20, 1)];
  assert.deepEqual(duplicatePlacement(clips, original, 'copy'), clip('copy', 8));
  assert.deepEqual(clips.map(c => c.id), ['later', 'blocked', 'a', 'other-lane']);
  assert.equal(duplicatePlacement([clip('end', 4096)], clip('end', 4096), 'copy'), undefined);
});
