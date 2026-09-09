import { parse } from 'acorn';
export const AUDIO_EDITOR = '@audio';
export const defaultAudioCode = 'AUDIO\n  .gain(slider(0.8, 0, 2, 0.01))\n  .lpf(slider(18000, 80, 20000, 10))\n  .room(0)\n';
export const effectRanges = { gain: [0, 8], pan: [0, 1], lpf: [20, 22000], hpf: [0, 22000], delay: [0, 1], delaytime: [0, 2], delayfeedback: [0, .95], room: [0, 1] } as const;
export type EffectName = keyof typeof effectRanges;
export type AudioEffects = Record<EffectName, number>;
export function compileAudioEffects(code: string): AudioEffects {
  const defaults: AudioEffects = { gain: 1, pan: .5, lpf: 240000, hpf: 0, delay: 0, delaytime: .25, delayfeedback: .3, room: 0 };
  const ast = parse(code, { ecmaVersion: 2022 }) as any;
  if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') throw new Error('Use one AUDIO effects chain. Statements and patterned parameters are unsupported.');
  const number = (node: any): number => {
    if (node?.type === 'Literal' && typeof node.value === 'number' && Number.isFinite(node.value)) return node.value;
    if (node?.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) return (node.operator === '-' ? -1 : 1) * number(node.argument);
    if (node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'slider' && node.arguments.length >= 3 && node.arguments.length <= 4) {
      const values = node.arguments.map((n: any) => { if (n.type === 'CallExpression') throw new Error('Slider arguments must be numbers.'); return number(n); });
      if (values[1] >= values[2] || values[0] < values[1] || values[0] > values[2] || values[3] !== undefined && values[3] <= 0) throw new Error('Invalid AUDIO slider range.');
      return values[0];
    }
    throw new Error('AUDIO parameters support numbers and sliders only. Capture audio before using sample transformations.');
  };
  const visit = (node: any) => {
    if (node.type === 'Identifier' && node.name === 'AUDIO') return;
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed || node.callee.optional || node.optional) throw new Error('Start with AUDIO and use supported effects.');
    visit(node.callee.object);
    const alias = node.callee.property.name, name = (alias === 'cutoff' ? 'lpf' : alias) as EffectName;
    if (!Object.hasOwn(effectRanges, name) || node.arguments.length !== 1) throw new Error(`Unsupported AUDIO modifier: ${alias}. Use gain, pan, lpf, hpf, delay, delaytime, delayfeedback, or room.`);
    const value = number(node.arguments[0]), [min, max] = effectRanges[name];
    if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
    defaults[name] = value;
  };
  visit(ast.body[0].expression); return defaults;
}
