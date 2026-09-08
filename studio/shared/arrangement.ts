import { isClipMuted } from './mix';
import * as core from '@strudel/core';
import type { Clip } from './model';

// Strudel's published packages do not include TypeScript declarations.
export type Pattern = { query(state: any): any[]; queryArc(begin: number, end: number): any[] };
export function arrangement(clips: Clip[], patterns: Map<string, Pattern>, mutes?: MuteTimeline, excluded: () => string | undefined = () => undefined): Pattern {
  return new core.Pattern((state: any) => clips.flatMap(clip => {
    if (clip.tabId === excluded()) return [];
    const begin = Math.max(Number(state.span.begin), clip.start);
    const end = Math.min(Number(state.span.end), clip.start + clip.length);
    const pattern = patterns.get(clip.id) ?? patterns.get(clip.tabId);
    const sourceOffset = clip.sourceOffset ?? 0;
    if (begin >= end || !pattern) return [];
    const offset = state.controls?.studioLoopOffset ?? 0;
    return (mutes ? mutes.segments(clip.id, begin + offset, end + offset).map(([a, b]) => [a - offset, b - offset]) : clip.muted ? [] : [[begin, end]]).flatMap(([a, b]) => pattern.query(state.setSpan(new core.TimeSpan(a - clip.start + sourceOffset, b - clip.start + sourceOffset)).setControls({ studioCycleOffset: clip.start + offset - sourceOffset }))
      .map((hap: any) => hap.withSpan((span: any) => new core.TimeSpan(
        Math.max(clip.start, Number(span.begin) + clip.start - sourceOffset),
        Math.min(clip.start + clip.length, Number(span.end) + clip.start - sourceOffset),
      )).withValue((value: any) => {
        // Per-pattern cps must not take over the composition clock.
        if (!value || typeof value !== 'object') return value;
        const { cps: _cps, ...rest } = value;
        return { ...rest, studioClipId: clip.id };
      })));
  }));
}

export function loopRange(pattern: Pattern, begin: number, end: number): Pattern {
  if (!Number.isFinite(begin) || !Number.isFinite(end) || begin < 0 || end <= begin) throw new Error('Choose a nonempty loop range.');
  const length = end - begin;
  return new core.Pattern((state: any) => {
    const a = Number(state.span.begin), b = Number(state.span.end);
    const result: any[] = [];
    for (let pass = Math.floor(a / length); pass * length < b; pass++) {
      const offset = pass * length - begin;
      const left = Math.max(a, pass * length), right = Math.min(b, (pass + 1) * length);
      result.push(...pattern.query(state.setSpan(new core.TimeSpan(left - offset, right - offset)).setControls({ studioLoopOffset: offset }))
        .map((hap: any) => hap.withSpan((span: any) => new core.TimeSpan(Number(span.begin) + offset, Number(span.end) + offset))));
    }
    return result;
  });
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
  reset(clips: Clip[], tracks: { id: string; muted: boolean }[], soloTrackId?: string) { this.versions = [{ cycle: 0, ids: this.snapshot(clips, tracks, soloTrackId) }]; }
  private snapshot(clips: Clip[], tracks: { id: string; muted: boolean }[], soloTrackId?: string) {
    return new Set(clips.filter(c => isClipMuted(c, tracks, soloTrackId)).map(c => c.id));
  }
  queue(clips: Clip[], tracks: { id: string; muted: boolean }[], through: number, soloTrackId?: string) {
    const cycle = Math.floor(Math.max(0, through)) + 1;
    this.versions = this.versions.filter(v => v.cycle < cycle);
    this.versions.push({ cycle, ids: this.snapshot(clips, tracks, soloTrackId) }); return cycle;
  }
  segments(id: string, begin: number, end: number): [number, number][] {
    return this.versions.flatMap((v, i) => {
      const a = Math.max(begin, v.cycle), b = Math.min(end, this.versions[i + 1]?.cycle ?? Infinity);
      return a < b && !v.ids.has(id) ? [[a, b] as [number, number]] : [];
    });
  }
  settle(cycle: number) { while (this.versions.length > 1 && this.versions[1].cycle <= cycle) this.versions.shift(); }
}

/** Map scheduler time to timeline time while keeping mute scheduling on its own clock. */
export function transportPattern(pattern: Pattern, position: number, begin: number, end: number, looping: boolean): Pattern {
  if (![position, begin, end].every(Number.isFinite) || begin < 0 || end <= begin || position < 0) throw new Error('Invalid timeline range.');
  return new core.Pattern((state: any) => {
    const a = Number(state.span.begin), b = Number(state.span.end), result: any[] = [];
    for (let cursor = a; cursor < b;) {
      const absolute = position + cursor;
      const at = looping ? begin + ((absolute - begin) % (end - begin) + end - begin) % (end - begin) : absolute;
      if (!looping && at >= end) break;
      const right = Math.min(b, cursor + end - at), offset = cursor - at;
      result.push(...pattern.query(state.setSpan(new core.TimeSpan(at, at + right - cursor)).setControls({ studioLoopOffset: offset }))
        .map((hap: any) => hap.withSpan((span: any) => new core.TimeSpan(Number(span.begin) + offset, Number(span.end) + offset))));
      cursor = right;
    }
    return result;
  });
}
