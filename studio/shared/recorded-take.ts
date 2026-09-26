import type { RecordingTarget } from './recording-target';
import { recordedSection, validateRecordingTarget, retainPatternOutput, placeNewPattern } from './recording-target';
import { parseProject, type Asset, type Project } from './model';
import { withAnchors } from './clip-timing';
export type TakeIdentity = { midiCode?: string; assetId: string; dryAssetId: string; tabId: string; trackId: string; clipId: string; name: string; target?: RecordingTarget };
export function checkTakeCapacity(project: Project) {
  if (project.tabs.length >= 50) throw new Error('Delete a pattern before recording (50-tab limit).');
  if (project.clips.length >= 500) throw new Error('Free a clip before recording (500-clip limit).');
}
/** Clip position for captured audio: the take starts on its measured beat; audio before the clock start is skipped. */
export function recordedTakePlacement(recording: { offsetCycles: number; latencySeconds?: number }, duration: number, bpm: number) {
  const rawExact = recording.offsetCycles - (recording.latencySeconds ?? 0) * bpm / 240, exact = Math.max(0, rawExact);
  const source = Math.max(0, -rawExact * 240 / bpm), start = Math.floor(exact * 4) / 4, beat = (exact - start) * 4;
  const length = Math.max(.25, Math.ceil(Math.max(0, duration - source) * bpm / 60 + beat - 1e-9) / 4);
  return withAnchors({ start, length }, [{ source, beat }]);
}
export function placeRecordedTake(project: Project, asset: Asset, identity: TakeIdentity): Project {
  if (identity.target?.kind === 'new') {
    if (project.tabs.some(t => t.id === identity.tabId)) return project;
    const next = placeNewPattern(project, identity.target, (identity.midiCode || '') + recordedSection(asset, identity.target.offset), asset.duration ?? 0);
    next.assetIds = [...new Set([...next.assetIds, asset.id, ...(asset.recording?.dryAssetId ? [asset.recording.dryAssetId] : [])])];
    return parseProject(next);
  }
  if (identity.target) {
    if (project.assetIds.includes(asset.id)) return project;
    const next = structuredClone(project), tab = validateRecordingTarget(next, identity.target);
    const rate = (tab.tempoBpm ?? next.bpm) / next.bpm;
    tab.code = retainPatternOutput(tab.code) + recordedSection(asset, identity.target.offset, rate);
    next.assetIds = [...new Set([...next.assetIds, asset.id, ...(asset.recording?.dryAssetId ? [asset.recording.dryAssetId] : [])])];
    if (next.audioInput) next.audioInput.enabled = false;
    return parseProject(next);
  }
  if (project.tabs.some(tab => tab.id === identity.tabId)) return project;
  checkTakeCapacity(project);
  const next = structuredClone(project), recording = asset.recording!, placement = recordedTakePlacement(recording, asset.duration ?? 0, recording.bpm);
  if (!next.tracks.some(track => track.id === identity.trackId)) throw new Error('The recording track is no longer available.');
  next.tabs.push({ id: identity.tabId, name: asset.label!, color: 'teal', anchors: [], audioAssetId: asset.id, code: `// Recorded audio; the composition clip retains exact timing.\ns("studio_${asset.id.replaceAll('-', '')}").gain(1)` });
  next.clips.push({ id: identity.clipId, tabId: identity.tabId, trackId: identity.trackId, takeId: asset.id, ...placement, muted: false });
  next.assetIds = [...new Set([...next.assetIds, asset.id, ...(recording.dryAssetId ? [recording.dryAssetId] : [])])];
  next.activeTabId = identity.tabId;
  if (next.audioInput) next.audioInput.enabled = false;
  return parseProject(next);
}
