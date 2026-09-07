import { isClipMuted } from '../shared/mix';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as audio from '@strudel/webaudio';
import * as fonts from '@strudel/soundfonts';
import * as draw from '@strudel/draw';
import { transpiler } from '@strudel/transpiler';
import { arrangement, type Pattern } from '../shared/arrangement';
import { ProjectSchema, type Asset } from '../shared/model';
import { slotName } from '../shared/slots';
import { encodeWav } from '../shared/wav';

const send = (message: object) => parent.postMessage(message, location.origin);
let started = false;
window.addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'render' || started) return;
  started = true;
  try {
    const project = ProjectSchema.parse(event.data.project);
    const { target, cycles, tail } = event.data;
    if (target !== 'composition' && !project.tabs.some(tab => tab.id === target)) throw new Error('Choose a pattern to export.');
    if (!Number.isInteger(cycles) || cycles < 1 || cycles > 4096 || !Number.isFinite(tail) || tail < 0 || tail > 15) throw new Error('Invalid export length.');
    if (target === 'composition' && !project.clips.length) throw new Error('Add patterns to Composition first, or export the current tab.');
    // This frame owns its audio graph, compiler globals and sample registry.
    const context = new OfflineAudioContext(2, 1, 44100);
    audio.setAudioContext(context);
    mini.miniAllStrings(); audio.registerSynthSounds(); audio.registerZZFXSounds();
    await core.evalScope(core, mini, tonal, audio, fonts, draw, {
      sliderWithID: (_id: string, value: number) => core.pure(value),
      soundSlot: (argument: string | { __pure: string }) => {
        const name = slotName(argument);
        const asset = project.slots.find(slot => slot.name === name)?.active;
        return asset ? core.pure(`studio_${asset.replaceAll('-', '')}`) : core.silence;
      },
    });
    const assets: Asset[] = event.data.assets;
    await audio.samples(Object.fromEntries(assets.map(asset => [`studio_${asset.id.replaceAll('-', '')}`, [new URL(`/api/samples/${asset.id}/audio`, location.origin).href]])));
    const compiler = core.repl({ transpiler, getTime: () => 0, beforeEval: async () => {
      if (target === 'composition') await core.evalScope({ setCpm: () => core.silence, setcpm: () => core.silence, setCps: () => core.silence, setcps: () => core.silence });
    } });
    const patterns = new Map<string, Pattern>();
    const ids = target === 'composition' ? [...new Set(project.clips.map(clip => clip.tabId))] : [target];
    let cps = project.bpm / 240;
    for (const id of ids) {
      const tab = project.tabs.find(tab => tab.id === id)!;
      send({ type: 'progress', text: `Preparing ${tab.name}…` });
      compiler.scheduler.setCps(target === 'composition' ? cps : 0.5);
      await compiler.evaluate(tab.code.trim() || 'silence', false);
      if (compiler.state.evalError) throw new Error(`${tab.name}: ${compiler.state.evalError.message}`);
      patterns.set(id, compiler.state.pattern);
      if (target !== 'composition') cps = compiler.scheduler.cps;
    }
    const end = target === 'composition' ? Math.max(...project.clips.map(clip => clip.start + clip.length)) : cycles;
    const seconds = end / cps + tail;
    if (!Number.isFinite(seconds) || cps <= 0 || seconds > 900) throw new Error('Export must be no longer than 15 minutes with a valid tempo.');
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * 44100), 44100);
    audio.setAudioContext(offline); audio.setSuperdoughAudioController(null); audio.resetGlobalEffects();
    await audio.initAudio();
    const pattern = target === 'composition' ? arrangement(project.clips.map(c => ({ ...c, muted: isClipMuted(c, project.tracks, project.soloTrackId) })), patterns) : patterns.get(target)!;
    // Schedule in onset order, a cycle at a time, to preserve cut groups without a huge event list.
    let rendering: Promise<AudioBuffer> | undefined;
    for (let cycle = 0; cycle < end; cycle++) {
      send({ type: 'progress', text: `Rendering audio · ${Math.round(cycle / end * 100)}%` });
      const haps = (pattern as any).queryArc(cycle, Math.min(cycle + 1, end), { _cps: cps })
        .filter((hap: any) => hap.hasOnset()).sort((a: any, b: any) => Number(a.whole.begin) - Number(b.whole.begin));
      for (const hap of haps) {
        hap.ensureObjectValue();
        await audio.superdough(hap.value, Number(hap.whole.begin) / cps, Number(hap.duration) / cps, cps, Number(hap.whole.begin));
      }
      // Pause ahead of the next onset: suspension rounds to an audio block boundary.
      // This lookahead avoids losing downbeats and lets finished voices be released.
      const pause = cycle + 1 < end ? offline.suspend((cycle + 0.5) / cps) : undefined;
      if (!rendering) rendering = offline.startRendering();
      else await offline.resume();
      if (pause) await Promise.race([pause, rendering]);
    }
    send({ type: 'progress', text: 'Rendering effect tail…' });
    const rendered = await rendering!;
    const { buffer, clipped } = encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), rendered.sampleRate);
    parent.postMessage({ type: 'complete', buffer, seconds: rendered.duration, clipped }, location.origin, [buffer]);
  } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'Audio export failed.' }); }
});
send({ type: 'ready' });
