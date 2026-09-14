import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiJournal } from '../client/midi-journal';
import { MidiTake } from '../shared/performance';

test('incremental journal updates held notes and restores ordered completed notes', async () => {
 const journal = new MidiJournal(); journal.reset('journal-test');
 const take = new MidiTake({ tabId: 'a', from: 0, to: 0, original: '', soundCode: '.s("sine")', valid: true, append: true }); take.start();
 take.note('a:1:60', 60, 100, 0, true);
 const first = journal.checkpoint(take, { length: 1 });
 take.note('a:1:60', 60, 0, .25, false); take.note('b:1:60', 60, 80, .1, true);
 await first; take.stop(.5); await journal.flush(take, { length: .5 });
 const restored = await new MidiJournal().restore('journal-test');
 assert.deepEqual(restored?.notes.map(n => [n.key, n.start, n.end]), [['a:1:60', 0, .25], ['b:1:60', .1, .5]]);
 await journal.clear(); assert.equal(await new MidiJournal().restore('journal-test'), undefined);
});

test('clearing the previous take cannot erase a new take in the same session', async () => {
  const journal = new MidiJournal(); journal.reset('repeat-test');
  const makeTake = (pitch: number) => {
    const take = new MidiTake({ tabId: 'a', from: 0, to: 0, original: '', soundCode: '.s("sine")', valid: true, append: true });
    take.start(); take.note('key', pitch, 100, 0, true); take.stop(.5); return take;
  };
  const first = journal.checkpoint(makeTake(60), { length: .5 });
  const cleared = journal.clear();
  journal.reset('repeat-test');
  await journal.flush(makeTake(72), { length: .5 });
  await Promise.all([first, cleared]);
  const restored = await new MidiJournal().restore('repeat-test');
  assert.deepEqual(restored?.notes.map(n => n.pitch), [72]);
  await journal.clear();
});
