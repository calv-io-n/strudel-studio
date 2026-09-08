import { MidiTake } from '../shared/performance';
import type { Engine } from './engine';
import type { StudioEditor } from './editor';

export class PerformancePanel {
  take?: MidiTake;
  owner?: StudioEditor;
  private values?: Record<string, any>;
  private audition = false;
  readonly root = document.createElement('section');
  constructor(private editor: () => StudioEditor, private tab: () => { id: string; name: string }, private report: (message: string) => void, private engine: Engine) {
    this.root.className = 'performance-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Play into selection');
    this.root.innerHTML = `<div class="form-row"><strong data-destination></strong><button data-close>Leave performance</button></div><p data-state role="status">Armed · choose an output</p><div data-actions class="form-row"><button data-audition>Audition</button><button data-fallback>Use fallback synth</button><button data-stop>Stop take</button></div><div class="performance-diff"><div><h3>Original</h3><pre data-original></pre></div><div><h3>Proposed · editable pattern</h3><pre data-proposed>No take yet</pre></div></div>`;
    this.button('audition', async () => { await this.prepare(); this.audition = true; this.status('Audition · no code or audio is saved'); });
    this.button('fallback', () => { this.values = { s: 'triangle', gain: .2 }; this.audition = true; this.status('Audition · fallback triangle synth'); });
    this.button('stop', () => this.stop());
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { try { this.close(); } catch (error) { this.report((error as Error).message); } };
  }
  protected button(name: string, action: () => unknown | Promise<unknown>) {
    this.root.querySelector<HTMLButtonElement>(`[data-${name}]`)!.onclick = async () => { try { await action(); } catch (error) { this.report((error as Error).message); } };
  }
  protected status(text: string) { this.root.querySelector('[data-state]')!.textContent = text; }
  private async prepare() {
    if (!this.owner?.destination?.valid) throw new Error('The destination changed. Select a supported note expression again.');
    this.values = await this.engine.performanceValues(this.owner, this.take!.destination.soundCode);
  }
  async note(key: string, pitch: number, velocity: number, on: boolean) {
    if (!this.take) return false;
    if (!on) this.engine.performanceAudio.release(key);
    else if (this.audition && this.values) await this.engine.performanceAudio.play(key, this.values, pitch, velocity);
    return true;
  }
  stop() { this.audition = false; this.engine.performanceAudio.stop(); this.status('Stopped · destination retained'); }
  arm() {
    if (this.take?.notes.length) throw new Error('Accept or discard the pending take before changing destinations.');
    this.stop(); this.values = undefined;
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
    this.stop(); this.engine.performanceAudio.silence();
    this.owner?.disarm(); this.owner = undefined; this.take = undefined; this.root.hidden = true;
  }
}
