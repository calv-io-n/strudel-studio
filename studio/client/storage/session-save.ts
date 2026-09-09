import { parseProject, type Project } from '../../shared/model';
import { defaultInstrument } from '../../shared/midi-instrument';
import { read, all, write, exclusive, type Write } from './database';
export type SaveOutcome = { kind: 'saved' | 'unchanged' | 'refreshed' | 'copied'; project: Project };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',')}}`;
  return JSON.stringify(value);
}
export function sameSession(a: Project, b: Project) {
  const content = (p: Project) => { const { revision, sessionId, ...rest } = parseProject(p); return canonical({ ...rest, midiInstrument: rest.midiInstrument ?? defaultInstrument(rest.midiSound), appliedPatterns: rest.appliedPatterns ?? {}, appliedPatternAnchors: rest.appliedPatternAnchors ?? {} }); };
  return content(a) === content(b);
}
/** Caller holds the workspace lock. Planning performs reads only; publish all entries together. */
export async function prepareSessionSave(value: Project, base?: Project): Promise<SaveOutcome> {
  const candidate = parseProject(value);
  const raw = candidate.sessionId ? await read<Project>('projects', candidate.sessionId) : undefined;
  const current = raw ? parseProject(raw) : undefined;
  if (current && sameSession(candidate, current)) return { kind: 'unchanged', project: current };
  const validBase = base?.sessionId === candidate.sessionId ? base : undefined;
  if (current && validBase && sameSession(candidate, validBase)) return { kind: 'refreshed', project: current };
  const canUpdate = current && (validBase ? sameSession(current, validBase) : (current.revision ?? 0) === (candidate.revision ?? 0));
  if (canUpdate) return { kind: 'saved', project: { ...candidate, revision: (current.revision ?? 0) + 1 } };
  const copy = !!candidate.sessionId;
  const name = copy ? candidate.name.slice(0, 64) + ' (conflict copy)' : candidate.name;
  if (copy) {
    const existing = (await all<Project>('projects')).find(p => p.name === name && sameSession({ ...candidate, name }, p));
    if (existing) return { kind: 'copied', project: parseProject(existing) };
  }
  const stem = name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 70) || 'session';
  const root = stem === 'recovery' ? 'session' : stem;
  let sessionId = root;
  for (let n = 2; await read('projects', sessionId); n++) sessionId = `${root}-${n}`;
  return { kind: copy ? 'copied' : 'saved', project: { ...candidate, name, sessionId, revision: 1 } };
}
export function sessionSaveEntries(result: SaveOutcome): Write[] {
  const entries: Write[] = [{ collection: 'settings', key: 'recovery', value: result.project }];
  if (result.kind === 'saved' || result.kind === 'copied') entries.unshift({ collection: 'projects', key: result.project.sessionId!, value: result.project });
  return entries;
}
export async function saveSession(value: Project, base?: Project) {
  return exclusive(async () => { const result = await prepareSessionSave(value, base); await write(sessionSaveEntries(result)); return result; });
}
