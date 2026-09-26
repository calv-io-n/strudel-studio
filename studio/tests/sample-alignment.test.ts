import test from 'node:test';
import assert from 'node:assert/strict';
import { beatSeconds, snapToBeat, stretchRegion } from '../shared/sample-alignment';
import { decodeWav, encodeWav } from '../shared/wav';

test('beat grid respects an offset downbeat and fractional beat snapping',()=>{
 assert.equal(beatSeconds(120),.5);
 assert.equal(snapToBeat(.83,120,.1,1),.6);
 assert.equal(snapToBeat(.83,120,.1,.5),.85);
 assert.equal(snapToBeat(.83,120,.1,0),.83);
 for(const bpm of [0,NaN,301])assert.throws(()=>beatSeconds(bpm));
});
test('pitch-preserving stretch has exact duration, stereo relationship and stable fundamental',async()=>{
 const rate=48000,left=Float32Array.from({length:rate*2},(_,i)=>Math.sin(2*Math.PI*220*i/rate)*.3),right=Float32Array.from(left,v=>-.5*v);
 const source=decodeWav(new Uint8Array(encodeWav(left,right,rate,{format:'float32'}).buffer));
 for(const ratio of [.75,1.5]){
  const frames=Math.round(left.length*ratio),decoded=decodeWav(new Uint8Array(await stretchRegion(source,0,left.length,frames)));
  assert.equal(decoded.rate,rate);assert.equal(decoded.left.length,frames);
  for(let i=0;i<frames;i+=73)assert.ok(Math.abs(decoded.right[i]+decoded.left[i]*.5)<1e-6);
  const segment=decoded.left.subarray(12000,36000);
  const power=(hz:number)=>{let re=0,im=0;for(let i=0;i<segment.length;i++){re+=segment[i]*Math.cos(2*Math.PI*hz*i/rate);im+=segment[i]*Math.sin(2*Math.PI*hz*i/rate);}return re*re+im*im;};
  let best=0,frequency=0;for(let hz=205;hz<=235;hz++){const value=power(hz);if(value>best){best=value;frequency=hz;}}
  assert.ok(Math.abs(frequency-220)<=1,`fundamental ${frequency} Hz at ratio ${ratio}`);
  assert.ok(decoded.left.slice(-4800,-480).some(v=>Math.abs(v)>.1),'tail audio retained');
 }
 await assert.rejects(()=>stretchRegion(source,0,left.length,left.length*3),/half and twice/);
});
