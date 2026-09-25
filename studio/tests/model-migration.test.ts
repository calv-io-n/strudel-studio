import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectSchema,ProjectV8Schema,ClipSchema,newProject} from '../shared/model';
const take='77777777-7777-4777-a777-777777777777';
function v7(clips:object[]){const p=newProject() as any;return {...p,version:7,tracks:[{id:'t',name:'T',muted:false}],clips:clips.map((c,i)=>({id:`c${i}`,tabId:'pattern-1',trackId:'t',start:0,length:4,muted:false,...c}))};}
test('v7 take clips migrate their seconds fields to a single anchor and drop the legacy keys',()=>{
 const project=ProjectSchema.parse(v7([
  {takeId:take,takeLeadSeconds:.1,takeOffsetSeconds:.4},
  {takeId:take,sourceOffset:.25},
  {takeId:take,sampleSpeed:2,takeLeadSeconds:.5,takeOffsetSeconds:1,sourceOffset:.25,sourceSampleId:take,warpSourceId:take},
  {takeId:take},
  {sourceOffset:1,sampleSpeed:2,takeLeadSeconds:3},
 ]));
 assert.equal(project.version,8);
 const [recorded,shifted,fast,plain,pattern]=project.clips;
 assert.deepEqual(recorded.anchors,[{source:.4,beat:.2}]);
 assert.deepEqual(shifted.anchors,[{source:.5,beat:0}]);
 assert.deepEqual(fast.anchors,[{source:1,beat:0}]);
 assert.equal('anchors' in plain,false);
 assert.deepEqual(pattern,{id:'c4',tabId:'pattern-1',trackId:'t',start:0,length:4,muted:false,sourceOffset:1});
 for(const clip of project.clips)for(const key of ['sampleSpeed','takeLeadSeconds','takeOffsetSeconds','sourceSampleId','warpSourceId'])assert.equal(key in clip,false,`${clip.id} keeps ${key}`);
 assert.equal('sourceOffset' in recorded,false);
});
test('v8 rejects unordered anchors and anchors on pattern clips, and new projects are v8',()=>{
 assert.throws(()=>ClipSchema.parse({id:'a',tabId:'a',trackId:'a',start:0,length:1,muted:false,takeId:take,anchors:[{source:1,beat:1},{source:2,beat:1}]}));
 assert.throws(()=>ClipSchema.parse({id:'a',tabId:'a',trackId:'a',start:0,length:1,muted:false,takeId:take,anchors:[]}));
 const ok=ProjectSchema.parse({...v7([{takeId:take,anchors:[{source:0,beat:1},{source:1,beat:2}]}]),version:8});
 assert.deepEqual(ok.clips[0].anchors,[{source:0,beat:1},{source:1,beat:2}]);
 assert.equal(ProjectV8Schema.safeParse({...v7([{anchors:[{source:0,beat:0}]}]),version:8}).success,false);
 assert.equal(newProject().version,8);
 assert.equal(ProjectSchema.parse({...newProject(),version:3}).version,8);
});
