import test from 'node:test';
import assert from 'node:assert/strict';
import {clipAnchors,validateAnchors,isStretched,renderKey,sourceAtBeat,beatAtSource,endBeat,trimClipStart,fitToBeats,smartSnap,type ClipAnchor} from '../shared/clip-timing';
const bpm=120; // 0.5 s per beat
const clip={start:2,length:4};
const warp:ClipAnchor[]=[{source:1,beat:2},{source:2,beat:5},{source:3,beat:6}]; // 1 s → 1.5 s, then 1 s → 0.5 s
test('missing anchors mean the whole sample plays from the clip start at 1×',()=>{
 assert.deepEqual(clipAnchors(clip),[{source:0,beat:0}]);
 assert.equal(sourceAtBeat([{source:0,beat:0}],bpm,3),1.5);
 assert.equal(beatAtSource([{source:0,beat:0}],bpm,1.5),3);
 assert.equal(isStretched([{source:0,beat:0}],bpm),false);assert.equal(renderKey([{source:0,beat:0}],bpm),'raw');
});
test('time map interpolates inside segments, is silent before the first anchor and plays 1× after the last',()=>{
 assert.equal(sourceAtBeat(warp,bpm,1),undefined);
 assert.equal(sourceAtBeat(warp,bpm,2),1);assert.equal(sourceAtBeat(warp,bpm,3.5),1.5);assert.equal(sourceAtBeat(warp,bpm,5.5),2.5);
 assert.equal(sourceAtBeat(warp,bpm,8),4);
 assert.equal(beatAtSource(warp,bpm,.5),undefined);assert.equal(beatAtSource(warp,bpm,1.5),3.5);assert.equal(beatAtSource(warp,bpm,4),8);
 assert.equal(endBeat(warp,bpm,4),8);assert.equal(endBeat(warp,bpm,.5),2);
 assert.equal(isStretched(warp,bpm),true);assert.equal(isStretched([{source:0,beat:0},{source:1,beat:2}],bpm),false);
 assert.notEqual(renderKey(warp,bpm),renderKey(warp,150));
});
test('validation enforces order, source bounds and the 0.5×–2× stretch limit per interval',()=>{
 validateAnchors(warp,4,bpm);
 validateAnchors([{source:10,beat:0}],4,bpm); // a lone anchor past the audio plays nothing but is legal
 assert.throws(()=>validateAnchors([],4,bpm));
 assert.throws(()=>validateAnchors([{source:0,beat:0},{source:1,beat:0}],4,bpm),/cross/);
 assert.throws(()=>validateAnchors([{source:0,beat:0},{source:5,beat:2}],4,bpm),/inside/);
 assert.throws(()=>validateAnchors([{source:0,beat:0},{source:1,beat:.5}],4,bpm),/Interval 1/);
 assert.throws(()=>validateAnchors([{source:0,beat:0},{source:1,beat:4.5}],4,bpm),/Interval 1/);
 validateAnchors([{source:0,beat:0},{source:1,beat:1}],4,bpm);validateAnchors([{source:0,beat:0},{source:1,beat:4}],4,bpm);
 assert.throws(()=>validateAnchors([{source:0,beat:0},{source:61,beat:122}],200,bpm),/60 seconds/);
});
test('left trims keep syllables on their beats and extending left adds silence',()=>{
 const source={...clip,anchors:warp};
 const inside=trimClipStart(source,2.75,bpm); // 3 beats in: inside the first stretched segment
 assert.equal(inside.start,2.75);assert.equal(inside.length,3.25);
 assert.deepEqual(inside.anchors,[{source:1+1/3,beat:0},{source:2,beat:2},{source:3,beat:3}]);
 assert.ok(Math.abs(sourceAtBeat(inside.anchors!,bpm,1)!-sourceAtBeat(warp,bpm,4)!)<1e-12);
 const past=trimClipStart(source,4,bpm); // 8 beats in: past the last anchor, 1× tail
 assert.deepEqual(past.anchors,[{source:4,beat:0}]);
 const before=trimClipStart(source,2.25,bpm); // 1 beat in: still inside the lead silence
 assert.deepEqual(before.anchors,[{source:1,beat:1},{source:2,beat:4},{source:3,beat:5}]);
 const extended=trimClipStart({...clip,anchors:[{source:.5,beat:0}]},1.5,bpm);
 assert.deepEqual(extended.anchors,[{source:.5,beat:2}]);assert.equal(extended.length,4.5);
 assert.equal(trimClipStart({...clip},2.5,bpm).anchors?.[0].source,1);
 assert.equal('anchors' in trimClipStart({...clip},2,bpm),false);
});
test('fit to beats stretches the audible window uniformly and sets the clip length',()=>{
 const fit=fitToBeats({start:0,length:2,anchors:[{source:1,beat:1}]},4,bpm,6); // audible 1→4 s (3 s) onto 6 beats (3 s): 1×
 assert.deepEqual(fit.anchors,[{source:1,beat:1},{source:4,beat:7}]);assert.equal(fit.length,1.75);
 const trimmed=fitToBeats({start:0,length:1,anchors:[{source:1,beat:1}]},4,bpm,4); // window ends at beat 4 → source 2.5
 assert.deepEqual(trimmed.anchors,[{source:1,beat:1},{source:2.5,beat:5}]);
 assert.throws(()=>fitToBeats({start:0,length:2},4,bpm,1),/Choose 4–16 beats/);
 assert.throws(()=>fitToBeats({start:0,length:2},4,bpm,1.5),/whole number/);
 assert.throws(()=>fitToBeats({start:0,length:2,anchors:[{source:10,beat:0}]},4,bpm,4),/no audio/);
});
test('smart snap pulls attacks near grid lines onto them and skips anchors that would over-stretch',()=>{
 const base:ClipAnchor[]=[{source:0,beat:0},{source:4,beat:8}];
 const result=smartSnap([.52,1.4,2.03,3.5,3.55],base,bpm,{grid:.5,toleranceSeconds:.07});
 assert.deepEqual(result.anchors,[{source:0,beat:0},{source:.52,beat:1},{source:2.03,beat:4},{source:3.5,beat:7},{source:4,beat:8}]);
 assert.equal(result.snapped,3);assert.equal(result.skipped,1); // 3.55 would squeeze 3.5→3.6 onto the same beat 7; 1.4 is off-grid
 assert.deepEqual(smartSnap([],base,bpm).anchors,base);
 const wide=smartSnap([.51],[{source:0,beat:0}],bpm,{grid:1,toleranceSeconds:.05});
 assert.deepEqual(wide.anchors,[{source:0,beat:0},{source:.51,beat:1}]);
});

import {takeWindow} from '../shared/clip-timing';
test('playback window covers the lead silence, the transport start and the audible end in rendered-buffer seconds',()=>{
 const anchored={...clip,anchors:warp};
 assert.deepEqual(takeWindow(anchored,4,bpm,0),{begin:.5,end:2,offset:0,seconds:3});
 assert.deepEqual(takeWindow(anchored,4,bpm,-1),{begin:1,end:2,offset:1,seconds:2});
 assert.deepEqual(takeWindow(clip,1.5,bpm,0),{begin:0,end:.75,offset:0,seconds:1.5});
 assert.equal(takeWindow(anchored,4,bpm,-2),undefined);
 assert.equal(takeWindow({...clip,anchors:[{source:10,beat:0}]},4,bpm,0),undefined);
});

import {tempoChangeIssue} from '../shared/clip-timing';
test('a tempo change is refused while it would push an anchored clip past the stretch limit',()=>{
 const clips=[{id:'a',name:'Vocal hook',takeId:'x',anchors:[{source:0,beat:0},{source:1,beat:3.8}]},{id:'b',name:'Take',takeId:'x'}];
 assert.equal(tempoChangeIssue(clips,()=>4,120),undefined);
 assert.match(tempoChangeIssue(clips,()=>4,110)!,/Vocal hook.*110 BPM/);
 assert.equal(tempoChangeIssue(clips,()=>4,130),undefined);
});

test('raw playback offsets include the first anchor so trimmed duplicates play different audio',()=>{
 assert.deepEqual(takeWindow({...clip,anchors:[{source:.4,beat:.2}]},4,bpm,0),{begin:.05,end:1.85,offset:.4,seconds:3.6});
 assert.deepEqual(takeWindow({...clip,anchors:[{source:1,beat:0},{source:2,beat:2}]},4,bpm,0),{begin:0,end:1.5,offset:1,seconds:3});
 assert.equal(takeWindow({...clip,anchors:warp},4,bpm,-1)!.offset,1);
});
test('smart snap tolerance never exceeds a third of the grid interval',()=>{
 const base:ClipAnchor[]=[{source:0,beat:0},{source:4,beat:8}]; // 1:1 at 120 BPM
 // sixteenth = 125 ms → tolerance 41.7 ms: a 50 ms displacement stays put, 30 ms snaps; eighth keeps the 70 ms default.
 assert.equal(smartSnap([.55],base,bpm,{grid:.25}).snapped,0);
 assert.equal(smartSnap([.53],base,bpm,{grid:.25}).snapped,1);
 assert.equal(smartSnap([.56],base,bpm,{grid:.5}).snapped,1);
 assert.equal(smartSnap([.03],base,bpm,{grid:.25}).skipped,1); // would land on the first anchor's beat
});

import {startAtSource,phrasePace} from '../shared/clip-timing';
test('starting a phrase at a later sample second keeps its beat and drops anchors it passes',()=>{
 assert.deepEqual(startAtSource([{source:0,beat:0},{source:1,beat:2},{source:2,beat:4}],.5),[{source:.5,beat:0},{source:1,beat:2},{source:2,beat:4}]);
 assert.deepEqual(startAtSource([{source:0,beat:1},{source:1,beat:2},{source:2,beat:4}],1.5),[{source:1.5,beat:1},{source:2,beat:4}]);
 assert.deepEqual(startAtSource([{source:0,beat:0}],3),[{source:3,beat:0}]);
 assert.throws(()=>startAtSource([{source:0,beat:0},{source:1,beat:2}],1),/before/);
});
test('phrase pace reports the stretched span as a speed factor against natural pace',()=>{
 assert.equal(phrasePace([{source:0,beat:0}],bpm),undefined);
 assert.equal(phrasePace([{source:0,beat:0},{source:2,beat:4}],bpm),1);   // 2 s → 4 beats at 120 = 2 s
 assert.equal(phrasePace([{source:0,beat:0},{source:4,beat:4}],bpm),2);   // 4 s squeezed into 2 s plays twice as fast
 assert.ok(Math.abs(phrasePace([{source:0,beat:0},{source:8.8,beat:24}],172)!-1.05)<.01);
});

import {paceFit} from '../shared/clip-timing';
test('pace presets play a phrase at a speed factor and snap its length to whole bars or beats',()=>{
 const phrase={start:8,length:8,anchors:[{source:0,beat:0}]},duration=8.8; // 8.8 s at 172 BPM = 25.2 beats
 const natural=paceFit(phrase,duration,172,1,'bar');
 assert.equal(natural.bars,6);assert.equal(natural.length,6);assert.deepEqual(natural.anchors,[{source:0,beat:0},{source:8.8,beat:24}]);assert.ok(Math.abs(natural.speed-1.051)<.005);
 const half=paceFit(phrase,duration,172,.5,'bar');assert.equal(half.bars,12);assert.ok(Math.abs(half.speed-.526)<.005);
 assert.equal(paceFit(phrase,duration,172,1,'beat').anchors[1].beat,25);
 assert.throws(()=>paceFit(phrase,duration,172,2,'bar'),/Choose 13–50 beats/);
 assert.equal(paceFit({start:0,length:1,anchors:[{source:1,beat:2}]},1.4,120,1,'beat').anchors[0].beat,2); // keeps the lead
});
