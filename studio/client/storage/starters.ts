import { z } from 'zod';
import { AssetSchema, ProjectSchema } from '../../shared/model';
import { read, write, exclusive, type Write } from './database';
export async function seedStarters() {
  if (await read('settings', 'synth-starter-version') === 2) return;
  const response = await fetch('/starter/manifest.json');
  if (!response.ok) throw new Error('Starter project could not load. Reload to retry.');
  const manifest = z.object({ projects: z.array(ProjectSchema) }).parse(await response.json());
  const neon = manifest.projects.find(p => p.sessionId === 'Neon-Drive');
  if (!neon) throw new Error('Synth starter is missing.');
  await exclusive(async () => {
    if (await read('settings', 'synth-starter-version') === 2) return;
    const entries: Write[] = [];
    const existing = await read<import('../../shared/model').Project>('projects', neon.sessionId!);
    if (!existing) entries.push({ collection: 'projects', key: neon.sessionId!, value: neon, add: true });
    else if (existing.name === 'Neon Drive') entries.push({ collection: 'projects', key: neon.sessionId!, value: { ...existing, name: 'DEMO: Neon Drive', revision: (existing.revision ?? 0) + 1 } });
    entries.push({ collection: 'settings', key: 'synth-starter-version', value: 2 }); await write(entries);
  });
}
