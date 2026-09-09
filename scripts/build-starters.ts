// Original synthesized sounds and this generator are dedicated to CC0-1.0.
import { mkdir, writeFile } from 'node:fs/promises';
import { createNeonDrive } from '../studio/server/demo';
import { newProject, parseProject, AssetSchema } from '../studio/shared/model';
import { encodeWav } from '../studio/shared/wav';
const directory = new URL('../studio/client/public/starter/', import.meta.url);
await mkdir(directory, { recursive: true });
const names = ['kick', 'snare', 'closed-hat', 'open-hat', 'clap', 'tom'];
const assets = [];
for (const [index, name] of names.entries()) {
  const rate = 44100, duration = [.4, .24, .09, .4, .25, .4][index];
  const samples = new Float32Array(Math.round(rate * duration)); let seed = index + 1, phase = 0, previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1, high = (noise - previous) * .5; previous = noise;
    phase += 2 * Math.PI * (name === 'kick' ? 48 + 140 * Math.exp(-t * 35) : name === 'tom' ? 100 + 90 * Math.exp(-t * 22) : 180) / rate;
    const tone = Math.sin(phase);
    const value = name === 'kick' || name === 'tom' ? tone * Math.exp(-t * 13) : name === 'snare' ? (noise * .65 + tone * .35) * Math.exp(-t * 22) : name === 'clap' ? noise * Math.exp(-Math.max(0, t - .025) * 25) * (t < .03 ? (Math.floor(t * 400) % 2) : 1) : high * Math.exp(-t * (name === 'closed-hat' ? 60 : 15));
    samples[i] = value * .65 * Math.min(1, i / 40) * Math.min(1, (samples.length - i) / 100);
  }
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  await writeFile(new URL(`${id}.wav`, directory), new Uint8Array(encodeWav(samples, samples, rate).buffer));
  assets.push(AssetSchema.parse({ id, label: name, description: 'Original synthesized starter sound · CC0-1.0', tags: ['starter', 'CC0'], provider: 'upload', format: 'wav', duration, createdAt: '2026-09-09T00:00:00.000Z', pack: { id: '00000000-0000-4000-8000-000000000100', name: 'Studio Starter · CC0' }, source: { name: `${name}.wav` } }));
}
const project = newProject(); project.name = 'Drum Basics'; project.sessionId = 'Drum-Basics'; project.bpm = 120;
project.tabs[0].name = 'Drums'; project.tabs[0].code = '// Six original CC0 sounds. Import more from Sample library.\nsetCpm(120/4)\nstack(\n  s(soundSlot("kick")).struct("x ~ x ~"),\n  s(soundSlot("snare")).struct("~ x ~ x"),\n  s(soundSlot("hat")).struct("x*8").gain(0.4)\n).gain(0.7)';
project.slots = [0, 1, 2].map((i) => ({ name: ['kick', 'snare', 'hat'][i], assets: [assets[i].id], active: assets[i].id }));
project.assetIds = assets.slice(0, 3).map(a => a.id); project.clips = [{ id: 'drum-loop', tabId: 'pattern-1', trackId: 'track-1', start: 0, length: 8, muted: false }];
const neon = await createNeonDrive(); neon.sessionId = 'Neon-Drive';
await writeFile(new URL('manifest.json', directory), JSON.stringify({ assets, projects: [parseProject(project), neon] }, null, 2));
await writeFile(new URL('LICENSE.txt', directory), 'Studio Starter samples and scripts/build-starters.ts: CC0-1.0.\nOriginal procedural synthesis; no third-party recordings.\nhttps://creativecommons.org/publicdomain/zero/1.0/legalcode\n');
