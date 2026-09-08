import type { Project } from './model';
export function assetReferences(project: Project) {
  const ids = new Set(project.assetIds);
  for (const slot of project.slots) { slot.assets.forEach(id => ids.add(id)); if (slot.active) ids.add(slot.active); }
  for (const binding of project.bindings) if (binding.target.kind !== 'slider') ids.add(binding.target.assetId);
  for (const tab of project.tabs) {
    for (const match of tab.code.matchAll(/studio_([a-f0-9]{32})/gi)) { const key = match[1]; ids.add(`${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20)}`.toLowerCase()); }
    for (const match of tab.code.matchAll(/\/api\/samples\/([a-f0-9-]{36})\/audio/gi)) ids.add(match[1].toLowerCase());
  }
  return [...ids];
}
