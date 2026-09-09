import { sampleUrl, releaseSampleUrls } from './storage/workspace';
import { instrumentFor, validateInstrumentInput, MIDI_EDITOR } from '../shared/midi-instrument';
import { reconcileSliders, type Slider } from '../shared/sliders';
import { LiveEffects } from './live-effects';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as audio from '@strudel/webaudio';
import * as draw from '@strudel/draw';
import * as fonts from '@strudel/soundfonts';
import { transpiler } from '@strudel/transpiler';
import { SlotTimeline, slotName } from '../shared/slots';
import { arrangement, loopRange, transportPattern, MuteTimeline, PatternTimeline, type Pattern } from '../shared/arrangement';
import type { Destination } from '../shared/performance';
import type { Asset, Project, Clip } from '../shared/model';
import type { StudioEditor } from './editor';
import { PerformanceAudio, assertIsolated } from './performance-audio';
import { soundCatalog, soundKey } from './completions';

type Scheduler = { started: boolean; lastEnd: number; cps: number; now(): number; stop(): void; setCps(cps: number): void; setPattern(pattern: Pattern, start?: boolean): Promise<void> };
type Repl = { scheduler: Scheduler; state: { evalError?: Error; pattern?: { queryArc(a: number, b: number): unknown[] } }; evaluate(code: string, start: boolean): Promise<unknown> };
export class Engine {
  private instrumentPattern?: Pattern;
  private instrumentInput?: { pitch: number; velocity: number };
  private instrumentSerial = 0;
  private instrumentCompileSliders?: Slider[];
  private instrumentPreparation?: Promise<void>;
  readonly instrumentAudio = new PerformanceAudio();
  instrumentError = '';
  private instrumentValues(hap: any) {
    const controls: Record<string, string> = {};
    for (const [key, value] of Object.entries(hap.context ?? {})) if (key.startsWith('studioControl_')) {
      const control = value as { key: string; label: string };
      controls[control.label === 'lpf' ? 'cutoff' : control.label] = control.key;
    }
    return this.liveEffects.wrap(hap.value, controls);
  }
  async applyInstrument(code = instrumentFor(this.project()).code) {
    if (this.compilingBusy) throw new Error('Wait for the current compilation.');
    this.compilingBusy = true;
    const owner = this.editorFor(MIDI_EDITOR);
    const config = instrumentFor(this.project());
    const input = { pitch: 60, velocity: 100 };
    const epoch = this.epoch;
    try {
      validateInstrumentInput(code);
      this.compiling = owner;
      this.instrumentCompileSliders = reconcileSliders(code, [], undefined, code === owner.code ? owner.anchors : config.appliedAnchors ?? []);
      await core.evalScope({ MIDI: new core.Pattern((state: any) => core.note(input.pitch).velocity(input.velocity / 127).query(state)) });
      const compiler = core.repl({ transpiler });
      await compiler.evaluate(code, false);
      if (compiler.state.evalError) throw compiler.state.evalError;
      const pattern = compiler.state.pattern as Pattern | undefined;
      if (!pattern) throw new Error('The MIDI instrument must return a Strudel pattern.');
      {
        const haps = pattern.queryArc(0, 1);
        if (!haps.length) throw new Error('The instrument must produce notes in its first cycle.');
        for (const hap of haps) {
          if (typeof hap.value?.s !== 'string') throw new Error('Choose an instrument with .s("sound").');
          assertIsolated(hap.value);
        }
      }
      if (epoch !== this.epoch) throw new Error('The session changed during compilation. Apply again.');
      if (this.instrumentPattern) { this.releaseInputNotes(); this.instrumentAudio.silence(); }
      this.instrumentPattern = pattern; this.instrumentInput = input;
      this.instrumentError = '';
    } catch (error) { this.instrumentError = (error as Error).message; throw error; }
    finally {
      this.compiling = undefined; this.instrumentCompileSliders = undefined; this.compilingBusy = false;
      await core.evalScope({ MIDI: core.silence });
      core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern);
    }
  }
  async prepareInstrument() {
    if (!this.instrumentPattern) {
      this.instrumentPreparation ??= this.applyInstrument(instrumentFor(this.project()).appliedCode).finally(() => { this.instrumentPreparation = undefined; });
      await this.instrumentPreparation;
    }
  }
  stopInstrument() { this.instrumentAudio.silence(); this.releaseInputNotes(); }
  private midiSolo = false;
  updateMidiDestination(destination: Destination) { if (this.midiSection) this.midiSection.destination = destination; }
  soloMidi(solo: boolean) { this.midiSolo = solo; }
  private midiPitch = 60;
  private midiVelocity = 100;
  private midiPattern?: Pattern;
  private compileShift?: { from: number; delta: number };
  private midiSection?: { clip: Clip; destination: Destination; begin: number; end: number; mode: 'live' | 'original' | 'take'; proposal?: Pattern; queued?: { mode: 'live' | 'original' | 'take'; proposal?: Pattern; at: number } };
  async prepareMidi(owner: StudioEditor, destination: Destination) {
    if (this.busy) throw new Error('Wait for playback preparation.');
    await this.unlock();
    this.compilingBusy = true; this.compiling = owner;
    const expression = 'studioMidiNote()';
    this.compileShift = { from: destination.to, delta: expression.length - (destination.to - destination.from) };
    try {
      const compiler = core.repl({ transpiler });
      await compiler.evaluate(owner.code.slice(0, destination.from) + expression + owner.code.slice(destination.to), false);
      if (compiler.state.evalError) throw compiler.state.evalError;
      this.midiPattern = compiler.state.pattern as Pattern;
      const tagged = this.midiPattern.queryArc(0, 64).filter((h: any) => h.value?.studioMidiTarget);
      if (!tagged.length) throw new Error('This expression does not produce playable MIDI notes.');
      for (const hap of tagged) {
        if (typeof hap.value.s !== 'string') throw new Error('Choose a sound with .s(...) on this note before using MIDI.');
        try { assertIsolated(hap.value); } catch { throw new Error(`The selected ${hap.value.s} uses shared audio routing that cannot be isolated for MIDI transcription.`); }
      }
    } finally {
      this.compiling = undefined; this.compileShift = undefined; this.compilingBusy = false;
      core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern);
    }
  }
  midiValues(pitch: number, velocity: number, phase: number) {
    this.midiPitch = pitch; this.midiVelocity = velocity;
    const haps = this.midiPattern?.queryArc(phase, phase + .00001).filter((h: any) => h.value?.studioMidiTarget) ?? [];
    return haps.map((hap: any) => {
      const controls: Record<string, string> = {};
      for (const [key, value] of Object.entries(hap.context ?? {})) if (key.startsWith('studioControl_')) {
        const control = value as { key: string; label: string }; controls[control.label === 'lpf' ? 'cutoff' : control.label] = control.key;
      }
      return this.liveEffects.wrap(hap.value, controls);
    });
  }
  async startMidiSection(owner: StudioEditor, destination: Destination, clip: Clip, begin: number, end: number) {
    if (begin < 0 || end > this.arrangementLength || end <= begin) throw new Error('Choose a nonempty range inside the composition.');
    this.stop();
    await this.prepareMidi(owner, destination);
    this.midiSection = { clip, destination, begin, end, mode: 'live' };
    try { await this.compile('composition', false); } catch (error) { this.midiSection = undefined; throw error; }
  }
  async reviewMidi(mode: 'original' | 'take' | 'live', owner: StudioEditor, code?: string) {
    const section = this.midiSection;
    if (!section) throw new Error('The loop stopped. Use Play again to resume the section.');
    let proposal = section.proposal;
    if (mode === 'take') {
      if (this.busy) throw new Error('Wait for playback preparation.');
      this.compilingBusy = true; this.compiling = owner;
      const offset = (section.clip.sourceOffset ?? 0) + section.begin - section.clip.start;
      const expression = `(${code}).late(${offset}).set({studioMidiTarget: true})`;
      this.compileShift = { from: section.destination.to, delta: expression.length - (section.destination.to - section.destination.from) };
      try {
        const compiler = core.repl({ transpiler });
        await compiler.evaluate(owner.code.slice(0, section.destination.from) + expression + owner.code.slice(section.destination.to), false);
        if (compiler.state.evalError) throw compiler.state.evalError;
        proposal = compiler.state.pattern as Pattern;
      } finally { this.compiling = undefined; this.compileShift = undefined; this.compilingBusy = false; core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern); }
    }
    const length = section.end - section.begin;
    if (section.queued && section.queued.at <= this.cycle) { section.mode = section.queued.mode; section.proposal = section.queued.proposal; }
    section.queued = { mode, proposal, at: Math.ceil((this.repl.scheduler.lastEnd + .00001) / length) * length };
  }
  get midiMode() { const s = this.midiSection; return s?.queued && s.queued.at <= this.cycle ? s.queued.mode : s?.mode; }
  endMidiSection() { if (this.midiSection) this.stop(); }
  jam?: { tabId: string; begin: number; end: number };
  private appliedCodes = new Map<string, string>();
  private suppressed = new Map<string, Pattern>();
  async startJam(tabId: string, begin: number, end: number) {
    const maximum = Math.max(0, ...this.project().clips.map(c => c.start + c.length));
    if (begin < 0 || end <= begin || end > maximum || !Number.isFinite(end)) throw new Error('Choose a loop range inside the composition.');
    this.stop(); this.jam = { tabId, begin, end };
    try { await this.compile('composition', false); } catch (error) { this.jam = undefined; throw error; }
  }
  endJam() { if (this.jam) this.stop(); }
  get destinationTabId() { return this.jam?.tabId ?? this.project().activeTabId; }
  get arrangementLength() { return Math.max(0, ...this.project().clips.map(c => c.start + c.length)); }
  async suppressPhrase(owner: StudioEditor, tabId: string, original: string, enabled: boolean) {
    if (!enabled) { this.suppressed.delete(tabId); return; }
    const code = this.appliedCodes.get(tabId);
    if (!code || code.indexOf(original) < 0 || code.indexOf(original) !== code.lastIndexOf(original)) throw new Error('The selected phrase must occur once in the playing version. Apply the intended code before suppressing it.');
    if (this.compilingBusy) throw new Error('Wait for the current compilation.');
    this.compilingBusy = true; this.compiling = owner;
    try {
      await this.compiler.evaluate(code.replace(original, 'silence'.padEnd(original.length)), false);
      if (this.compiler.state.evalError) throw this.compiler.state.evalError;
      this.suppressed.set(tabId, this.compiler.state.pattern as Pattern);
    } finally {
      this.compiling = undefined; this.compilingBusy = false;
      core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern);
    }
  }
  readonly liveEffects = new LiveEffects();
  get audioContext(): AudioContext { return audio.getAudioContext(); }
  get tempo() { return this.project().bpm; }
  isolatePerformance(isolated: boolean) {
    if (isolated) { for (const note of this.notes.keys()) this.noteOff(note); this.voices.forEach(source => { try { source.stop(); } catch { /* ended */ } }); }
    const output = audio.getSuperdoughAudioController().output.destinationGain;
    if (output) output.gain.setTargetAtTime(isolated ? 0 : 1, audio.getAudioContext().currentTime, .01);
  }
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
      if (typeof haps[0].value.s !== 'string') throw new Error('This selection does not identify its instrument. Select the complete sound expression, or open Timing and accompaniment to choose the fallback synth.');
      assertIsolated(haps[0].value);
      const controls: Record<string, string> = {};
      const destination = owner.destination;
      for (const slider of owner.sliders) if (destination && slider.start >= destination.to && slider.end <= destination.to + soundCode.length) controls[slider.label === 'lpf' ? 'cutoff' : slider.label] = slider.id;
      return this.refreshPerformanceValues({ ...this.liveEffects.wrap(haps[0].value, controls), studioPerformanceControls: controls }, owner);
    } finally {
      core.setTime(() => this.repl.scheduler.now()); core.setCpsFunc(() => this.repl.scheduler.cps); core.setPattern(this.repl.state.pattern);
      this.compilingBusy = false;
    }
  }
  refreshPerformanceValues(values: Record<string, any>, owner: StudioEditor) {
    const next: Record<string, any> = { ...values, studioInitial: { ...values.studioInitial } };
    for (const [parameter, id] of Object.entries(values.studioPerformanceControls ?? {})) {
      const value = owner.values.get(id as string); if (value === undefined) continue;
      if (values.studioLive?.[parameter]) next.studioInitial[parameter] = value; else next[parameter] = value;
    }
    return next;
  }
  private library: Asset[] = [];
  get soundEntries() { return soundCatalog(Object.keys(audio.soundMap.get()).filter(key => !key.startsWith('studio_live_voice') && key !== 'studio_controlled_voice'), this.library); }
  get functionNames(): string[] {
    return [...new Set([...Object.entries({ ...core, ...mini, ...tonal, ...audio, ...draw, ...fonts })
      .filter(([, value]) => typeof value === 'function').map(([name]) => name), ...Object.getOwnPropertyNames(core.Pattern.prototype), 'slider', 'soundSlot'])]
      .filter(name => /^[a-zA-Z]\w*$/.test(name) && name !== 'constructor').sort();
  }
  async registerAssets(assets: Asset[]) {
    this.library = assets;
    releaseSampleUrls(assets.map(a => a.id));
    await audio.samples(Object.fromEntries(await Promise.all(assets.filter(a => !a.missing).map(async asset => [soundKey(asset), [await sampleUrl(asset.id)]]))));
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
  private notes = new Map<string, { stop(): void }>();
  private noteRequests = new Map<string, object>();
  private selectionRequests = new Map<string, number>();
  constructor(private editorFor: (id?: string) => StudioEditor, private project: () => Project, private changed: () => void, private error: (message: string) => void) {}
  async setup(project: Project) {
    mini.miniAllStrings();
    audio.registerSynthSounds(); audio.registerZZFXSounds();
    await core.evalScope(core, mini, tonal, audio, draw, fonts, {
      studioMidiNote: () => new core.Pattern((state: any) => core.note(this.midiPitch).velocity(this.midiVelocity / 127).set({ studioMidiTarget: true }).query(state)),
      sliderWithID: (runtimeId: string, value: number) => {
        let from = Number(runtimeId.replace('slider_', ''));
        if (this.compileShift && from >= this.compileShift.from + this.compileShift.delta) from -= this.compileShift.delta;
        const owner = this.compiling!;
        const slider = (this.instrumentCompileSliders ?? owner.sliders).find((s) => s.from === from);
        if (!slider) return core.pure(value);
        const stableId = slider.id;
        const revision = owner.liveVersions.get(stableId) ?? 0;
        return core.ref(() => (owner.liveVersions.get(stableId) ?? 0) !== revision ? owner.values.get(stableId) ?? value : value)
          .withContext((context: object) => ({ ...context, [`studioControl_${stableId}`]: { key: stableId, label: slider.label } }));
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
      defaultOutput: (hap: any, deadline: number, duration: number, cps: number, time: number) => {
        const controls: Record<string, string> = {};
        for (const [key, control] of Object.entries(hap.context ?? {})) if (key.startsWith('studioControl_')) {
          const item = control as { key: string; label: string }; controls[item.label === 'lpf' ? 'cutoff' : item.label] = item.key;
        }
        return audio.webaudioOutput(hap.withValue((value: any) => this.liveEffects.wrap(value, controls)), deadline, duration, cps, time);
      },
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
  transport = { position: 0, begin: 0, end: 4, loop: false };
  private compositionBase?: Pattern;
  private transportStart = 0;
  get timelinePosition() {
    if (!this.started || this.target !== 'composition') return this.transport.position;
    if (this.midiSection) return this.midiSection.begin + this.cycle % (this.midiSection.end - this.midiSection.begin);
    const position = this.transportStart + this.cycle;
    return this.transport.loop ? this.transport.begin + ((position - this.transport.begin) % (this.transport.end - this.transport.begin) + this.transport.end - this.transport.begin) % (this.transport.end - this.transport.begin) : Math.min(position, this.arrangementLength);
  }
  private timelinePattern(pattern: Pattern) {
    const t = this.transport;
    return transportPattern(pattern, this.transportStart, t.begin, t.loop ? t.end : this.arrangementLength, t.loop);
  }
  async playComposition() {
    if (this.busy) return;
    const t = this.transport;
    if (t.loop && (t.position < t.begin || t.position >= t.end)) t.position = t.begin;
    if (t.position >= this.arrangementLength) t.position = t.loop ? t.begin : 0;
    this.transportStart = t.position;
    return this.evaluate(true, 'composition');
  }
  async seek(position: number) {
    if (this.midiSection) throw new Error('Finish MIDI capture or review before seeking.');
    if (this.busy) throw new Error('Wait for playback preparation.');
    const resume = this.started && this.target === 'composition';
    const base = this.compositionBase, cps = this.repl.scheduler.cps;
    if (resume) this.stop();
    this.transport.position = Math.min(this.arrangementLength, Math.max(0, position));
    this.transportStart = this.transport.position;
    if (resume && base && this.transport.position < this.arrangementLength) {
      this.mutes.reset(this.project().clips, this.project().tracks, this.project().soloTrackId);
      this.patterns.reset(this.timelinePattern(base));
      this.repl.scheduler.setCps(cps); this.target = 'composition';
      this.endCycle = this.transport.loop ? Infinity : this.arrangementLength - this.transportStart;
      this.repl.state.pattern = this.patterns.pattern();
      await this.repl.scheduler.setPattern(this.patterns.pattern(), true);
    }
    this.changed();
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
        let code = this.compiling.code;
        const revision = this.compiling.revision;
        const section = this.midiSection;
        if (section?.clip.tabId === id) {
          const d = section.destination;
          const insertion = '.set({studioMidiTarget: true})';
          code = code.slice(0, d.to) + insertion + code.slice(d.to);
          this.compileShift = { from: d.to, delta: insertion.length };
        }
        this.compiler.scheduler.setCps(target === 'composition' ? project.bpm / 240 : .5);
        await this.compiler.evaluate(code.trim() ? code : 'silence', false);
        if (this.compiler.state.evalError) throw new Error(`${tab.name}: ${this.compiler.state.evalError.message}`);
        if (epoch !== this.epoch) return;
        this.compileShift = undefined;
        const compiled = this.compiler.state.pattern as Pattern;
        if (section?.clip.tabId === id) {
          const wide = section.begin < section.clip.start || section.end > section.clip.start + section.clip.length;
          for (const c of clips.filter(c => wide ? c.tabId === id : c.id === section.clip.id)) next.set(c.id, new core.Pattern((state: any) => {
            const absolute = Number(state.span.begin) + (state.controls?.studioCycleOffset ?? 0);
            const version = section.queued && absolute >= section.queued.at ? section.queued : section;
            const chosen = !wide && version.mode === 'take' ? version.proposal ?? compiled : compiled;
            return chosen.query(state).filter((h: any) => !h.value?.studioMidiTarget || (wide ? version.mode === 'original' : version.mode !== 'live'));
          }));
        }
        next.set(id, new core.Pattern((state: any) => (this.suppressed.get(id) ?? compiled).query(state))); codes.set(id, revision);
        this.appliedCodes.set(id, code);
        if (target !== 'composition') cps = this.compiler.scheduler.cps;
      }
      if (epoch !== this.epoch) return;
      let pattern = target === 'composition' ? arrangement(clips, next, this.mutes, () => this.jam?.tabId) : next.get(target)!;
      if (this.midiSection && target === 'composition') {
        const composed = pattern; const section = this.midiSection;
        const wide = section.begin < section.clip.start || section.end > section.clip.start + section.clip.length;
        const overlayClip = { ...section.clip, start: section.begin, length: section.end - section.begin, sourceOffset: (section.clip.sourceOffset ?? 0) + section.begin - section.clip.start };
        const overlay = arrangement([overlayClip], new Map([[section.clip.tabId, new core.Pattern((state: any) => {
          const absolute = Number(state.span.begin) + (state.controls?.studioCycleOffset ?? 0);
          const version = section.queued && absolute >= section.queued.at ? section.queued : section;
          return version.mode === 'take' ? (version.proposal?.query(state) ?? []).filter((h: any) => h.value?.studioMidiTarget) : [];
        })]]));
        pattern = new core.Pattern((state: any) => [...composed.query(state), ...(wide ? overlay.query(state) : [])].filter((h: any) => !this.midiSolo || h.value?.studioClipId === section.clip.id && h.value?.studioMidiTarget));
        pattern = loopRange(pattern, section.begin, section.end);
      }
      if (this.jam && target === 'composition') pattern = loopRange(pattern, this.jam.begin, this.jam.end);
      const base = target === 'composition' && !this.jam && !this.midiSection ? pattern : undefined;
      if (base) pattern = this.timelinePattern(base);
      // Check queries before replacing a working performance.
      pattern.queryArc(0, 1);
      if (!Number.isFinite(cps) || cps <= 0) throw new Error('Tempo must be greater than zero.');
      if (base) this.compositionBase = base;
      if (update) {
        this.pendingCycle = this.patterns.queue(pattern, this.repl.scheduler.lastEnd);
        // Applying a tempo change with lookahead needs a separate clock transition.
        // Keep the running tempo; new code tempo takes effect on the next Play.
      } else {
        this.mutes.reset(this.project().clips, this.project().tracks, this.project().soloTrackId);
        this.patterns.reset(pattern);
        this.repl.scheduler.setCps(cps);
        this.target = target;
        this.endCycle = target === 'composition' && !this.jam && !this.midiSection ? (this.transport.loop ? Infinity : Math.max(...clips.map(c => c.start + c.length)) - this.transportStart) : Infinity;
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
  async noteOn(number: number, velocity: number, key = String(number)) {
    const epoch = this.epoch;
    this.noteOff(key);
    const request = {}; this.noteRequests.set(key, request);
    await this.unlock();
    if (epoch !== this.epoch || this.noteRequests.get(key) !== request) return;
    if (!instrumentFor(this.project()).enabled) { this.noteRequests.delete(key); return; }
    await this.prepareInstrument();
    if (epoch !== this.epoch || this.noteRequests.get(key) !== request || !instrumentFor(this.project()).enabled) return;
    this.instrumentInput!.pitch = number; this.instrumentInput!.velocity = velocity;
    const phase = this.started ? this.cycle : this.instrumentAudio.time * this.project().bpm / 240;
    const haps = this.instrumentPattern!.queryArc(phase, phase + .00001);
    const keys = haps.map((_: any, i: number) => `instrument:${number}:${i}:${this.instrumentSerial++}`);
    this.notes.set(key, { stop: () => keys.forEach(key => this.instrumentAudio.release(key)) });
    try {
      await Promise.all(haps.map((hap: any, i: number) => {
        assertIsolated(hap.value);
        const values = this.instrumentValues(hap);
        return this.instrumentAudio.play(keys[i], values, values.note ?? number, (values.velocity ?? velocity / 127) * 127);
      }));
    } catch (error) { if (this.noteRequests.get(key) === request) this.noteOff(key); throw error; }
  }
  noteOff(key: string | number) { const id = String(key); this.noteRequests.delete(id); const voice = this.notes.get(id); if (voice) { voice.stop(); this.notes.delete(id); } }
  releaseInputNotes() { this.noteRequests.clear(); for (const key of this.notes.keys()) this.noteOff(key); }

  async preload(asset: Asset) {
    if (this.buffers.has(asset.id)) return;
    if (!this.loading.has(asset.id)) {
      const task = (async () => {
        const url = await sampleUrl(asset.id);
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
    this.stopInstrument();
    if (this.started && this.target === 'composition') this.transport.position = this.timelinePosition;
    this.jam = undefined; this.midiSection = undefined; this.midiSolo = false; this.suppressed.clear();
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
  restore(project: Project) { this.panic(); this.applied.clear(); this.appliedCodes.clear(); this.instrumentPattern = undefined; this.instrumentInput = undefined; this.instrumentPreparation = undefined; this.instrumentError = ''; this.transport = { position: 0, begin: 0, end: 4, loop: false }; this.compositionBase = undefined; this.timeline.reset(project.slots); this.selectionRequests.clear(); }
  get started() { return this.repl?.scheduler.started ?? false; }
  get cycle() { return this.started ? Math.max(0, this.repl.scheduler.now()) : 0; }
  get voicesPlaying() { return this.voices.size; }
  // Useful to feedback clients and browser acceptance tests; no private credentials.
  get diagnostics() { return { started: this.started, cycle: this.cycle, voices: this.voices.size, audioState: (audio.getAudioContext() as AudioContext).state, target: this.target, pendingCycle: this.pendingCycle, endCycle: Number.isFinite(this.endCycle) ? this.endCycle : null, notes: this.notes.size, buffers: this.buffers.size }; }
}
