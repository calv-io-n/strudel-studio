import { parse } from 'acorn';
import { transcribe, type CapturedNote } from './performance';

/** Recognize only the former literal recorder output. Keep offsets for slider bindings. */
export function optimizeRecordedMidi(code: string): string {
  if (!code.includes('timeCat(') || code.length < 2000) return code;
  let tree: any; try { tree = parse(code, { ecmaVersion: 2022 }); } catch { return code; }
  const edits: { from: number; to: number; text: string }[] = [];
  const call = (node: any, name: string) => node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name;
  const method = (node: any, name: string) => node?.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && !node.callee.computed && node.callee.property.name === name;
  const number = (node: any) => node?.type === 'Literal' && typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : undefined;
  const names = new Set(['stack', 'timeCat', 'note', 'silence']);
  const bindsPatternName = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'Identifier') return names.has(node.name);
    return Object.values(node).some(value => Array.isArray(value) ? value.some(bindsPatternName) : bindsPatternName(value));
  };
  let shadowed = false;
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && bindsPatternName(node.id)
      || /Function/.test(node.type) && (bindsPatternName(node.id) || node.params?.some(bindsPatternName))
      || node.type === 'CatchClause' && bindsPatternName(node.param)
      || node.type === 'AssignmentExpression' && bindsPatternName(node.left)) shadowed = true;
    if (call(node, 'stack') && node.arguments.length > 16) {
      const notes: CapturedNote[] = []; let length: number | undefined; let accepted = 0;
      for (const voice of node.arguments) {
        if (!method(voice, 'slow') || voice.arguments.length !== 1) break;
        const period = number(voice.arguments[0]), cat = voice.callee.object;
        if (period === undefined || period <= 0 || period > 4096 || !call(cat, 'timeCat') || length !== undefined && length !== period) break;
        length = period; let cursor = 0, found = false, valid = true;
        for (const segment of cat.arguments) {
          if (segment.type !== 'ArrayExpression' || segment.elements.length !== 2) { valid = false; break; }
          const weight = number(segment.elements[0]), pattern = segment.elements[1];
          if (weight === undefined || weight < 0) { valid = false; break; }
          if (pattern.type !== 'Identifier' || pattern.name !== 'silence') {
            if (found || !method(pattern, 'velocity') || pattern.arguments.length !== 1 || !call(pattern.callee.object, 'note') || pattern.callee.object.arguments.length !== 1) { valid = false; break; }
            const pitch = number(pattern.callee.object.arguments[0]), velocity = number(pattern.arguments[0]);
            if (pitch === undefined || !Number.isInteger(pitch) || pitch < 0 || pitch > 127 || velocity === undefined || velocity <= 0 || velocity > 1) { valid = false; break; }
            notes.push({ key: String(notes.length), pitch, velocity: velocity * 127, start: cursor, end: cursor + weight }); found = true;
          }
          cursor += weight;
        }
        if (!valid || !found || Math.abs(cursor - period) > .00001) break;
        accepted++;
      }
      if (length && accepted === node.arguments.length && notes.length === node.arguments.length) {
        const text = transcribe(notes, length, 0, length);
        if (text.length <= node.end - node.start) { edits.push({ from: node.start, to: node.end, text }); return; }
      }
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  };
  visit(tree); if (shadowed) return code;
  for (const edit of edits.sort((a, b) => b.from - a.from)) code = code.slice(0, edit.from) + edit.text.padEnd(edit.to - edit.from, ' ') + code.slice(edit.to);
  return code;
}
