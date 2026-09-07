import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChangeSet } from '@codemirror/state';
import { parseMidi, Pickup, scaleCC } from '../shared/midi';
import { SlotTimeline } from '../shared/slots';
import { reconcileSliders, scanSliders } from '../shared/sliders';
import { GenerationSchema, ProjectSchema, newProject, type Binding } from '../shared/model';

test('MIDI parsing rejects malformed data and respects channels and note-off conventions', () => {
  assert.deepEqual(parseMidi([0x9f, 60, 100]), { kind: 'note', channel: 16, number: 60, value: 100, on: true });
  assert.equal(parseMidi([0x90, 60, 0])?.on, false);
  assert.equal(parseMidi([0x80, 60, 64])?.on, false);
  assert.equal(parseMidi([0xb1, 20, 90])?.channel, 2);
  for (const bytes of [[], [0xf8], [0xb0, 20, 128], [0xb0, -1, 4], [0xb0, 1.1, 2], [0xc0, 1, 2]]) assert.equal(parseMidi(bytes), null);
});
test('CC scaling honors endpoints, ranges and step', () => {
  assert.equal(scaleCC(0, 100, 6000, 10), 100);
  assert.equal(scaleCC(127, 100, 6000, 10), 6000);
  assert.equal(scaleCC(64, 0, 1, 0.01), 0.5);
  assert.equal(scaleCC(0, -1, 1, .1), -1);
  assert.equal(scaleCC(127, 0, 10, 3), 9);
});
test('pickup catches crossings, rearms after external changes, and isolates bindings', () => {
  const pickup = new Pickup();
  const binding: Binding = { id: 'a', profileId: 'physical', channel: 1, kind: 'cc', number: 20, target: { kind: 'slider', sliderId: 's' }, pickup: true, enabled: true };
  assert.equal(pickup.accept(binding, .1, .5), false);
  assert.equal(pickup.accept(binding, .7, .5), true);
  assert.equal(pickup.accept(binding, .8, .7), true);
  assert.equal(pickup.accept({ ...binding, id: 'b' }, .8, .2), false);
  assert.equal(pickup.accept(binding, .75, .2), false);
  pickup.reset(); assert.equal(pickup.accept(binding, .8, .5), false);
});
test('sliders ignore comments, strings, member calls, and non-literal expressions', () => {
  const source = `// slider(9)\nconst x = 'slider(1)'; foo.slider(1); slider(-1,-2,2,.1); slider(sine);`;
  const sliders = scanSliders(source);
  assert.equal(sliders.length, 1); assert.equal(sliders[0].value, -1);
});
test('slider identity survives insertions and changing number length, and restores from anchors', () => {
  let code = 's("sine").gain(slider(0.5)).lpf(slider(100, 0, 2000))';
  let sliders = reconcileSliders(code, []);
  const [first, second] = sliders.map((s) => s.id);
  const change = ChangeSet.of({ from: 0, insert: '// heading\n' }, code.length);
  code = '// heading\n' + code; sliders = reconcileSliders(code, sliders, change);
  assert.deepEqual(sliders.map((s) => s.id), [first, second]);
  const numeric = ChangeSet.of({ from: sliders[0].from, to: sliders[0].to, insert: '0.12345' }, code.length);
  code = code.slice(0, sliders[0].from) + '0.12345' + code.slice(sliders[0].to);
  sliders = reconcileSliders(code, sliders, numeric);
  assert.deepEqual(sliders.map((s) => s.id), [first, second]);
  const anchors = sliders.map(({ id, from, fingerprint }) => ({ id, from, fingerprint }));
  assert.deepEqual(reconcileSliders(code, [], undefined, anchors).map((s) => s.id), [first, second]);
  assert.notEqual(reconcileSliders(code, [], undefined, [...anchors, anchors[0]])[0].id, first);
});
test('deleting a slider never transfers its identity to the remaining slider', () => {
  const code = 'slider(0.5); slider(0.5)'; const old = reconcileSliders(code, []);
  const change = ChangeSet.of({ from: 0, to: 13 }, code.length);
  const next = reconcileSliders(code.slice(13), old, change);
  assert.equal(next.length, 1); assert.equal(next[0].id, old[1].id);
});
test('sound selection switches by query cycle even across scheduler lookahead', () => {
  const timeline = new SlotTimeline(); timeline.reset([{ name: 'bass', active: 'old' }]);
  assert.equal(timeline.select('bass', 'new', true, 2.9), 3);
  assert.equal(timeline.at('bass', 2.9999), 'old'); assert.equal(timeline.at('bass', 3), 'new');
  assert.deepEqual(timeline.settle(2.99), []);
  assert.deepEqual(timeline.settle(3), [{ name: 'bass', asset: 'new' }]);
  timeline.select('bass', 'next', true, 3.2); timeline.select('bass', 'last', true, 3.4);
  assert.equal(timeline.at('bass', 4), 'last');
  timeline.settle(0, true); assert.equal(timeline.at('bass', 0), 'last');
  timeline.select('bass', 'stopped', false, 0); assert.equal(timeline.at('bass', 0), 'stopped');
});
test('project and generation validation reject invalid persisted or billable inputs', () => {
  assert.ok(ProjectSchema.safeParse(newProject()).success);
  assert.equal(ProjectSchema.safeParse({ ...newProject(), version: 4 }).success, false);
  assert.equal(GenerationSchema.safeParse({ prompt: ' ', duration: 1, loop: false }).success, false);
  assert.equal(GenerationSchema.safeParse({ prompt: 'sound', duration: 31, loop: false }).success, false);
});
