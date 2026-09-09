import { z } from 'zod';
import { AssetSchema, ProjectSchema } from '../../shared/model';
import { read, write, exclusive, type Write } from './database';
export async function seedStarters() {
  if (await read('settings', 'synth-starter-version')) return;
  const response = await fetch('/starter/manifest.json');
  if (!response.ok) throw new Error('Starter project could not load. Reload to retry.');
  const manifest = z.object({ projects: z.array(ProjectSchema) }).parse(await response.json());
  const neon = manifest.projects.find(p => p.sessionId === 'Neon-Drive');
  if (!neon) throw new Error('Synth starter is missing.');
  await exclusive(async () => {
    const entries: Write[] = [];
    if (!await read('projects', neon.sessionId!)) entries.push({ collection: 'projects', key: neon.sessionId!, value: neon, add: true });
    entries.push({ collection: 'settings', key: 'synth-starter-version', value: 1 }); await write(entries);
  });
}
