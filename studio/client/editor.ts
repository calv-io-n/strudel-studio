import { highlightingFor } from '@codemirror/language';
import { highlightCode } from '@lezer/highlight';
import type { CaptureView } from '../shared/capture-state';
import { parser } from '@lezer/javascript';
import { headerEnd, reconcileTempo } from '../shared/tempo';
import { isolateHistory } from '@codemirror/commands';
import { StateEffect, StateField, Transaction, EditorState, Compartment } from '@codemirror/state';
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
  private editLock = new Compartment();
  lockEditing(locked: boolean) { this.view.dispatch({ effects: this.editLock.reconfigure(EditorState.readOnly.of(locked)) }); }
  private managedTempo = false;
  private managing = false;
  private inputLabels = new Map<string, string>();
  private pending?: { label: string; append: boolean; code?: string; state?: CaptureView['state'] };
  private audioPending?: string;
  private audioCode?: string;
  private appearanceVersion = 0;
  private audioState?: CaptureView['state'];
  setAudioPending(label?: string, code?: string, state?: CaptureView['state']) { if (label === this.audioPending && code === this.audioCode && state === this.audioState) return; this.audioPending = label; this.audioCode = code; this.audioState = state; this.view.dispatch({ effects: this.repaint.of(null) }); }
  revealRecording(append = false) { this.view.dispatch({ effects: EditorView.scrollIntoView(append ? this.code.length : this.destination?.from ?? this.code.length, { y: 'center' }) }); }
  private repaint = StateEffect.define<null>();
  setInputLabels(labels: Map<string, string>) { this.inputLabels = labels; this.view.dispatch({ effects: this.repaint.of(null) }); }
  setPending(label?: string, append = false, code?: string, state?: CaptureView['state']) {
    if (this.pending?.label === label && this.pending?.append === append && this.pending?.code === code && this.pending?.state === state || !this.pending && !label) return;
    if (label) this.view.dom.dataset.captureState = label; else delete this.view.dom.dataset.captureState;
    this.pending = label ? { label, append, code, state } : undefined;
    this.view.dispatch({ effects: this.repaint.of(null) });
  }
  syncTempo(bpm: number, override?: number) {
    this.managedTempo = true;
    const result = reconcileTempo(this.code, bpm, override);
    this.managing = true;
    try { this.view.dispatch({ changes: result.changes, effects: this.repaint.of(null), annotations: Transaction.addToHistory.of(false) }); }
    finally { this.managing = false; }
    return result.complex;
  }
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
      return { ...value, valid, from: tr.changes.mapPos(value.from, 1), to: tr.changes.mapPos(value.to, value.append ? 1 : -1) };
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
  armAppend(tabId: string, soundCode: string) {
    const destination: Destination = { tabId, from: this.code.length, to: this.code.length, original: '', soundCode, valid: true, append: true };
    this.view.dispatch({ effects: this.destinationEffect.of(destination) }); return destination;
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
  constructor(root: HTMLElement, project: Tab, callbacks: { change: (live: boolean) => void; select: (id: string) => void; evaluate: () => void; stop: () => void; sounds: () => SoundEntry[]; functions: () => string[] }) {
    const owner = this;
    class PendingWidget extends WidgetType {
      constructor(readonly label: string, readonly code?: string, readonly inline = false, readonly state?: CaptureView['state'], readonly audio = false, readonly appearanceVersion = owner.appearanceVersion) { super(); }
      eq(other: PendingWidget) { return this.label === other.label && this.code === other.code && this.inline === other.inline && this.state === other.state && this.audio === other.audio && this.appearanceVersion === other.appearanceVersion; }
      toDOM(view: EditorView) {
        const creating = this.state === 'preparing' || this.state === 'recording' || this.state === 'finishing';
        const el = document.createElement(this.inline ? 'span' : 'div');
        el.className = `pending-code${this.inline ? ' pending-inline' : ''}${creating ? ' creating-code' : ''}`;
        el.setAttribute('aria-label', this.label); el.setAttribute('aria-busy', String(creating)); el.title = this.label;
        const putCode = (code: string) => highlightCode(code, parser.parse(code), { style: tags => highlightingFor(view.state, tags) }, (text, classes) => {
          const span = document.createElement('span'); span.className = classes; span.textContent = text; el.append(span);
        }, () => el.append(document.createTextNode('\n')));
        if (this.code?.trim()) putCode(this.code.trim());
        else {
          putCode(this.audio ? '// Recorded audio\n$: s(' : `${this.inline ? '' : '// Recorded MIDI\n$: '}note(`);
          const placeholder = document.createElement('span'); placeholder.className = 'code-placeholder'; placeholder.setAttribute('aria-hidden', 'true'); placeholder.textContent = '\u00a0'.repeat(this.audio ? 20 : 12); el.append(placeholder);
          putCode(this.audio ? ').gain(1)' : `)${this.inline ? '' : owner.destination?.soundCode ?? ''}`);
        }
        return el;
      }
      ignoreEvent() { return true; }
    }
    const cues = (code: string, destination?: Destination | null) => {
      const ranges = [];
      const end = headerEnd(code);
      if (owner.managedTempo && end) ranges.push(Decoration.mark({ class: 'managed-tempo', attributes: { title: 'Controlled by project BPM. Change tempo beside the transport; pattern overrides are in the pattern menu.' } }).range(0, end - 1));
      parser.parse(code).iterate({ enter(node) {
        if (node.name !== 'CallExpression') return;
        const name = node.node.firstChild;
        if (name?.name !== 'VariableName') return;
        const kind = code.slice(name.from, name.to);
        const slider = kind === 'slider' ? owner.sliders.find(s => s.start === node.from) : undefined;
        if (['setcpm', 'setCpm', 'setcps', 'setCps'].includes(kind) && node.from >= end) {
          ranges.push(Decoration.mark({ class: 'tempo-conflict', attributes: { title: 'Studio ignores this global clock setter. Use project BPM beside the transport.', 'aria-label': 'Tempo controlled by project BPM' } }).range(name.from, name.to));
        }
        if (kind !== 'note' && !slider) return;
        const assigned = slider ? owner.inputLabels.get(slider.id) : destination?.valid && destination.from === node.from ? 'MIDI notes · connected inputs and on-screen keys' : undefined;
        ranges.push(Decoration.mark({ class: `input-function${assigned ? ' input-assigned' : ''}`, attributes: { 'data-input-function': kind, tabindex: '0', role: 'button', 'aria-label': `${kind}: ${assigned ?? 'Unassigned input'}; open input controls`, title: assigned ?? `${kind}: input controls` } }).range(name.from, name.to));
      } });
      if (owner.pending?.label.startsWith('Recording') && destination?.valid && !destination.append) {
        const from = destination.from + destination.original.indexOf('(') + 1, to = destination.to - 1;
        if (to > from) ranges.push(Decoration.mark({ class: 'pending-note' }).range(from, to));
      }
      if (owner.pending) {
        const at = owner.pending.append ? code.length : Math.min(code.length, destination?.to ?? code.length);
        if (destination?.valid && !destination.append) {
          ranges.push(Decoration.replace({ widget: new PendingWidget(owner.pending.label, owner.pending.code, true, owner.pending.state) }).range(destination.from, destination.to));
        } else ranges.push(Decoration.widget({ widget: new PendingWidget(owner.pending.label, owner.pending.code, false, owner.pending.state), side: 1 }).range(at));
      }
      if (owner.audioPending) ranges.push(Decoration.widget({ widget: new PendingWidget(`Audio · ${owner.audioPending}`, owner.audioCode, false, owner.audioState, true), side: 2 }).range(code.length));
      return Decoration.set(ranges, true);
    };
    const cueField = StateField.define<DecorationSet>({
      create: state => cues(state.doc.toString(), state.field(owner.destinationField, false)),
      update: (value, tr) => tr.docChanged || tr.effects.length ? cues(tr.newDoc.toString(), tr.state.field(owner.destinationField, false)) : value,
      provide: field => EditorView.decorations.from(field),
    });
    class SliderWidget extends WidgetType {
      constructor(readonly slider: Slider) { super(); }
      eq(other: SliderWidget) { return other.slider.id === this.slider.id && other.slider.value === this.slider.value && other.slider.from === this.slider.from; }
      toDOM() {
        const input = document.createElement('input');
        input.type = 'range'; input.className = 'inline-slider';
        Object.assign(input, { min: String(this.slider.min), max: String(this.slider.max), step: String(this.slider.step), value: String(this.slider.value) });
        input.dataset.sliderId = this.slider.id;
        input.setAttribute('aria-label', `${this.slider.label} inline slider`);
        input.title = 'Adjust value. Use the slider() name to bind a MIDI control.';
        input.addEventListener('pointerdown', () => owner.select(this.slider.id));
        input.addEventListener('focus', () => owner.select(this.slider.id));
        input.addEventListener('input', () => owner.setValue(input.dataset.sliderId!, Number(input.value)));
        return input;
      }
      updateDOM(dom: HTMLElement) {
        const input = dom as HTMLInputElement;
        if (input.dataset.sliderId !== this.slider.id) return false;
        Object.assign(input, { min: String(this.slider.min), max: String(this.slider.max), step: String(this.slider.step), value: String(this.slider.value) });
        return true;
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
    const EditorStateFilter = EditorState.transactionFilter.of(tr => {
      if (!owner.managedTempo || owner.managing || owner.replacing || !tr.docChanged) return tr;
      const end = headerEnd(tr.startState.doc.toString()); let touches = false;
      tr.changes.iterChangedRanges((from) => { if (from < end) touches = true; });
      return touches ? [] : tr;
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
        const live = this.liveWrite;
        queueMicrotask(() => { this.refresh(); callbacks.change(live); });
      },
    });
    this.view.dispatch({ effects: [compartments.isAutoCompletionEnabled.reconfigure(studioCompletions(callbacks.sounds, callbacks.functions)), StateEffect.appendConfig.of([field, EditorView.theme({
      '&': { height: '100%', background: 'var(--panel)', color: 'var(--ink)', fontSize: '14px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', lineHeight: '1.85' },
      '.cm-content': { padding: '26px 0' }, '.cm-gutters': { background: 'var(--panel)', color: 'var(--muted)', border: 'none' },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '24px', paddingLeft: '12px', paddingRight: '20px' },
      '.cm-cursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'var(--sel)' },
    })])] });
    this.view.dispatch({ effects: StateEffect.appendConfig.of([this.destinationField, cueField, EditorStateFilter, this.editLock.of(EditorState.readOnly.of(false))]) });
    this.onSelect = callbacks.select;
  }
  setAppearance(dark: boolean) {
    this.appearanceVersion++;
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
    if (next === slider.value) return true;
    this.values.set(id, next);
    this.liveVersions.set(id, (this.liveVersions.get(id) ?? 0) + 1);
    this.liveWrite = true;
    this.view.dispatch({ changes: { from: slider.from, to: slider.to, insert: String(Number(next.toFixed(8))) } });
    this.liveWrite = false;
    return true;
  }
  publishRecording(project: Tab) {
    const previous = this.code, next = project.code;
    let from = 0, suffix = 0;
    while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
    while (suffix < previous.length - from && suffix < next.length - from && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
    const scroll = this.view.scrollDOM.scrollTop;
    this.managing = true;
    try { this.view.dispatch({ changes: { from, to: previous.length - suffix, insert: next.slice(from, next.length - suffix) }, annotations: isolateHistory.of('full') }); }
    finally { this.managing = false; }
    this.view.requestMeasure({ read: () => scroll, write: value => { this.view.scrollDOM.scrollTop = value; } });
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
