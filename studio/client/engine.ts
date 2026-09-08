import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as audio from '@strudel/webaudio';
import * as draw from '@strudel/draw';
import * as fonts from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import { SlotTimeline, slotName } from '../shared/slots';
import { arrangement, MuteTimeline, PatternTimeline, type Pattern } from '../shared/arrangement';
import type { Asset, Project } from '../shared/model';
import type { StudioEditor } from './editor';
import { PerformanceAudio } from './performance-audio';
import { soundCatalog, soundKey } from './completions';

type Scheduler = { started: boolean; lastEnd: number; cps: number; now(): number; stop(): void; setCps(cps: number): void; setPattern(pattern: Pattern, start?: boolean): Promise<void> };
type Repl = { scheduler: Scheduler; state: { evalError?: Error; pattern?: { queryArc(a: number, b: number): unknown[] } }; evaluate(code: string, start: boolean): Promise<unknown> };
export class Engine {
  readonly performanceAudio = new PerformanceAudio();
  async performanceValues(owner: StudioEditor, soundCode: string): Promise<Record<string, any>> {
    if (this.compilingBusy) throw new Error('Wait for the current pattern to finish preparing.');
    await this.unlock();
    this.compilingBusy = true;
    try {
      const compiler = core.repl({ transpiler });
      await compiler.evaluate(`note(60)${soundCode.replace(/slider\(\s*([-+\d.e]+)[^)]*\)/g, '$1')}`, false);
      if (compiler.state.evalError) throw compiler.state.evalError;
      const haps = compiler.state.pattern?.queryArc(0, 1) ?? [];
      if (haps.length !== 1 || !haps[0].value || typeof haps[0].value !== 'object') throw new Error('Select a single instrument chain or choose the fallback synth.');
      return haps[0].value;
    } finally {
      core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern);
      this.compilingBusy = false;
    }
  }
  private library: Asset[] = [];
  get soundEntries() { return soundCatalog(Object.keys(audio.soundMap.get()), this.library); }
  get functionNames(): string[] {
    return [...new Set([...Object.entries({ ...core, ...mini, ...tonal, ...audio, ...draw, ...fonts })
      .filter(([, value]) => typeof value === 'function').map(([name]) => name), ...Object.getOwnPropertyNames(core.Pattern.prototype)])]
      .filter(name => /^[a-zA-Z]\w*$/.test(name) && name !== 'constructor').sort();
  }
  async registerAssets(assets: Asset[]) {
    this.library = assets;
    await audio.samples(Object.fromEntries(assets.map(asset => [soundKey(asset), [new URL(`/api/samples/${asset.id}/audio`, location.origin).href]])));
  }
  repl!: Repl;
  timeline = new SlotTimeline();
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private voices = new Set<AudioBufferSourceNode>();
  private init?: Promise<void>;
  private epoch = 0;
  private compiler!: Repl;
  private compiling?: StudioEditor;
  private compilingBusy = false;
  private compositionCompile = false;
  private mutes = new MuteTimeline();
  pendingMuteCycle: number | undefined;
  updateMutes() {
    if (this.started && this.target === 'composition') this.pendingMuteCycle = this.mutes.queue(this.project().clips, this.project().tracks, this.repl.scheduler.lastEnd, this.project().soloTrackId);
    this.changed();
  }
  private patterns = new PatternTimeline();
  private applied = new Map<string, number>();
  target: string | 'composition' | undefined;
  endCycle = Infinity;
  pendingCycle: number | undefined;
  private notes = new Map<number, OscillatorNode>();
  private noteRequests = new Map<number, object>();
  private selectionRequests = new Map<string, number>();
  constructor(private editorFor: (id?: string) => StudioEditor, private project: () => Project, private changed: () => void, private error: (message: string) => void) {}
  async setup(project: Project) {
    mini.miniAllStrings();
    audio.registerSynthSounds(); audio.registerZZFXSounds();
    await core.evalScope(core, mini, tonal, audio, draw, fonts, {
      sliderWithID: (runtimeId: string, value: number) => {
        const from = Number(runtimeId.replace('slider_', ''));
        const owner = this.compiling!;
        const slider = owner.sliders.find((s) => s.from === from);
        if (!slider) return core.pure(value);
        const stableId = slider.id;
        const revision = owner.liveVersions.get(stableId) ?? 0;
        return core.ref(() => (owner.liveVersions.get(stableId) ?? 0) !== revision ? owner.values.get(stableId) ?? value : value);
      },
      soundSlot: (argument: string | { __pure: string }) => {
        const name = slotName(argument);
        if (typeof name !== 'string') throw new Error("soundSlot expects a name, e.g. soundSlot('bass')");
        return new core.Pattern((state: { span: { begin: { valueOf(): number } }; controls?: { studioCycleOffset?: number } }) => {
          const asset = this.timeline.at(name, Number(state.span.begin) + (state.controls?.studioCycleOffset ?? 0));
          return (asset ? core.pure(`studio_${asset.replaceAll('-', '')}`) : core.silence).query(state);
        }).splitQueries();
      },
    });
    this.compiler = core.repl({ transpiler, afterEval: ({ meta }: { meta: { miniLocations?: unknown[] } }) => this.compiling?.highlight(meta), getTime: () => audio.getAudioContext().currentTime,
      beforeEval: async () => {
        if (this.compositionCompile) {
          const tempo = () => core.silence;
          await core.evalScope({ setCpm: tempo, setcpm: tempo, setCps: tempo, setcps: tempo });
        }
      },
    });
    this.repl = audio.webaudioRepl({ transpiler, beforeStart: () => this.unlock(),
      onToggle: () => this.changed(), onEvalError: (err: Error) => this.error(err.message),
    });
    this.timeline.reset(project.slots);
  }
  async unlock() {
    const ac: AudioContext = audio.getAudioContext();
    await ac.resume();
    this.init ??= audio.initAudio();
    await this.init;
  }
  get busy() { return this.compilingBusy; }
  get hasChanges() {
    return this.started && [...this.applied].some(([id, revision]) => this.editorFor(id).revision !== revision);
  }
  async evaluate(start = true, target = this.project().activeTabId) {
    if (!start) return;
    if (this.started) return this.apply();
    return this.compile(target, false);
  }
  async apply() { if (this.started && this.target) await this.compile(this.target, true); }
  private async compile(target: string, update: boolean) {
    if (this.compilingBusy) return;
    this.compilingBusy = true; this.changed();
    const epoch = this.epoch;
    const project = this.project();
    const ids = target === 'composition' ? [...new Set(project.clips.map(c => c.tabId))] : [target];
    const clips = project.clips.map(c => ({ ...c }));
    const next = new Map<string, Pattern>(), codes = new Map<string, number>();
    let cps = project.bpm / 240;
    try {
      if (!ids.length) throw new Error('Add a pattern to the composition first.');
      await this.unlock();
      for (const id of ids) {
        const tab = project.tabs.find(t => t.id === id)!;
        if (epoch !== this.epoch) return;
        this.compositionCompile = target === 'composition';
        this.compiling = this.editorFor(id);
        const code = this.compiling.code, revision = this.compiling.revision;
        this.compiler.scheduler.setCps(target === 'composition' ? project.bpm / 240 : .5);
        await this.compiler.evaluate(code.trim() ? code : 'silence', false);
        if (this.compiler.state.evalError) throw new Error(`${tab.name}: ${this.compiler.state.evalError.message}`);
        if (epoch !== this.epoch) return;
        next.set(id, this.compiler.state.pattern as Pattern); codes.set(id, revision);
        if (target !== 'composition') cps = this.compiler.scheduler.cps;
      }
      if (epoch !== this.epoch) return;
      const pattern = target === 'composition' ? arrangement(clips, next, this.mutes) : next.get(target)!;
      // Check queries before replacing a working performance.
      pattern.queryArc(0, 1);
      if (!Number.isFinite(cps) || cps <= 0) throw new Error('Tempo must be greater than zero.');
      if (update) {
        this.pendingCycle = this.patterns.queue(pattern, this.repl.scheduler.lastEnd);
        // Applying a tempo change with lookahead needs a separate clock transition.
        // Keep the running tempo; new code tempo takes effect on the next Play.
      } else {
        this.mutes.reset(this.project().clips, this.project().tracks, this.project().soloTrackId);
        this.patterns.reset(pattern);
        this.repl.scheduler.setCps(cps);
        this.target = target;
        this.endCycle = target === 'composition' ? Math.max(...clips.map(c => c.start + c.length)) : Infinity;
        const live = this.patterns.pattern();
        this.repl.state.pattern = live;
        await this.repl.scheduler.setPattern(live, true);
      }
      this.applied = codes;
    } finally {
      this.compiling = undefined;
      core.setTime(() => this.repl.scheduler.now());
      core.setCpsFunc(() => this.repl.scheduler.cps);
      core.setPattern(this.repl.state.pattern);
      this.compilingBusy = false; this.changed();
    }
  }
  tick() {
    this.patterns.settle(this.cycle); this.mutes.settle(this.cycle);
    if (this.pendingMuteCycle !== undefined && this.cycle >= this.pendingMuteCycle) { this.pendingMuteCycle = undefined; this.changed(); }
    if (this.pendingCycle !== undefined && this.cycle >= this.pendingCycle) this.pendingCycle = undefined;
    if (this.started && this.cycle >= this.endCycle) this.stop();
  }
  async noteOn(number: number, velocity: number) {
    const epoch = this.epoch;
    this.noteOff(number);
    const request = {}; this.noteRequests.set(number, request);
    await this.unlock();
    if (epoch !== this.epoch || this.noteRequests.get(number) !== request) return;
    const context: AudioContext = audio.getAudioContext();
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.value = 440 * 2 ** ((number - 69) / 12);
    gain.gain.value = velocity / 127 * .12;
    oscillator.connect(gain).connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    this.notes.set(number, oscillator); oscillator.start();
  }
  noteOff(number: number) { this.noteRequests.delete(number); const voice = this.notes.get(number); if (voice) { voice.stop(); this.notes.delete(number); } }
  async preload(asset: Asset) {
    if (this.buffers.has(asset.id)) return;
    if (!this.loading.has(asset.id)) {
      const task = (async () => {
        const url = new URL(`/api/samples/${asset.id}/audio`, location.origin).href;
        const key = `studio_${asset.id.replaceAll('-', '')}`;
        const buffer = await audio.loadBuffer(url, audio.getAudioContext(), key);
        await audio.samples({ [key]: [url] });
        this.buffers.set(asset.id, buffer);
      })();
      this.loading.set(asset.id, task);
      void task.catch(() => this.loading.delete(asset.id));
    }
    await this.loading.get(asset.id);
  }
  async trigger(asset: Asset, velocity = 100) {
    const epoch = this.epoch;
    await this.unlock(); await this.preload(asset);
    if (epoch !== this.epoch) return;
    const ac: AudioContext = audio.getAudioContext();
    const source = ac.createBufferSource(), gain = ac.createGain();
    source.buffer = this.buffers.get(asset.id)!;
    gain.gain.value = velocity / 127 * 0.65;
    source.connect(gain).connect(ac.destination);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }
  async select(slot: string, asset: Asset) {
    const request = (this.selectionRequests.get(slot) ?? 0) + 1;
    this.selectionRequests.set(slot, request);
    const epoch = this.epoch;
    await this.preload(asset);
    if (this.selectionRequests.get(slot) !== request || epoch !== this.epoch) return { cancelled: true };
    const cycle = this.timeline.select(slot, asset.id, this.repl.scheduler.started, this.repl.scheduler.lastEnd);
    this.changed(); return { cycle, cancelled: false };
  }
  stop() {
    this.performanceAudio.silence();
    this.epoch++;
    this.pendingCycle = undefined; this.pendingMuteCycle = undefined;
    this.repl.scheduler.stop(); draw.cleanupDraw(true);
    this.noteRequests.clear();
    for (const number of this.notes.keys()) this.noteOff(number);
    this.voices.forEach((source) => { try { source.stop(); } catch { /* already ended */ } });
    this.voices.clear(); audio.getSuperdoughAudioController().reset(); audio.resetGlobalEffects();
    this.changed();
  }
  panic() { this.stop(); }
  restore(project: Project) { this.panic(); this.timeline.reset(project.slots); this.selectionRequests.clear(); }
  get started() { return this.repl?.scheduler.started ?? false; }
  get cycle() { return this.started ? Math.max(0, this.repl.scheduler.now()) : 0; }
  get voicesPlaying() { return this.voices.size; }
  // Useful to feedback clients and browser acceptance tests; no private credentials.
  get diagnostics() { return { started: this.started, cycle: this.cycle, voices: this.voices.size, audioState: (audio.getAudioContext() as AudioContext).state, target: this.target, pendingCycle: this.pendingCycle, endCycle: Number.isFinite(this.endCycle) ? this.endCycle : null, notes: this.notes.size, buffers: this.buffers.size }; }
}
