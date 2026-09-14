import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject } from '../shared/model';
import { recordingTarget, validateRecordingTarget, recordedSection } from '../shared/recording-target';
import { placeRecordedTake } from '../shared/recorded-take';
test('recording targets pin tab and placement identity, reject ambiguity and preserve source offsets', () => {
 const p=newProject(), tab=p.tabs[0];
 assert.equal(recordingTarget(p,'tab',undefined,undefined,100).tabId,tab.id);
 assert.throws(()=>recordingTarget(p,'composition','track-1',undefined,0),/Select a pattern placement/);
 p.clips.push({id:'clip',tabId:tab.id,trackId:'track-1',start:4,length:8,sourceOffset:2,muted:false});
 const t=recordingTarget(p,'composition','track-1','clip',5);
 assert.equal(t.offset,3); assert.equal(t.position,5);
 assert.equal(recordingTarget(p,'composition','track-1','clip',0).position,4);
 p.clips=[]; assert.throws(()=>validateRecordingTarget(p,t),/placement changed/);
});
test('audio appends to the pinned existing pattern, preserves placements, and retries idempotently',()=>{
 const p=newProject(), target=recordingTarget(p,'tab',undefined,undefined,0);
 const asset:any={id:'00000000-0000-4000-8000-000000000001',duration:3,recording:{bpm:120,mode:'wet'}};
 const id={assetId:'00000000-0000-4000-8000-000000000001',dryAssetId:'dry',name:'Take',tabId:target.tabId,trackId:'track-1',clipId:'unused',target};
 const next=placeRecordedTake(p,asset,id);
 assert.equal(next.tabs.length,p.tabs.length); assert.deepEqual(next.clips,p.clips);
 assert.ok(next.tabs[0].code.startsWith(p.tabs[0].code)); assert.match(next.tabs[0].code,/Recorded audio/);
 assert.equal(placeRecordedTake(next,asset,id),next);
 assert.match(recordedSection(asset,2,2),/slow\(7\).late\(4\)/);
});

test('new composition destinations reserve independent tabs and permit layered clips', async () => {
 const { placeNewPattern } = await import('../shared/recording-target');
 const p = newProject();
 const target = recordingTarget(p, 'composition', p.tracks[0].id, undefined, 0, 'new');
 assert.equal(target.kind, 'new'); assert.equal(p.tabs.some(t => t.id === target.tabId), false);
 const next = placeNewPattern(p, target, 'note(60).s("sine")', 10);
 assert.equal(next.tabs.length, p.tabs.length + 1); assert.equal(next.clips.at(-1)?.trackId, p.tracks[0].id);
 assert.deepEqual(next.clips.slice(0, -1), p.clips);
 assert.equal(placeNewPattern(next, target, 'note(60)', 10), next);
});
