import { parseProject, type Asset, type Project } from './model';
export type TakeIdentity = { assetId: string; dryAssetId: string; tabId: string; trackId: string; clipId: string; name: string };
export function checkTakeCapacity(project: Project) {
  if (project.tabs.length >= 50) throw new Error('Delete a pattern before recording (50-tab limit).');
  if (project.clips.length >= 500) throw new Error('Free a clip before recording (500-clip limit).');
}
export function placeRecordedTake(project: Project, asset: Asset, identity: TakeIdentity): Project {
  if (project.tabs.some(tab => tab.id === identity.tabId)) return project;
  checkTakeCapacity(project);
  const next = structuredClone(project), recording = asset.recording!;
  const exact = recording.offsetCycles - (recording.latencySeconds ?? 0) * recording.bpm / 240;
  const start = Math.floor(Math.max(0, exact) * 4) / 4;
  const takeOffsetSeconds = Math.max(0, -exact * 240 / recording.bpm);
  const takeLeadSeconds = (Math.max(0, exact) - start) * 240 / recording.bpm;
  const length = Math.max(.25, Math.ceil((Math.max(0, (asset.duration ?? 0) - takeOffsetSeconds) + takeLeadSeconds) * recording.bpm / 240 * 4) / 4);
  if (!next.tracks.some(track => track.id === identity.trackId)) throw new Error('The recording track is no longer available.');
  next.tabs.push({ id: identity.tabId, name: asset.label!, color: 'teal', anchors: [], audioAssetId: asset.id, code: `// Recorded audio; the composition clip retains exact timing.\ns("studio_${asset.id.replaceAll('-', '')}").gain(1)` });
  next.clips.push({ id: identity.clipId, tabId: identity.tabId, trackId: identity.trackId, takeId: asset.id, start, length, takeLeadSeconds, takeOffsetSeconds, muted: false });
  next.assetIds = [...new Set([...next.assetIds, asset.id, ...(recording.dryAssetId ? [recording.dryAssetId] : [])])];
  next.activeTabId = identity.tabId;
  if (next.audioInput) next.audioInput.enabled = false;
  return parseProject(next);
}
