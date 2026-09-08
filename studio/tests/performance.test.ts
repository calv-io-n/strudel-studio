import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationFor, MidiTake } from '../shared/performance';

test('selection resolves only the musical expression and retains its effects', () => {
  const code = '$melody: note("c3 e3").s("triangle").lpf(800)\n$beat: s("bd")';
  const from = code.indexOf('c3');
  const destination = destinationFor(code, 'melody', from, from + 5);
  assert.equal(destination.original, 'note("c3 e3")');
  assert.equal(destination.soundCode, '.s("triangle").lpf(800)');
  assert.equal(code.slice(0, destination.from) + 'note("g3")' + code.slice(destination.to), '$melody: note("g3").s("triangle").lpf(800)\n$beat: s("bd")');
  assert.throws(() => destinationFor(code, 'melody', 0, code.length), /cannot be replaced/);
});

test('takes retain chords and release outstanding notes on interruption', () => {
  const take = new MidiTake(destinationFor('note("c3")', 'a', 0, 10));
  take.start(); take.note('device:1:60', 60, 100, 0, true); take.note('device:1:64', 64, 75, 0, true);
  take.note('device:1:60', 60, 0, .25, false); take.stop(.5);
  assert.deepEqual(take.notes.map(n => n.end), [.25, .5]);
  assert.equal(take.state, 'review'); assert.throws(() => take.start(), /current take/);
});
