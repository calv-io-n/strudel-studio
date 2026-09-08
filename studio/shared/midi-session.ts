import { MidiTake, type Destination, type CapturedNote } from './performance';
import { ProjectSchema, type Project, type Clip } from './model';

/** Absolute cycle input, with each completed window retained independently. */
export class CycleTakes {
  completed: MidiTake[] = [];
  current: MidiTake;
  pass = 0;
  pressed = false;
  running = true;
  private held = new Map<string, { pitch: number; velocity: number }>();
  constructor(readonly destination: Destination, readonly length: number) {
    if (!Number.isFinite(length) || length < .25 || length > 4096) throw new Error('Choose ¼ to 4096 cycles.');
    this.current = new MidiTake(destination); this.current.start();
  }
  advance(cycle: number) {
    while (this.running && cycle >= (this.pass + 1) * this.length) {
      this.current.stop(this.length);
      if (this.pressed && this.current.notes.length) { this.completed.push(this.current); if (this.completed.length > 32) this.completed.shift(); }
      this.pass++;
      this.current = new MidiTake(this.destination); this.current.start();
      this.pressed = false;
      for (const [key, note] of this.held) this.current.note(key, note.pitch, note.velocity, 0, true);
    }
  }
  note(key: string, pitch: number, velocity: number, cycle: number, on: boolean) {
    this.advance(cycle);
    if (!this.running || cycle < 0) return;
    if (on) { this.pressed = true; this.held.set(key, { pitch, velocity }); } else this.held.delete(key);
    this.current.note(key, pitch, velocity, cycle - this.pass * this.length, on);
  }
  finish(cycle: number) {
    this.advance(cycle);
    if (this.running) {
      this.current.stop(Math.max(0, Math.min(this.length, cycle - this.pass * this.length)));
      if (this.pressed && this.current.notes.length) { this.completed.push(this.current); if (this.completed.length > 32) this.completed.shift(); }
    }
    this.running = false; this.held.clear();
  }
}

export function sectionVariation(project: Project, clip: Clip, begin: number, end: number, destination: Destination, source: string, proposal: string, uuid: () => string): Project {
  const original = project.clips.find(c => c.id === clip.id);
  if (!original || JSON.stringify(original) !== JSON.stringify(clip)) throw new Error('The destination clip changed. Select the section again.');
  const tab = project.tabs.find(t => t.id === clip.tabId);
  if (!tab || tab.code !== source || source.slice(destination.from, destination.to) !== destination.original) throw new Error('The source changed. Keep the take and select its destination again.');
  if (!proposal.trim() || begin < clip.start || end > clip.start + clip.length || end <= begin) throw new Error('Choose a nonempty section inside this clip.');
  const offset = (clip.sourceOffset ?? 0) + begin - clip.start;
  const variation = { ...tab, id: uuid(), name: `${tab.name} · MIDI`, anchors: [], code: source.slice(0, destination.from) + `(${proposal}).late(${offset})` + source.slice(destination.to) };
  const parts: Clip[] = [];
  if (begin > clip.start) parts.push({ ...clip, id: uuid(), length: begin - clip.start });
  parts.push({ ...clip, tabId: variation.id, start: begin, length: end - begin, sourceOffset: offset });
  if (end < clip.start + clip.length) parts.push({ ...clip, id: uuid(), start: end, length: clip.start + clip.length - end, sourceOffset: (clip.sourceOffset ?? 0) + end - clip.start });
  return ProjectSchema.parse({ ...project, tabs: [...project.tabs, variation], clips: project.clips.flatMap(c => c.id === clip.id ? parts : [c]) });
}
export type StoredTake = { notes: CapturedNote[] };

/** A full-composition take can outlive any individual occurrence of the source tab. */
export function compositionVariation(project: Project, clip: Clip, begin: number, end: number, destination: Destination, source: string, proposal: string, uuid: () => string): Project {
  if (begin >= clip.start && end <= clip.start + clip.length) return sectionVariation(project, clip, begin, end, destination, source, proposal, uuid);
  const tab = project.tabs.find(t => t.id === clip.tabId);
  if (!tab || tab.code !== source || source.slice(destination.from, destination.to) !== destination.original) throw new Error('The source changed. Select its destination again before accepting.');
  if (!proposal.trim() || begin < 0 || end <= begin) throw new Error('Choose a nonempty loop.');
  const offset = (clip.sourceOffset ?? 0) + begin - clip.start;
  const marked = source.slice(0, destination.to) + '.set({studioMidiTarget: true})' + source.slice(destination.to);
  const backing = { ...tab, id: uuid(), name: `${tab.name} · backing`, anchors: [], code: marked + '\nall(p => p.filterValues(v => !v.studioMidiTarget))' };
  const melody = { ...tab, id: uuid(), name: `${tab.name} · MIDI`, anchors: [], code: source.slice(0, destination.from) + `(${proposal}).late(${offset}).set({studioMidiTarget: true})` + source.slice(destination.to) + `\nall(p => p.filterValues(v => v.studioMidiTarget).early(${offset}))` };
  const track = { id: uuid(), name: `${tab.name} MIDI`, muted: false };
  const clips = project.clips.flatMap(c => {
    if (c.tabId !== tab.id || c.start >= end || c.start + c.length <= begin) return [c];
    const a = Math.max(begin, c.start), b = Math.min(end, c.start + c.length);
    const parts: Clip[] = [];
    if (a > c.start) parts.push({ ...c, id: uuid(), length: a - c.start });
    parts.push({ ...c, tabId: backing.id, start: a, length: b - a, sourceOffset: (c.sourceOffset ?? 0) + a - c.start });
    if (b < c.start + c.length) parts.push({ ...c, id: uuid(), start: b, length: c.start + c.length - b, sourceOffset: (c.sourceOffset ?? 0) + b - c.start });
    return parts;
  });
  clips.push({ id: uuid(), tabId: melody.id, trackId: track.id, start: begin, length: end - begin, muted: false });
  return ProjectSchema.parse({ ...project, tracks: [...project.tracks, track], tabs: [...project.tabs, backing, melody], clips });
}
