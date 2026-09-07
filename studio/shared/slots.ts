// Resolve using musical event time, not a wall-clock timer. Scheduler lookahead
// can cross a boundary before it is audible; keeping the prior value is essential.
export class SlotTimeline {
  private entries = new Map<string, { active: string | null; pending?: { asset: string; cycle: number } }>();
  reset(slots: { name: string; active: string | null }[]) {
    this.entries = new Map(slots.map((slot) => [slot.name, { active: slot.active }]));
  }
  select(name: string, asset: string, started: boolean, scheduledThrough: number) {
    const entry = this.entries.get(name) ?? { active: null };
    if (started) entry.pending = { asset, cycle: Math.floor(Math.max(0, scheduledThrough)) + 1 };
    else { entry.active = asset; entry.pending = undefined; }
    this.entries.set(name, entry);
    return entry.pending?.cycle;
  }
  at(name: string, cycle: number) {
    const entry = this.entries.get(name);
    return entry?.pending && cycle >= entry.pending.cycle ? entry.pending.asset : entry?.active ?? null;
  }
  pending(name: string) { return this.entries.get(name)?.pending; }
  settle(cycle: number, stopped = false) {
    const committed: { name: string; asset: string }[] = [];
    for (const [name, entry] of this.entries) {
      if (entry.pending && (stopped || cycle >= entry.pending.cycle)) {
        entry.active = entry.pending.asset;
        committed.push({ name, asset: entry.active });
        entry.pending = undefined;
      }
    }
    return committed;
  }
}

// Double-quoted Strudel strings arrive as mini-notation patterns, while single quotes stay strings.
export function slotName(argument: unknown): string {
  if (typeof argument === 'string') return argument;
  if (argument && typeof argument === 'object') {
    const pattern = argument as { __pure?: unknown; queryArc?: (a: number, b: number) => { value: unknown }[] };
    if (typeof pattern.__pure === 'string') return pattern.__pure;
    if (typeof pattern.queryArc === 'function') {
      const values = [...new Set(pattern.queryArc(0, 1).map(hap => hap.value))];
      if (values.length === 1 && typeof values[0] === 'string') return values[0];
    }
  }
  throw new Error('soundSlot expects one slot name.');
}
