import { Text, ChangeSet } from '@codemirror/state';
import { parser } from '@lezer/javascript';
import type { Project, Tab } from './model';

export const beatsPerCycle = 4;
export const tempoRate = (tab: Pick<Tab, 'tempoBpm' | 'audioAssetId'>, bpm: number) => tab.audioAssetId ? 1 : (tab.tempoBpm ?? bpm) / bpm;
export const beatPosition = (cycle: number) => Number((cycle * 4 + 1).toFixed(4));
export const beatDuration = (cycle: number) => Number((cycle * 4).toFixed(4));
const setters = new Set(['setcpm', 'setCpm', 'setcps', 'setCps']);
export function tempoHeader(bpm: number, override?: number) {
  return `// Tempo: ${bpm} BPM — controlled by project BPM${override === undefined ? '' : ` · Pattern: ${override} BPM (all placements)`}\nsetcpm(${bpm} / 4)\n`;
}
export function headerEnd(code: string) {
  return code.match(/^\/\/ Tempo: [^\n]*controlled by project BPM[^\n]*\nsetcpm\([^\n]*\)\n/)?.[0].length ?? 0;
}
/** Preserve non-tempo code and map anchors through narrowly scoped replacements. */
export function reconcileTempo(code: string, bpm: number, override?: number) {
  const end = headerEnd(code), changes: { from: number; to: number; insert: string }[] = [];
  const header = tempoHeader(bpm, override);
  if (code.slice(0, end) !== header) changes.push({ from: 0, to: end, insert: header });
  let complex = false;
  parser.parse(code).iterate({ enter(node) {
    if (node.name !== 'CallExpression' || node.from < end) return;
    const callee = node.node.firstChild;
    if (callee?.name !== 'VariableName' || !setters.has(code.slice(callee.from, callee.to))) return;
    const statement = node.node.parent;
    if (statement?.name !== 'ExpressionStatement' || statement.parent?.name !== 'Script') { complex = true; return; }
    const original = code.slice(statement.from, statement.to);
    changes.push({ from: statement.from, to: statement.to, insert: original.split('\n').map(line => `// Previous tempo: ${line}`).join('\n') });
  } });
  const set = ChangeSet.of(changes, code.length);
  return { changes: set, code: set.apply(Text.of(code.split('\n'))).toString(), complex };
}
export function normalizeTabTempo(tab: Tab, bpm: number): Tab {
  const result = reconcileTempo(tab.code, bpm, tab.tempoBpm);
  return { ...tab, code: result.code, anchors: tab.anchors.map(a => ({ ...a, from: result.changes.mapPos(a.from, 1) })) };
}
export function normalizeProjectTempo(project: Project) {
  project.tabs = project.tabs.map(tab => normalizeTabTempo(tab, project.bpm));
  for (const [id, code] of Object.entries(project.appliedPatterns ?? {})) {
    const tab = project.tabs.find(t => t.id === id); if (!tab) continue;
    const result = reconcileTempo(code, project.bpm, tab.tempoBpm);
    project.appliedPatterns![id] = result.code;
    if (project.appliedPatternAnchors?.[id]) project.appliedPatternAnchors[id] = project.appliedPatternAnchors[id].map(a => ({ ...a, from: result.changes.mapPos(a.from, 1) }));
  }
  return project;
}
export function standaloneCode(tab: Tab, bpm: number) {
  const result = reconcileTempo(tab.code, bpm, tab.tempoBpm);
  if (result.complex) throw new Error('Remove embedded tempo setters before exporting standalone code. Use project BPM or Pattern tempo instead.');
  const code = result.code;
  return `// Tempo: ${tab.tempoBpm ?? bpm} BPM · four beats per cycle\nsetcpm(${tab.tempoBpm ?? bpm} / 4)\n` + code.slice(headerEnd(code));
}
