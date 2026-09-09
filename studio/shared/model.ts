import { z } from 'zod';

const byte = z.number().int().min(0).max(127);
const id = z.string().min(1).max(100);
export const GenerationSchema = z.object({
  prompt: z.string().trim().min(1).max(450),
  duration: z.number().min(0.5).max(30).nullable(),
  loop: z.boolean(),
});
export type Generation = z.infer<typeof GenerationSchema>;
export const AssetSchema = z.object({
  description: z.string().max(1000).optional(), tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  prompt: z.string().max(450).default(''), duration: z.number().nonnegative().nullable().default(null), loop: z.boolean().default(false),
  label: z.string().trim().min(1).max(80).optional(),
  id: z.string().uuid(), createdAt: z.string(), format: z.enum(['mp3', 'wav']),
  provider: z.enum(['elevenlabs', 'fixture', 'upload', 'github', 'recording']),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  pack: z.object({ id: z.string().uuid(), name: z.string().min(1).max(80), folder: z.string().max(1000).default('') }).optional(),
  source: z.object({ name: z.string().max(1000), url: z.string().max(2000).optional(), revision: z.string().max(100).optional(), originalFormat: z.enum(['wav', 'mp3', 'ogg', 'flac']).optional() }).optional(),
  recording: z.object({ source: z.enum(['internal', 'external']), bpm: z.number().positive(), offsetCycles: z.number().nonnegative(), duration: z.number().nonnegative(), trimStart: z.number().nonnegative(), trimEnd: z.number().nonnegative(), incomplete: z.boolean().default(false) }).optional(),
  missing: z.boolean().optional(),
});
export type Asset = z.infer<typeof AssetSchema>;
export const AnchorSchema = z.object({
  id, from: z.number().int().nonnegative(), fingerprint: z.string().max(1000),
});
export const TargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slider'), sliderId: id, tabId: id.optional() }),
  z.object({ kind: z.literal('midi-preset'), presetId: z.string().uuid() }),
  z.object({ kind: z.literal('trigger'), assetId: z.string().uuid() }),
  z.object({ kind: z.literal('swap'), slot: id, assetId: z.string().uuid() }),
]);
export type Target = z.infer<typeof TargetSchema>;
export const BindingSchema = z.object({
  id, profileId: id, channel: z.number().int().min(1).max(16),
  kind: z.enum(['cc', 'note']), number: byte, target: TargetSchema,
  pickup: z.boolean(), enabled: z.boolean(),
});
export type Binding = z.infer<typeof BindingSchema>;
export const ProfileSchema = z.object({ id, name: z.string().min(1).max(100), port: z.string().max(300), enabled: z.boolean() });
export type Profile = z.infer<typeof ProfileSchema>;
export const VirtualControlSchema = z.object({
  id, kind: z.enum(['knob', 'fader', 'pad', 'key']), label: z.string().max(60),
  channel: z.number().int().min(1).max(16), number: byte, value: byte,
});
export type VirtualControl = z.infer<typeof VirtualControlSchema>;
const LegacyProjectSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(80), code: z.string().max(200_000),
  anchors: z.array(AnchorSchema).max(500), bindings: z.array(BindingSchema).max(1000),
  profiles: z.array(ProfileSchema).max(50),
  slots: z.array(z.object({ name: z.string().regex(/^[a-zA-Z][\w-]{0,39}$/),
    assets: z.array(z.string().uuid()).max(500), active: z.string().uuid().nullable() })).max(100),
  controls: z.array(VirtualControlSchema).max(100),
});
const tabId = id.regex(/^[a-zA-Z0-9_-]+$/);
const OldTabSchema = z.object({ id: tabId, name: z.string().trim().min(1).max(80), code: z.string().max(200_000), anchors: z.array(AnchorSchema).max(500) });

const OldClipSchema = z.object({ id: tabId, tabId, lane: z.union([z.literal(0), z.literal(1)]), start: z.number().int().min(0).max(4096), length: z.number().int().min(1).max(4096) });

export const ProjectV2Schema = LegacyProjectSchema.omit({ code: true, anchors: true, version: true }).extend({
  sessionId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/).refine(name => name !== 'recovery', 'Reserved session name').optional(),
  version: z.literal(2), tabs: z.array(OldTabSchema).min(1).max(50), activeTabId: id,
  clips: z.array(OldClipSchema).max(500), bpm: z.number().min(20).max(300),
}).superRefine((project, ctx) => {
  const ids = new Set(project.tabs.map(t => t.id));
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (ids.size !== project.tabs.length || !ids.has(project.activeTabId)) issue('Invalid pattern tabs');
  if (new Set(project.clips.map(c => c.id)).size !== project.clips.length) issue('Duplicate clip ID');
  for (const clip of project.clips) {
    if (!ids.has(clip.tabId)) issue('Clip references a missing pattern');
    if (project.clips.some(other => other.id !== clip.id && other.lane === clip.lane && clip.start < other.start + other.length && other.start < clip.start + clip.length)) issue('Clips cannot overlap in the same lane');
  }
  if (project.bindings.some(b => b.target.kind === 'slider' && (!b.target.tabId || !ids.has(b.target.tabId)))) issue('Slider mapping references a missing pattern');
});
export const palette = ['blue', 'cyan', 'teal', 'green', 'amber', 'orange', 'rose', 'violet'] as const;
export const defaultTracks = () => [1, 2].map(n => ({ id: `track-${n}`, name: `Track ${n}`, muted: false }));
export const TabSchema = OldTabSchema.extend({ color: z.enum(palette) });
export type Tab = z.infer<typeof TabSchema>;
export const TrackSchema = z.object({ id: tabId, name: z.string().trim().min(1).max(80), muted: z.boolean() });
const cycle = z.number().min(0).max(4096).multipleOf(.25);
export const ClipSchema = z.object({ id: tabId, tabId, trackId: tabId, start: cycle, length: cycle.min(.25), sourceOffset: cycle.optional(), muted: z.boolean() });
export type Clip = z.infer<typeof ClipSchema>;
export const ProjectV3Schema = LegacyProjectSchema.omit({ code: true, anchors: true, version: true }).extend({
  sessionId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/).refine(name => name !== 'recovery').optional(),
  version: z.literal(3), tabs: z.array(TabSchema).min(1).max(50), activeTabId: id,
  soloTrackId: tabId.optional(), tracks: z.array(TrackSchema).min(1).max(16), snap: z.union([z.literal(1), z.literal(.5), z.literal(.25)]),
  clips: z.array(ClipSchema).max(500), bpm: z.number().min(20).max(300),
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const tabs = new Set(p.tabs.map(t => t.id)), tracks = new Set(p.tracks.map(t => t.id));
  if (tabs.size !== p.tabs.length || !tabs.has(p.activeTabId)) issue('Invalid pattern tabs');
  if (p.soloTrackId && !tracks.has(p.soloTrackId)) issue('Solo references a missing track');
  if (tracks.size !== p.tracks.length) issue('Duplicate track ID');
  if (new Set(p.clips.map(c => c.id)).size !== p.clips.length) issue('Duplicate clip ID');
  for (const c of p.clips) {
    if (!tabs.has(c.tabId) || !tracks.has(c.trackId)) issue('Missing clip source or track');
    if (p.clips.some(o => o.id !== c.id && o.trackId === c.trackId && c.start < o.start + o.length && o.start < c.start + c.length)) issue('Clips cannot overlap in the same track');
  }
  if (p.bindings.some(b => b.target.kind === 'slider' && b.target.tabId !== '@midi' && !tabs.has(b.target.tabId!))) issue('Slider mapping references a missing pattern');
});
export const ProjectV4Schema = z.object({ ...ProjectV3Schema.shape, version: z.literal(4), assetIds: z.array(z.string().uuid()).max(10000).default([]) }).superRefine((p, ctx) => { const result = ProjectV3Schema.safeParse({ ...p, version: 3 }); if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path }); });
export const ProjectV5Schema = z.object({ ...ProjectV4Schema.shape, version: z.literal(5), midiSound: z.string().min(1).max(300).optional(), midiInstrument: z.object({ enabled: z.boolean().default(true), mode: z.enum(['script', 'midi']), code: z.string().max(200_000), appliedCode: z.string().max(200_000), appliedAnchors: z.array(AnchorSchema).max(500).optional(), anchors: z.array(AnchorSchema).max(500) }).optional() }).superRefine((p, ctx) => { const result = ProjectV4Schema.safeParse({ ...p, version: 4 }); if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path }); });
export type Project = z.infer<typeof ProjectV5Schema>;
const migrateV2 = (p: z.infer<typeof ProjectV2Schema>) => ({ ...p, version: 3 as const, tracks: defaultTracks(), snap: 1 as const,
  tabs: p.tabs.map((t, i) => ({ ...t, color: palette[i % palette.length] })),
  clips: p.clips.map(({ lane, ...c }) => ({ ...c, trackId: `track-${lane + 1}`, muted: false })),
});
const OlderProjectSchema = z.union([ProjectV3Schema, ProjectV2Schema.transform(migrateV2), LegacyProjectSchema.transform(({ code, anchors, ...p }) => migrateV2({
  ...p, version: 2, tabs: [{ id: 'pattern-1', name: 'Pattern 1', code, anchors }], activeTabId: 'pattern-1', clips: [], bpm: 120,
  bindings: p.bindings.map(b => b.target.kind === 'slider' ? { ...b, target: { ...b.target, tabId: 'pattern-1' } } : b),
}))]).pipe(ProjectV3Schema);
export const ProjectSchema = z.union([ProjectV5Schema, ProjectV4Schema.transform(p => ({ ...p, version: 5 as const })), OlderProjectSchema.transform(p => ({ ...p, version: 5 as const, assetIds: [] as string[] }))]);
export const PROJECT_FORMAT = 5;
/** Why a project payload was rejected, with field paths from the schema that matches its declared version instead of the union's generic message. */
export function describeProjectIssues(value: unknown) {
  const schema = (value as { version?: unknown } | null)?.version === 4 ? ProjectV4Schema : ProjectV5Schema;
  const result = schema.safeParse(value);
  if (result.success) return 'Project format rejected';
  const seen = new Set<string>();
  const issues = result.error.issues.map(i => `${i.path.join('.') || 'project'}: ${i.message}`).filter(text => !seen.has(text) && !!seen.add(text));
  return `Project format rejected · ${issues.slice(0, 3).join(' · ')}${issues.length > 3 ? ` · ${issues.length - 3} more` : ''}`;
}
export function parseProject(value: unknown): Project {
  const result = ProjectSchema.safeParse(value);
  if (result.success) return result.data;
  throw new Error(describeProjectIssues(value));
}
export type MidiEvent = { source: string; bytes: number[]; receivedAt: number; sequence: number; route: 'alsa' | 'simulation' };
export type BridgeStatus = { ready: boolean; message: string; ports: string[]; connected: string[] };
export type Receipt = { sequence: number; bindingId: string; target: Target; status: string; value?: number; at: number };
export type Job = { id: string; state: 'running' | 'complete' | 'failed'; asset?: Asset; error?: string };

export const defaultCode = `// Select an inline slider, then choose MIDI Learn.\nsetCpm(120/4)\n\n$beat: note("c2*4").s("triangle")\n  .decay(0.12).sustain(0)\n  .gain(slider(0.45, 0, 1, 0.01))\n\n$bass: note("<a2 f2 c3 g2>")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 6000, 10))\n  .gain(0.18)\n\n// Open Sounds to generate and insert a sample.\n`;
export function newProject(): Project {
  return { version: 5, assetIds: [], tracks: defaultTracks(), snap: 1, name: 'Untitled project', tabs: [{ id: 'pattern-1', name: 'Pattern 1', code: defaultCode, anchors: [], color: 'blue' }], activeTabId: 'pattern-1', clips: [], bpm: 120, bindings: [],
    profiles: [ { id: 'virtual', name: 'Virtual controller', port: 'studio:virtual', enabled: true },
      { id: 'external', name: 'External MIDI input', port: 'studio:input', enabled: true } ],
    slots: [{ name: 'bass', assets: [], active: null }],
    controls: [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `knob-${i}`, kind: 'knob' as const, label: `Knob ${i + 1}`, channel: 1, number: 20 + i, value: 0 })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `fader-${i}`, kind: 'fader' as const, label: `Fader ${i + 1}`, channel: 1, number: 24 + i, value: 0 })),
      ...Array.from({ length: 8 }, (_, i) => ({ id: `pad-${i}`, kind: 'pad' as const, label: `Pad ${i + 1}`, channel: 1, number: 36 + i, value: 100 })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `key-${i}`, kind: 'key' as const, label: ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][i] + '4', channel: 1, number: 60 + i, value: 100 })),
    ],
  };
}
