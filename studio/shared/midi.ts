import type { Binding } from './model';
export function parseMidi(bytes: number[]) {
  if (bytes.length !== 3 || bytes.some((b) => !Number.isInteger(b)) || bytes[0] < 0x80 || bytes[0] > 0xef || bytes.slice(1).some((b) => b < 0 || b > 127)) return null;
  const type = bytes[0] & 0xf0;
  if (![0x80, 0x90, 0xb0].includes(type)) return null;
  return { kind: type === 0xb0 ? 'cc' as const : 'note' as const,
    channel: (bytes[0] & 15) + 1, number: bytes[1], value: bytes[2],
    on: type === 0x90 && bytes[2] > 0 };
}
export function scaleCC(value: number, min: number, max: number, step: number) {
  const raw = min + Math.max(0, Math.min(127, value)) / 127 * (max - min);
  const snapped = min + Math.round((raw - min) / step) * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(8));
}
export class Pickup {
  private states = new Map<string, { previous?: number; caught: boolean; lastApplied?: number }>();
  reset() { this.states.clear(); }
  accept(binding: Binding, input: number, current: number) {
    if (!binding.pickup) return true;
    const state = this.states.get(binding.id) ?? { caught: false };
    if (state.lastApplied !== undefined && Math.abs(current - state.lastApplied) > 1 / 127) state.caught = false;
    const close = Math.abs(input - current) <= 1 / 127;
    const crossed = state.previous !== undefined && (state.previous - current) * (input - current) <= 0;
    state.caught ||= close || crossed;
    state.previous = input;
    if (state.caught) state.lastApplied = input;
    this.states.set(binding.id, state);
    return state.caught;
  }
}
