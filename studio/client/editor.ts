import { isolateHistory } from '@codemirror/commands';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { initEditor, codemirrorSettings, compartments, extensions, activateTheme, updateMiniLocations, highlightMiniLocations } from '@strudel/codemirror';
import { reconcileSliders, type Slider } from '../shared/sliders';
import type { Tab } from '../shared/model';
import { studioCompletions, type SoundEntry } from './completions';
import { destinationFor, type Destination } from '../shared/performance';

export class StudioEditor {
  view: EditorView;
  sliders: Slider[] = [];
  values = new Map<string, number>();
  liveVersions = new Map<string, number>();
  revision = 0;
  private selected?: string;
  private changeWidgets = StateEffect.define<Slider[]>();
  private replacing = false;
  private liveWrite = false;
  private destinationEffect = StateEffect.define<Destination | null>();
  private destinationField = StateField.define<Destination | null>({
    create: () => null,
    update: (value, tr) => {
      for (const effect of tr.effects) if (effect.is(this.destinationEffect)) return effect.value;
      if (!value || !tr.docChanged) return value;
      let valid = value.valid;
      tr.changes.iterChangedRanges((from, to) => {
        if (from < value!.to && to > value!.from || from === to && from > value!.from && from < value!.to) valid = false;
      });
      return { ...value, valid, from: tr.changes.mapPos(value.from, 1), to: tr.changes.mapPos(value.to, -1) };
    },
    provide: field => EditorView.decorations.from(field, value => value && value.to > value.from
      ? Decoration.set([Decoration.mark({ class: value.valid ? 'performance-destination' : 'performance-conflict' }).range(value.from, value.to)]) : Decoration.none),
  });
  arm(tabId: string) {
    const { from, to } = this.view.state.selection.main;
    const destination = destinationFor(this.code, tabId, from, to);
    this.view.dispatch({ effects: this.destinationEffect.of(destination) });
    return destination;
  }
  restoreDestination(destination: Destination) { this.view.dispatch({ effects: this.destinationEffect.of({ ...destination, from: Math.min(destination.from, this.code.length), to: Math.min(destination.to, this.code.length), valid: destination.valid && destination.from >= 0 && destination.to <= this.code.length && this.code.slice(destination.from, destination.to) === destination.original }) }); }
  get destination() { return this.view.state.field(this.destinationField); }
  disarm() { this.view.dispatch({ effects: this.destinationEffect.of(null) }); }
  acceptTake(code: string) {
    const destination = this.destination;
    if (!destination?.valid || this.code.slice(destination.from, destination.to) !== destination.original) throw new Error('The destination changed. Select a valid destination before accepting.');
    if (!code.trim()) throw new Error('An empty take cannot replace code.');
    this.view.dispatch({ changes: { from: destination.from, to: destination.to, insert: code }, effects: this.destinationEffect.of(null), userEvent: 'input.performance', annotations: isolateHistory.of('full') });
  }
  constructor(root: HTMLElement, project: Tab, callbacks: { change: () => void; select: (id: string) => void; evaluate: () => void; stop: () => void; sounds: () => SoundEntry[]; functions: () => string[] }) {
    const owner = this;
    class SliderWidget extends WidgetType {
      constructor(readonly slider: Slider) { super(); }
      eq(other: SliderWidget) { return other.slider.id === this.slider.id && other.slider.value === this.slider.value && other.slider.from === this.slider.from; }
      toDOM() {
        const input = document.createElement('input');
        input.type = 'range'; input.className = 'inline-slider';
        Object.assign(input, { min: String(this.slider.min), max: String(this.slider.max), step: String(this.slider.step), value: String(this.slider.value) });
        input.dataset.sliderId = this.slider.id;
        input.setAttribute('aria-label', `${this.slider.label} inline slider`);
        input.title = 'Select this slider, then MIDI Learn';
        input.addEventListener('pointerdown', () => owner.select(this.slider.id));
        input.addEventListener('focus', () => owner.select(this.slider.id));
        input.addEventListener('input', () => owner.setValue(this.slider.id, Number(input.value)));
        return input;
      }
      ignoreEvent() { return true; }
    }
    const decorations = (sliders: Slider[]) => Decoration.set(sliders.map((s) => Decoration.widget({ widget: new SliderWidget(s), side: -1 }).range(s.from)), true);
    const field = StateField.define<DecorationSet>({
      create: () => decorations(owner.sliders),
      update(value, tr) {
        value = value.map(tr.changes);
        for (const effect of tr.effects) if (effect.is(owner.changeWidgets)) value = decorations(effect.value);
        return value;
      },
      provide: (f) => EditorView.decorations.from(f),
    });
    this.sliders = reconcileSliders(project.code, [], undefined, project.anchors);
    this.sliders.forEach((s) => this.values.set(s.id, s.value));
    codemirrorSettings.set({ ...codemirrorSettings.get(), theme: document.documentElement.dataset.appearance === 'dark' ? 'githubDark' : 'githubLight' });
    this.view = initEditor({ root, initialCode: project.code, onEvaluate: callbacks.evaluate, onStop: callbacks.stop,
      onChange: (update: { docChanged: boolean; state: { doc: { toString(): string } }; changes: Parameters<typeof reconcileSliders>[2] }) => {
        if (!update.docChanged || this.replacing) return;
        if (!this.liveWrite) this.revision++;
        this.sliders = reconcileSliders(update.state.doc.toString(), this.sliders, update.changes);
        this.sliders.forEach((s) => { if (this.liveWrite || !this.values.has(s.id)) this.values.set(s.id, s.value); });
        // Never dispatch recursively inside a CodeMirror update listener.
        queueMicrotask(() => { this.refresh(); callbacks.change(); });
      },
    });
    this.view.dispatch({ effects: [compartments.isAutoCompletionEnabled.reconfigure(studioCompletions(callbacks.sounds, callbacks.functions)), StateEffect.appendConfig.of([field, EditorView.theme({
      '&': { height: '100%', background: 'var(--editor-bg)' , color: 'var(--text)' , fontSize: '14px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: '1.85' },
      '.cm-content': { padding: '20px 0' }, '.cm-gutters': { background: 'var(--editor-bg)' , color: 'var(--muted)' , border: 'none' },
      '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '12px', paddingRight: '18px' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--selection)' },
    })])] });
    this.view.dispatch({ effects: StateEffect.appendConfig.of(this.destinationField) });
    this.onSelect = callbacks.select;
  }
  setAppearance(dark: boolean) {
    const name = dark ? 'githubDark' : 'githubLight';
    codemirrorSettings.set({ ...codemirrorSettings.get(), theme: name });
    this.view.dispatch({ effects: compartments.theme.reconfigure(extensions.theme(name)) });
    activateTheme(name);
  }
  private onSelect: (id: string) => void;
  select(id: string) { this.selected = id; this.markSelected(); this.onSelect(id); }
  markSelected() {
    this.view.dom.querySelectorAll<HTMLElement>('.inline-slider').forEach((el) => el.classList.toggle('selected', el.dataset.sliderId === this.selected));
  }
  refresh() { this.view.dispatch({ effects: this.changeWidgets.of(this.sliders) }); this.markSelected(); }
  get code() { return this.view.state.doc.toString(); }
  get anchors() { return this.sliders.map(({ id, from, fingerprint }) => ({ id, from, fingerprint })); }
  setValue(id: string, value: number) {
    const slider = this.sliders.find((s) => s.id === id);
    if (!slider) return false;
    const next = Math.min(slider.max, Math.max(slider.min, value));
    this.values.set(id, next);
    this.liveVersions.set(id, (this.liveVersions.get(id) ?? 0) + 1);
    this.liveWrite = true;
    this.view.dispatch({ changes: { from: slider.from, to: slider.to, insert: String(Number(next.toFixed(8))) } });
    this.liveWrite = false;
    return true;
  }
  load(project: Tab) {
    this.replacing = true;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: project.code } });
    this.replacing = false;
    this.sliders = reconcileSliders(project.code, [], undefined, project.anchors);
    this.values.clear(); this.sliders.forEach((s) => this.values.set(s.id, s.value)); this.refresh();
  }
  highlight(meta: { miniLocations?: unknown[] }) { updateMiniLocations(this.view, meta.miniLocations ?? []); }
  paint(haps: unknown[], time: number) { highlightMiniLocations(this.view, time, haps); }
}
