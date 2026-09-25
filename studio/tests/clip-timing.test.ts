import test from 'node:test';
import assert from 'node:assert/strict';
import {clipAnchors,validateAnchors,isStretched,renderKey,sourceAtBeat,beatAtSource,endBeat,trimClipStart,fitToBeats,suggestedFit,smartSnap,type ClipAnchor} from '../shared/clip-timing';
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
test('suggested fit picks the power of two nearest the audible length',()=>{
 assert.equal(suggestedFit({start:0,length:2},1.8,bpm).beats,4);
 assert.equal(suggestedFit({start:0,length:2},.7,bpm).beats,1);
 assert.throws(()=>suggestedFit({start:0,length:2},0,bpm));
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
