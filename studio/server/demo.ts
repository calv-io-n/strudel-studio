import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newProject, ProjectSchema, type Binding, type Project, type Tab } from '../shared/model';
import { scaleCC } from '../shared/midi';
import { scanSliders } from '../shared/sliders';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const demoName = 'Neon-Drive';

export async function createNeonDrive(): Promise<Project> {
  const project = newProject();
  const tabs: Tab[] = await Promise.all(['Rhythm', 'Chords', 'Lead', 'Breakdown'].map(async name => {
    const id = `neon-${name.toLowerCase()}`;
    const code = await readFile(path.join(root, 'patterns/sets/neon-drive', `${name.toLowerCase()}.strudel`), 'utf8');
    return { id, name, code, anchors: scanSliders(code).map((slider, i) => ({ id: `${id}-slider-${i}`, from: slider.from, fingerprint: slider.fingerprint })) };
  }));
  const bindings: Binding[] = [
    { tabId: 'neon-lead', number: 20, label: 'Lead brightness' },
    { tabId: 'neon-rhythm', number: 21, label: 'Bass cutoff' },
  ].map(({ tabId, number, label }) => {
    const tab = tabs.find(tab => tab.id === tabId)!;
    const sliders = scanSliders(tab.code);
    const index = sliders.findIndex(slider => slider.label === 'lpf');
    if (index < 0) throw new Error(`The ${tab.name} pattern needs its filter slider for MIDI mapping.`);
    const slider = sliders[index];
    const knob = project.controls.find(control => control.kind === 'knob' && control.number === number)!;
    knob.label = label;
    knob.value = Math.round((slider.value - slider.min) / (slider.max - slider.min) * 127);
    if (scaleCC(knob.value, slider.min, slider.max, slider.step) !== slider.value) throw new Error(`${label} default does not match its MIDI control.`);
    return { id: `${tabId}-mapping`, profileId: 'virtual', channel: 1, kind: 'cc', number,
      target: { kind: 'slider', tabId, sliderId: tab.anchors[index].id }, pickup: false, enabled: true };
  });
  return ProjectSchema.parse({ ...project, name: 'Neon Drive', bpm: 168, tabs, activeTabId: 'neon-lead', bindings, slots: [],
    clips: [
      { id: 'intro', tabId: 'neon-chords', lane: 1, start: 0, length: 4 },
      { id: 'groove-rhythm', tabId: 'neon-rhythm', lane: 0, start: 4, length: 12 },
      { id: 'groove-lead', tabId: 'neon-lead', lane: 1, start: 4, length: 12 },
      { id: 'breakdown', tabId: 'neon-breakdown', lane: 1, start: 16, length: 4 },
      { id: 'final-rhythm', tabId: 'neon-rhythm', lane: 0, start: 20, length: 12 },
      { id: 'final-lead', tabId: 'neon-lead', lane: 1, start: 20, length: 12 },
    ],
  });
}

export async function installNeonDrive(directory = path.join(root, '.studio/projects')) {
  const project = await createNeonDrive();
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${demoName}.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(project, null, 2)}\n`, { flag: 'wx' });
  try {
    // Publish atomically without replacing an existing project, even if another installer races us.
    await link(temporary, file);
    return { file, created: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return { file, created: false };
  } finally { await unlink(temporary); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.loadEnvFile(path.join(root, '.env')); } catch { /* Optional local configuration. */ }
  const result = await installNeonDrive(process.env.STUDIO_DATA_DIR || undefined);
  console.log(result.created ? `Installed Neon Drive: ${result.file}` : `Neon Drive already exists; left unchanged: ${result.file}`);
  console.log('Run npm run dev, then Sessions → Neon Drive. Select Composition and press Play.');
}
