import { isClipMuted } from '../shared/mix';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as audio from '@strudel/webaudio';
import * as draw from '@strudel/draw';
import { transpiler } from '@strudel/transpiler';
import { arrangement, type Pattern } from '../shared/arrangement';
import { ProjectSchema, type Asset } from '../shared/model';
import { slotName } from '../shared/slots';
import { RenderOptionsSchema, renderMemory, assertRenderBudget } from '../shared/render-options';
import { encodeAudio } from './encode';
import { prepareTake, takePattern } from './take-playback';
const send = (message: object) => parent.postMessage(message, location.origin);
let started = false;
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'render' || started) return;
  started = true; const urls: string[] = [];
  try {
    const project = ProjectSchema.parse(event.data.project), options = RenderOptionsSchema.parse(event.data);
    const { target, cycles } = event.data;
    if (target !== 'composition' && !project.tabs.some(tab => tab.id === target)) throw new Error('Choose a pattern to export.');
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 4096) throw new Error('Invalid export length.');
    if (target === 'composition' && !project.clips.length) throw new Error('Add patterns to Composition first.');
    const context = new OfflineAudioContext(2, 1, options.rate);
    audio.setAudioContext(context); mini.miniAllStrings(); audio.registerSynthSounds(); audio.registerZZFXSounds();
    const snapshots = new Map<string, { asset: Asset; blob: Blob; url: string }>();
    let assetBytes = 0;
    for (const entry of event.data.audio as { asset: Asset; bytes: ArrayBuffer }[]) {
      assetBytes += entry.bytes.byteLength * 3;
      assertRenderBudget(assetBytes);
      const blob = new Blob([entry.bytes], { type: entry.asset.format === 'wav' ? 'audio/wav' : 'audio/mpeg' });
      const url = URL.createObjectURL(blob); urls.push(url); snapshots.set(entry.asset.id, { asset: entry.asset, blob, url });
    }
    await audio.samples(Object.fromEntries([...snapshots.values()].map(({ asset, url }) => [`studio_${asset.id.replaceAll('-', '')}`, [url]])));
    await core.evalScope(core, mini, tonal, audio, draw, {
      samples: () => { throw new Error('Install external samples in the catalogue before rendering.'); },
      sliderWithID: (_id: string, value: number) => core.pure(value),
      soundSlot: (argument: string | { __pure: string }) => {
        const name = slotName(argument), asset = project.slots.find(slot => slot.name === name)?.active;
        if (!asset || !snapshots.has(asset)) throw new Error(`Sound slot ${name} is empty or missing audio. Install or recover it before rendering.`);
        return core.pure(`studio_${asset.replaceAll('-', '')}`);
      },
    });
    const compiler = core.repl({ transpiler, getTime: () => 0, beforeEval: async () => {
      if (target === 'composition') await core.evalScope({ setCpm: () => core.silence, setcpm: () => core.silence, setCps: () => core.silence, setcps: () => core.silence });
    } });
    const patterns = new Map<string, Pattern>(), clips = project.clips.map(c => ({ ...c, muted: isClipMuted(c, project.tracks, project.soloTrackId) }));
    const ids = target === 'composition' ? [...new Set(clips.filter(c => !c.muted && !c.takeId).map(c => c.tabId))] : [target];
    let cps = project.bpm / 240;
    for (const id of ids) {
      const tab = project.tabs.find(tab => tab.id === id)!;
      if (/\b(?:Math\s*\.\s*random|Date|fetch|WebSocket|navigator|MIDI|AUDIO)\b/.test(tab.code.replace(/\/\/[^\n]*/g, ''))) throw new Error(`${tab.name}: capture live/external state before rendering. Nondeterministic JavaScript is unsupported.`);
      send({ type: 'progress', text: `Preparing ${tab.name}…` });
      compiler.scheduler.setCps(target === 'composition' ? cps : .5);
      await compiler.evaluate(tab.code.trim() || 'silence', false);
      if (compiler.state.evalError) throw new Error(`${tab.name}: ${compiler.state.evalError.message}`);
      patterns.set(id, compiler.state.pattern);
      if (target !== 'composition') cps = compiler.scheduler.cps;
    }
    const end = target === 'composition' ? Math.max(...clips.map(c => c.start + c.length)) : cycles;
    const seconds = end / cps + options.tail;
    if (!Number.isFinite(seconds) || cps <= 0 || seconds > 900) throw new Error('Export must be no longer than 15 minutes with a valid tempo.');
    assertRenderBudget(renderMemory(seconds, options.rate, options.format, assetBytes, 0));
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * options.rate), options.rate);
    audio.setAudioContext(offline); audio.setSuperdoughAudioController(null); audio.resetGlobalEffects(); await audio.initAudio();
    let takeVoices = 0;
    if (target === 'composition') for (const clip of clips.filter(c => !c.muted && c.takeId)) {
      const snapshot = snapshots.get(clip.takeId!); if (!snapshot) throw new Error(`Take ${clip.takeId} is missing. Restore its backup.`);
      await prepareTake(snapshot.asset, project, offline, snapshot.blob); patterns.set(clip.id, takePattern(clip, snapshot.asset, cps)); takeVoices++;
    }
    const pattern = target === 'composition' ? arrangement(clips, patterns) : patterns.get(target)!;
    const windows: { value: any; at: number; duration: number }[][] = [];
    const loaded = new Set<string>(); let count = 0;
    // Query exactly once. Playback consumes this frozen event schedule, including random choices.
    for (let cycle = 0; cycle < end; cycle++) {
      const haps = (pattern as any).queryArc(cycle, Math.min(cycle + 1, end), { _cps: cps }).filter((hap: any) => hap.hasOnset()).sort((a: any, b: any) => Number(a.whole.begin) - Number(b.whole.begin));
      const window: { value: any; at: number; duration: number }[] = [];
      for (const hap of haps) {
        hap.ensureObjectValue(); const value = structuredClone(hap.value), name = value.bank ? `${value.bank}_${value.s}` : value.s;
        if (name) {
          const sound = audio.getSound(name); if (!sound) throw new Error(`Sound ${name} is missing or requires live/external state. Install or freeze it first.`);
          if (sound.data?.samples) {
            const info = audio.getSampleInfo(value, sound.data.samples);
            if (!urls.includes(info.url)) throw new Error(`External sound ${name} is not in this render snapshot. Import it first.`);
            if (!loaded.has(info.url)) { const buffer = await audio.loadBuffer(info.url, offline, name); assetBytes += buffer.length * buffer.numberOfChannels * 4; loaded.add(info.url); }
          }
        }
        if (value.ir || value.orbit !== undefined || value.bus !== undefined || value.source !== undefined) throw new Error('External impulse responses and shared custom routing must be frozen before export.');
        for (const v of Object.values(value)) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Pattern produced NaN or Infinity.');
        window.push({ value, at: Number(hap.whole.begin), duration: Number(hap.duration) });
        count++; if (count > 100000) throw new Error('Render exceeds 100,000 scheduled events. Shorten the selection.');
      }
      windows.push(window); assertRenderBudget(renderMemory(seconds, options.rate, options.format, assetBytes, count, takeVoices));
    }
    let rendering: Promise<AudioBuffer> | undefined;
    for (let cycle = 0; cycle < windows.length; cycle++) {
      send({ type: 'progress', text: `Rendering audio · ${Math.round(cycle / end * 100)}%` });
      for (const hap of windows[cycle]) await audio.superdough(hap.value, hap.at / cps, hap.duration / cps, cps, hap.at);
      const pause = cycle + 1 < windows.length ? offline.suspend((cycle + .5) / cps) : undefined;
      if (!rendering) rendering = offline.startRendering(); else await offline.resume();
      if (pause) await Promise.race([pause, rendering]);
    }
    send({ type: 'progress', text: 'Rendering effect tail…' });
    const rendered = await rendering!;
    send({ type: 'progress', text: 'Encoding WAV…' });
    const result = await encodeAudio(rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice(), options.rate, { format: options.format, dither: options.format !== 'float32' && options.dither });
    parent.postMessage({ type: 'complete', ...result, seconds: rendered.duration }, location.origin, [result.buffer]);
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Audio export failed.' }); }
  finally { urls.forEach(url => URL.revokeObjectURL(url)); }
});
send({ type: 'ready' });
