import { z } from 'zod';

const byte = z.number().int().min(0).max(127);
const id = z.string().min(1).max(100);
export const GenerationSchema = z.object({
  prompt: z.string().trim().min(1).max(450),
  duration: z.number().min(0.5).max(30).nullable(),
  loop: z.boolean(),
});
export type Generation = z.infer<typeof GenerationSchema>;
export const AssetSchema = GenerationSchema.extend({
  label: z.string().trim().min(1).max(80).optional(),
  id: z.string().uuid(), createdAt: z.string(), format: z.enum(['mp3', 'wav']),
  provider: z.enum(['elevenlabs', 'fixture']),
});
export type Asset = z.infer<typeof AssetSchema>;
export const AnchorSchema = z.object({
  id, from: z.number().int().nonnegative(), fingerprint: z.string().max(1000),
});
export const TargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slider'), sliderId: id, tabId: id.optional() }),
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
export const TabSchema = z.object({ id: tabId, name: z.string().trim().min(1).max(80), code: z.string().max(200_000), anchors: z.array(AnchorSchema).max(500) });
export type Tab = z.infer<typeof TabSchema>;
export const ClipSchema = z.object({ id: tabId, tabId, lane: z.union([z.literal(0), z.literal(1)]), start: z.number().int().min(0).max(4096), length: z.number().int().min(1).max(4096) });
export type Clip = z.infer<typeof ClipSchema>;
export const ProjectV2Schema = LegacyProjectSchema.omit({ code: true, anchors: true, version: true }).extend({
  sessionId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/).refine(name => name !== 'recovery', 'Reserved session name').optional(),
  version: z.literal(2), tabs: z.array(TabSchema).min(1).max(50), activeTabId: id,
  clips: z.array(ClipSchema).max(500), bpm: z.number().min(20).max(300),
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
export type Project = z.infer<typeof ProjectV2Schema>;
export const ProjectSchema = z.union([ProjectV2Schema, LegacyProjectSchema.transform(({ code, anchors, ...project }) => ({
  ...project, version: 2 as const, tabs: [{ id: 'pattern-1', name: 'Pattern 1', code, anchors }], activeTabId: 'pattern-1', clips: [], bpm: 120,
  bindings: project.bindings.map(b => b.target.kind === 'slider' ? { ...b, target: { ...b.target, tabId: 'pattern-1' } } : b),
}))]).pipe(ProjectV2Schema);
export type MidiEvent = { source: string; bytes: number[]; receivedAt: number; sequence: number; route: 'alsa' | 'simulation' };
export type BridgeStatus = { ready: boolean; message: string; ports: string[]; connected: string[] };
export type Receipt = { sequence: number; bindingId: string; target: Target; status: string; value?: number; at: number };
export type Job = { id: string; state: 'running' | 'complete' | 'failed'; asset?: Asset; error?: string };

export const defaultCode = `// Select an inline slider, then choose MIDI Learn.\nsetCpm(120/4)\n\n$beat: note("c2*4").s("triangle")\n  .decay(0.12).sustain(0)\n  .gain(slider(0.45, 0, 1, 0.01))\n\n$bass: note("<a2 f2 c3 g2>")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 6000, 10))\n  .gain(0.18)\n\n// Open Sounds to generate and insert a sample.\n`;
export function newProject(): Project {
  return { version: 2, name: 'Untitled project', tabs: [{ id: 'pattern-1', name: 'Pattern 1', code: defaultCode, anchors: [] }], activeTabId: 'pattern-1', clips: [], bpm: 120, bindings: [],
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
