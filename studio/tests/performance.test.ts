import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationFor, MidiTake, PendingMidiSchema } from '../shared/performance';

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

test('recovery tolerates sub-sample rounding at zero while rejecting invalid negative offsets', () => {
  const target = { context: 'tab', tabId: 'a', position: 0, offset: -Number.EPSILON };
  assert.equal(PendingMidiSchema.shape.sharedTarget.parse(target)?.offset, 0);
  assert.equal(PendingMidiSchema.shape.sharedTarget.safeParse({ ...target, offset: -.01 }).success, false);
});

test('a cursor inside a note resolves its phrase without selecting text', () => {
  const code = 'note("c3 e3").s("triangle")';
  assert.equal(destinationFor(code, 'a', 2, 2).original, 'note("c3 e3")');
  assert.equal(destinationFor(code, 'a', 7, 7).soundCode, '.s("triangle")');
  assert.throws(() => destinationFor(code, 'a', code.length, code.length), /cannot be replaced/);
});

test('quantization preserves overlaps and clips notes to the phrase boundary', async () => {
  const { phraseNotes, transcribe } = await import('../shared/performance');
  const notes = [{ key: 'a', pitch: 60, velocity: 127, start: .24, end: .76 }, { key: 'b', pitch: 64, velocity: 64, start: .26, end: .49 }];
  assert.deepEqual(phraseNotes(notes, 2, .25, 1).map(n => [n.start, n.end]), [[.25, .75], [.25, .5]]);
  assert.equal(transcribe([], 4, .0625, 0), '');
});

test('velocity normalization affects preview and transcription without changing captured dynamics', async () => {
  const { phraseNotes, transcribe } = await import('../shared/performance');
  const notes = [20, 120].map((velocity, i) => ({ key: String(i), pitch: 60 + i, velocity, start: i / 4, end: (i + 1) / 4 }));
  assert.deepEqual(phraseNotes(notes, 1, 1 / 16, 1, true).map(n => n.velocity), [100, 100]);
  assert.equal([...transcribe(notes, 1, 1 / 16, 1, true).matchAll(/velocity\(([^)]+)\)/g)].every(m => Number(m[1]) === .787402), true);
  assert.deepEqual(phraseNotes(notes, 1, 1 / 16, 1).map(n => n.velocity), [20, 120]);
  assert.deepEqual(notes.map(n => n.velocity), [20, 120]);
  assert.equal(PendingMidiSchema.shape.normalizeVelocity.parse(undefined), false);
});

test('MIDI grids snap both edges, retain short notes, and Off preserves timing', async () => {
  const { phraseNotes } = await import('../shared/performance');
  const note = { key: 'a', pitch: 60, velocity: 95, start: .14, end: .29 };
  for (const grid of [1 / 4, 1 / 8, 1 / 16, 1 / 32]) {
    const [snapped] = phraseNotes([note], 1, grid, 1);
    assert.equal(snapped.start, Math.round(note.start / grid) * grid);
    assert.equal(snapped.end, Math.max(snapped.start + grid, Math.round(note.end / grid) * grid));
    assert.equal(snapped.velocity, note.velocity);
  }
  assert.deepEqual(phraseNotes([note], 1, 0, 1), [note]);
  assert.equal(note.start, .14);
});

test('dense repeated keys retain every note and release the latest voice without scanning history', () => {
  const take = new MidiTake(destinationFor('note(60)', 'a', 0, 8)); take.start();
  for (let i = 0; i < 10000; i++) { take.note('keys:1:60', 60, 100, i / 100, true); take.note('keys:1:60', 60, 0, i / 100 + .005, false); }
  assert.equal(take.notes.length, 10000);
  assert.ok(Math.abs(take.notes[9999].end! - 99.995) < 1e-10);
  assert.throws(() => take.note('keys:1:60', 60, 100, 101, true), /10,000/);
  take.stop(101); assert.equal(take.notes.length, 10000);
});

test('hierarchical transcription preserves onsets, held notes, and repetition across time partitions', async () => {
 const { transcribe } = await import('../shared/performance');
 const core = { ...await import('@strudel/core/pattern.mjs'), ...await import('@strudel/core/controls.mjs') };
 const notes = Array.from({ length: 256 }, (_, i) => ({ key: String(i), pitch: 48 + i % 24, velocity: 100, start: i / 16, end: Math.min(16, i / 16 + (i % 7 === 0 ? 1 : 1 / 16)) }));
 const code = transcribe(notes, 16, 1 / 16, 16);
 const pattern = Function('stack', 'timeCat', 'note', 'silence', `return ${code}`)(core.stack, core.timeCat, core.note, core.silence);
 for (const pass of [0, 16]) {
   const events = pattern.queryArc(pass, pass + 16).filter((h: any) => h.hasOnset()).sort((a: any, b: any) => Number(a.whole.begin) - Number(b.whole.begin));
   assert.equal(events.length, notes.length);
   for (let i = 0; i < notes.length; i++) { assert.equal(Number(events[i].whole.begin), notes[i].start + pass); assert.equal(Number(events[i].whole.end), notes[i].end + pass); assert.equal(events[i].value.note, notes[i].pitch); }
 }
});

test('legacy recorded stacks optimize without shifting following slider positions', async () => {
 const { optimizeRecordedMidi } = await import('../shared/optimize-midi');
 const voices = Array.from({ length: 64 }, (_, i) => `timeCat([${i / 16}, silence], [0.0625, note(${48 + i % 24}).velocity(0.5)], [${4 - (i + 1) / 16}, silence]).slow(4)`);
 const old = `stack(${voices.join(',')}).s("sine").gain(slider(.3))`;
 const optimized = optimizeRecordedMidi(old);
 assert.notEqual(optimized, old); assert.equal(optimized.length, old.length);
 assert.equal(optimized.indexOf('slider'), old.indexOf('slider'));
 const core = { ...await import('@strudel/core/pattern.mjs'), ...await import('@strudel/core/controls.mjs') };
 const evaluate = (code: string) => Function('stack', 'timeCat', 'note', 'silence', 'slider', `return ${code}`)(core.stack, core.timeCat, core.note, core.silence, (n: number) => n);
 const events = (code: string) => evaluate(code).queryArc(4, 8).map((h: any) => [Number(h.whole.begin), Number(h.whole.end), h.value.note]).sort((a: number[], b: number[]) => a[0] - b[0]);
 assert.deepEqual(events(optimized), events(old));
 assert.equal(optimizeRecordedMidi('const note = custom;\n' + old), 'const note = custom;\n' + old);
 for (const shadowed of [`(note) => ${old}`, `const { note } = custom;\n${old}`, `note = custom;\n${old}`]) assert.equal(optimizeRecordedMidi(shadowed), shadowed);
});

test('precise scheduler queries agree at adjacent boundaries without rational approximation', async () => {
 const { rationalTime, installPreciseQueries } = await import('../shared/pattern-time');
 const core = { ...await import('@strudel/core/pattern.mjs'), ...await import('@strudel/core/controls.mjs') };
 installPreciseQueries(core);
 assert.deepEqual(rationalTime(.0000001), { n: 100, d: 1000000000 });
 const pattern = core.note(60).fast(16);
 const a = pattern.queryArc(0, .25), b = pattern.queryArc(.25, .5);
 assert.equal(a.filter((h: any) => h.hasOnset()).length, 4); assert.equal(b.filter((h: any) => h.hasOnset()).length, 4);
 assert.equal(Number(a.at(-1)!.whole!.end), Number(b[0].whole!.begin));
 const controlled = new core.Pattern((state: any) => { assert.equal(state.controls.testControl, 42); return []; });
 controlled.queryArc(.123456789, .234567891, { testControl: 42 });
});
