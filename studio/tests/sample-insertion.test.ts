import test from 'node:test';
import assert from 'node:assert/strict';
import { statementEnd } from '../shared/sample-insertion';
import { describeProjectIssues, newProject, parseProject } from '../shared/model';

test('statementEnd moves a caret inside a string or chain to the end of that statement', () => {
  const code = '$beat: note("c2*4").s("triangle")\n  .gain(0.2)\n\n$bass: note("a2")\n';
  const inside = code.indexOf('*4');
  assert.equal(statementEnd(code, inside), code.indexOf('.gain(0.2)') + '.gain(0.2)'.length);
  assert.equal(statementEnd(code, code.indexOf('a2')), code.indexOf('note("a2")') + 'note("a2")'.length);
});

test('statementEnd keeps a caret on a blank line or in a comment where it is', () => {
  const code = '// intro\nnote("c3")\n\nnote("e3")\n';
  assert.equal(statementEnd(code, 3), '// intro'.length);
  const blank = code.indexOf('\n\n') + 1;
  assert.equal(statementEnd(code, blank), blank);
});

test('parseProject explains which field was rejected instead of a generic union error', () => {
  const broken = { ...newProject(), bpm: 'fast' };
  assert.throws(() => parseProject(broken), /bpm:/);
  assert.match(describeProjectIssues(broken), /^Project format rejected · bpm: /);
  assert.equal(parseProject(newProject()).version, 6);
});
