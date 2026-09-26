import { parse } from 'acorn';
import type { Asset, Clip, Tab } from './model';

/** Recognize only a single, untransformed library sample; rhythmic/chopped patterns stay patterns. */
export function singleSampleId(code: string): string | undefined {
  try {
    const ast = parse(code, { ecmaVersion: 2022 }) as any;
    const statements = ast.body.filter((s: any) => !(s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && s.expression.callee.type === 'Identifier' && ['setcpm', 'setCpm', 'setcps', 'setCps', 'samples'].includes(s.expression.callee.name)));
    if (statements.length !== 1) return;
    let statement = statements[0];
    if (statement.type === 'LabeledStatement' && statement.label.name.startsWith('$')) statement = statement.body;
    if (statement.type !== 'ExpressionStatement') return;
    let node = statement.expression;
    const number = (n: any): boolean => n?.type === 'Literal' && typeof n.value === 'number' && Number.isFinite(n.value) || n?.type === 'UnaryExpression' && ['+', '-'].includes(n.operator) && number(n.argument) || n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'slider' && n.arguments.length >= 3 && n.arguments.length <= 4 && n.arguments.every((a: any) => a.type === 'Literal' && typeof a.value === 'number' && Number.isFinite(a.value));
    const effects = new Set(['slow', 'gain', 'pan', 'lpf', 'hpf', 'room', 'roomsize', 'delay', 'delaytime', 'delayfeedback', 'orbit']);
    while (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      if (node.callee.computed || !effects.has(node.callee.property.name) || node.arguments.length !== 1 || !number(node.arguments[0])) return;
      node = node.callee.object;
    }
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || !['s', 'sound'].includes(node.callee.name) || node.arguments.length !== 1) return;
    const key = node.arguments[0]?.value;
    if (typeof key !== 'string' || !/^studio_[a-f\d]{32}$/i.test(key)) return;
    const h = key.slice(7).toLowerCase();
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  } catch { return; }
}
export function samplePlacement(tab: Tab, assets: Asset[], bpm: number): Pick<Clip, 'length' | 'takeId' | 'playback'> {
  const id = tab.audioAssetId ?? singleSampleId(tab.code);
  const asset = assets.find(a => a.id === id && !a.missing);
  if (!asset?.duration) return { length: 4 };
  return { length: Math.max(.25, Math.ceil(asset.duration * bpm / 240 * 4) / 4), takeId: asset.id, ...(tab.audioAssetId ? {} : { playback: 'once' as const }) };
}
