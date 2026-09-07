import * as core from '@strudel/core';
import type { Clip } from './model';

// Strudel's published packages do not include TypeScript declarations.
export type Pattern = { query(state: any): any[]; queryArc(begin: number, end: number): any[] };
export function arrangement(clips: Clip[], patterns: Map<string, Pattern>, mutes?: MuteTimeline): Pattern {
  return new core.Pattern((state: any) => clips.flatMap(clip => {
    const begin = Math.max(Number(state.span.begin), clip.start);
    const end = Math.min(Number(state.span.end), clip.start + clip.length);
    const pattern = patterns.get(clip.tabId);
    if (begin >= end || !pattern) return [];
    return (mutes ? mutes.segments(clip.id, begin, end) : clip.muted ? [] : [[begin, end]]).flatMap(([a, b]) => pattern.query(state.setSpan(new core.TimeSpan(a - clip.start, b - clip.start)).setControls({ studioCycleOffset: clip.start }))
      .map((hap: any) => hap.withSpan((span: any) => new core.TimeSpan(
        Math.max(clip.start, Number(span.begin) + clip.start),
        Math.min(clip.start + clip.length, Number(span.end) + clip.start),
      )).withValue((value: any) => {
        // Per-pattern cps must not take over the composition clock.
        if (!value || typeof value !== 'object') return value;
        const { cps: _cps, ...rest } = value;
        return rest;
      })));
  }));
}

export class PatternTimeline {
  private versions: { cycle: number; pattern: Pattern }[] = [];
  reset(pattern: Pattern) { this.versions = [{ cycle: 0, pattern }]; }
  queue(pattern: Pattern, scheduledThrough: number) {
    const cycle = Math.floor(Math.max(0, scheduledThrough)) + 1;
    this.versions = this.versions.filter(v => v.cycle < cycle);
    this.versions.push({ cycle, pattern });
    return cycle;
  }
  pattern(): Pattern {
    return new core.Pattern((state: any) => {
      const begin = Number(state.span.begin), end = Number(state.span.end);
      return this.versions.flatMap((version, index) => {
        const a = Math.max(begin, version.cycle), b = Math.min(end, this.versions[index + 1]?.cycle ?? Infinity);
        return a < b ? version.pattern.query(state.setSpan(new core.TimeSpan(a, b))) : [];
      });
    });
  }
  settle(cycle: number) {
    while (this.versions.length > 1 && this.versions[1].cycle <= cycle) this.versions.shift();
  }
}

export class MuteTimeline {
  private versions: { cycle: number; ids: Set<string> }[] = [];
  reset(clips: Clip[], tracks: { id: string; muted: boolean }[]) { this.versions = [{ cycle: 0, ids: this.snapshot(clips, tracks) }]; }
  private snapshot(clips: Clip[], tracks: { id: string; muted: boolean }[]) {
    return new Set(clips.filter(c => c.muted || tracks.some(t => t.id === c.trackId && t.muted)).map(c => c.id));
  }
  queue(clips: Clip[], tracks: { id: string; muted: boolean }[], through: number) {
    const cycle = Math.floor(Math.max(0, through)) + 1;
    this.versions = this.versions.filter(v => v.cycle < cycle);
    this.versions.push({ cycle, ids: this.snapshot(clips, tracks) }); return cycle;
  }
  segments(id: string, begin: number, end: number): [number, number][] {
    return this.versions.flatMap((v, i) => {
      const a = Math.max(begin, v.cycle), b = Math.min(end, this.versions[i + 1]?.cycle ?? Infinity);
      return a < b && !v.ids.has(id) ? [[a, b] as [number, number]] : [];
    });
  }
  settle(cycle: number) { while (this.versions.length > 1 && this.versions[1].cycle <= cycle) this.versions.shift(); }
}
