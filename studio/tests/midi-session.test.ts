import test from 'node:test';
import assert from 'node:assert/strict';
import { CycleTakes, sectionVariation } from '../shared/midi-session';
import { destinationFor } from '../shared/performance';
import { newProject, ProjectSchema } from '../shared/model';

test('cycle windows retain alternatives and carry held notes without merging passes', () => {
  const capture = new CycleTakes(destinationFor('note(60).s("triangle")', 'pattern-1', 1, 1), 2);
  capture.note('a', 60, 100, 1.5, true);
  capture.note('b', 64, 80, 2.25, true);
  capture.note('a', 60, 0, 2.5, false);
  capture.finish(3);
  assert.equal(capture.completed.length, 2);
  assert.deepEqual(capture.completed[0].notes.map(n => [n.pitch, n.start, n.end]), [[60, 1.5, 2]]);
  assert.deepEqual(capture.completed[1].notes.map(n => [n.pitch, n.start, n.end]), [[60, 0, .5], [64, .25, 1]]);
});
test('empty passes never erase a take and recent nonempty passes remain bounded', () => {
  const capture = new CycleTakes(destinationFor('note(60)', 'a', 1, 1), 1);
  capture.advance(2); assert.equal(capture.completed.length, 0);
  for (let i = 2; i < 34; i++) { capture.note('a', 60, 100, i + .1, true); capture.note('a', 60, 0, i + .2, false); capture.advance(i + 1); }
  assert.equal(capture.completed.length, 32); assert.equal(capture.running, true);
});
test('accepting a subsection creates a variation and preserves phase on both sides', () => {
  const p = newProject(); p.tabs[0].code = 'note("c3 e3").s("triangle")';
  const clip = { id: 'clip', tabId: p.tabs[0].id, trackId: p.tracks[0].id, start: 4, length: 8, muted: false, sourceOffset: 2 };
  p.clips = [clip, { ...clip, id: 'other', start: 20 }];
  let id = 0;
  const next = sectionVariation(p, clip, 6, 8, destinationFor(p.tabs[0].code, clip.tabId, 1, 1), p.tabs[0].code, 'note(72).slow(2)', () => `midi-${++id}`);
  assert.equal(next.tabs[0].code, p.tabs[0].code);
  assert.match(next.tabs[1].code, /late\(4\).*s\("triangle"\)/);
  assert.deepEqual(next.clips.map(c => [c.start, c.length, c.sourceOffset]), [[4, 2, 2], [6, 2, 4], [8, 4, 6], [20, 8, 2]]);
  assert.equal(next.clips[3].tabId, clip.tabId);
  assert.equal(ProjectSchema.parse({ ...p, version: 4 }).version, 6);
});

test('a held note or an empty loop never replaces the last transcription without a new press', () => {
  const capture = new CycleTakes(destinationFor('note(60)', 'a', 1, 1), 1);
  capture.note('a', 60, 100, .1, true); capture.advance(1);
  const original = capture.completed[0]; capture.advance(2); capture.advance(3);
  assert.equal(capture.completed.length, 1); assert.equal(capture.completed[0], original);
  capture.note('a', 60, 0, 3.1, false); capture.advance(4); assert.equal(capture.completed.length, 1);
  capture.note('b', 72, 100, 4.2, true); capture.note('b', 72, 0, 4.4, false); capture.advance(5);
  assert.equal(capture.completed.length, 2); assert.equal(capture.completed[1].notes[0].pitch, 72);
});

test('snapped notes use stable mini notation while timeCat retains performed timing', async () => {
  const { transcribeNotes, transcribe } = await import('../shared/performance');
  const a = [{ key: 'a', pitch: 60, velocity: 100, start: .012, end: .247 }, { key: 'b', pitch: 64, velocity: 100, start: .503, end: .745 }];
  const b = a.map(n => ({ ...n, start: n.start + .002, end: n.end + .002 }));
  assert.equal(transcribeNotes(a, 1, .25), 'note("c4 ~ e4 ~").velocity(0.787)');
  assert.equal(transcribeNotes(a, 1, .25), transcribeNotes(b, 1, .25));
  assert.match(transcribe(a, 1, 0, 1), /timeCat/);
  assert.notEqual(transcribe(a, 1, 0, 1), transcribe(b, 1, 0, 1));
});

test('snapping keeps a note pressed just before the loop boundary', async () => {
  const { transcribeNotes } = await import('../shared/performance');
  assert.equal(transcribeNotes([{ key: 'a', pitch: 60, velocity: 127, start: .99, end: 1 }], 1), 'note("~@15 c4").velocity(1)');
});
