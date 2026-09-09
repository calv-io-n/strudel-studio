import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { soundToken, soundCatalog, studioCompletionSource } from '../client/completions';

test('sound completion replaces only the current sound, preserving mini notation', () => {
  for (const marked of ['s("sa|wtooth*4")', 'note("a3").sound(\'sbd [sa|wtooth:0 ~]\')', 's("<sbd sa|wtooth>")', 's("sa|']) {
    const pos = marked.indexOf('|'), code = marked.replace('|', '');
    const token = soundToken(code, pos)!;
    assert.ok(token, marked);
    assert.equal(token.fragment, 'sa');
    assert.equal(code.slice(token.from, token.to), marked.endsWith('|') ? 'sa' : 'sawtooth');
  }
  for (const marked of ['// s("sa|', 'note("sa|")', 'sounds("sa|")', 's("bd*4|")', 's("bd:0|")', 's("bd", "sa|")']) {
    assert.equal(soundToken(marked.replace('|', ''), marked.indexOf('|')), null, marked);
  }
});
test('catalog searches readable labels and inserts stable names', () => {
  const catalog = soundCatalog(['sbd', 'sawtooth'], []);
  const source = studioCompletionSource(() => catalog, () => ['note']);
  const result = source(new CompletionContext(EditorState.create({ doc: 's("kick' }), 7, false))!;
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].apply, 'sbd');
  assert.equal(result.options[0].detail, 'Synth kick');
  const comment = '// .room';
  assert.equal(source(new CompletionContext(EditorState.create({ doc: comment }), comment.length, true)), null);
});

test('function suggestions include documentation, aliases and source signatures', async () => {
  const { functionDoc, functionSignature } = await import('../client/function-docs');
  assert.match(functionDoc('lpf').params[0].description, /20000/);
  assert.deepEqual(functionDoc('cutoff').params, functionDoc('lpf').params);
  assert.match(functionDoc('slow').description, /Slow down/);
  assert.match(functionDoc('stack').params[0].description, /simultaneously/);
  assert.equal(functionSignature(functionDoc('range')), 'range(min, max)');
  assert.equal(functionDoc('slider').params.length, 4);
  assert.match(functionDoc('MIDI').description, /pitch and velocity/);
  assert.match(functionDoc('soundSlot').params[0].description, /Name/);
  assert.ok(functionDoc('add').examples.some(example => example.includes('<')));
  const source = studioCompletionSource(() => [], () => ['slow', 'slider', 'soundSlot', 'MIDI']);
  const result = source(new CompletionContext(EditorState.create({ doc: '.' }), 1, true))!;
  for (const option of result.options) assert.equal(typeof option.info, 'function', option.label);
});
