import test from 'node:test';
import assert from 'node:assert/strict';
import { singleSampleId, samplePlacement } from '../shared/sample-placement';
import { AssetSchema, newProject } from '../shared/model';
const id='00000000-0000-4000-8000-000000000001', sound=`studio_${id.replaceAll('-','')}`;
test('single sample placements cover the complete natural duration and play once',()=>{
 const tab={...newProject().tabs[0],code:`setcpm(120/4)\n$: s("${sound}").slow(4.408254).gain(slider(.7,0,1))`};
 const asset=AssetSchema.parse({id,createdAt:'',duration:8.8165079365,format:'wav',provider:'upload'});
 assert.equal(singleSampleId(tab.code),id);
 assert.deepEqual(samplePlacement(tab,[asset],120),{length:4.5,takeId:id,playback:'once'});
 assert.deepEqual(samplePlacement({...tab,audioAssetId:id},[asset],172),{length:6.5,takeId:id});
});
test('transformed and multi-voice patterns are never silently converted to one-shot audio',()=>{
 for(const code of [`s("${sound}").slice(8,"0 2")`,`s("${sound}").speed(2)`,`s("${sound}*2")`,`s("${sound}").struct("1 0")`,`$: s("${sound}")\n$: s("sbd")`,`s("${sound}").slow("2 4")`,`s("${sound}").gain(sine)`])assert.equal(singleSampleId(code),undefined,code);
});
