import { write } from './storage/database';
import { readPending, readPendingPrefix, removePending } from './recovery';
import type { MidiTake, CapturedNote } from '../shared/performance';

/** At most one write in flight. Later events accumulate as bounded note deltas. */
export class MidiJournal {
  private flight?: Promise<void>;
  private prefix = '';
  private generation = 0;
  reset(session: string) { this.prefix = `midi-journal:${session}:`; this.generation++; }
  async checkpoint(take: MidiTake, meta: object) {
    if (this.flight) return this.flight;
    const indices = [...take.changed];
    const prefix = this.prefix, generation = this.generation;
    indices.forEach(i => take.changed.delete(i));
    const entries = indices.map(i => ({ collection: 'pending' as const, key: `${prefix}note:${String(i).padStart(6, '0')}`, value: { index: i, note: { ...take.notes[i] } } }));
    const writing = write([...entries, { collection: 'pending', key: prefix + 'meta', value: { ...meta, version: 1 } }])
      .catch(error => { if (generation === this.generation) indices.forEach(i => take.changed.add(i)); throw error; })
      .finally(() => { if (this.flight === writing) this.flight = undefined; });
    this.flight = writing;
    return writing;
  }
  async flush(take: MidiTake, meta: object) { await this.flight; await this.checkpoint(take, meta); }
  clear() {
    const prefix = this.prefix;
    if (!prefix) return Promise.resolve();
    const previous = this.flight;
    const clearing = (async () => { await previous?.catch(() => {}); await removePending(prefix); })();
    this.flight = clearing;
    void clearing.finally(() => { if (this.flight === clearing) this.flight = undefined; }).catch(() => {});
    return clearing;
  }
  async restore(session: string) {
    this.reset(session);
    const meta = await readPending<Record<string, any>>(this.prefix + 'meta');
    if (!meta) return;
    const rows = await readPendingPrefix<{ index: number; note: CapturedNote }>(this.prefix + 'note:');
    return { ...meta, notes: rows.sort((a, b) => a.index - b.index).map(r => r.note) };
  }
}
