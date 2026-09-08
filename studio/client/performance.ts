import { MidiTake } from '../shared/performance';
import type { StudioEditor } from './editor';

export class PerformancePanel {
  take?: MidiTake;
  owner?: StudioEditor;
  readonly root = document.createElement('section');
  constructor(private editor: () => StudioEditor, private tab: () => { id: string; name: string }, private report: (message: string) => void) {
    this.root.className = 'performance-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Play into selection');
    this.root.innerHTML = `<div class="form-row"><strong data-destination></strong><button data-close>Leave performance</button></div><p data-state role="status">Armed · choose an output</p><div data-actions></div><div class="performance-diff"><div><h3>Original</h3><pre data-original></pre></div><div><h3>Proposed · editable pattern</h3><pre data-proposed>No take yet</pre></div></div>`;
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { try { this.close(); } catch (error) { this.report((error as Error).message); } };
  }
  arm() {
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before changing destinations.');
    const next = this.editor();
    const destination = next.arm(this.tab().id);
    if (this.owner !== next) this.owner?.disarm();
    this.owner = next; this.take = new MidiTake(destination);
    this.root.hidden = false;
    this.root.querySelector('[data-destination]')!.textContent = this.tab().name;
    this.root.querySelector('[data-original]')!.textContent = destination.original;
  }
  close() {
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before leaving.');
    this.owner?.disarm(); this.owner = undefined; this.take = undefined; this.root.hidden = true;
  }
}
