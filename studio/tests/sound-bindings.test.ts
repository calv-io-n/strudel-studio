import test from 'node:test';
import assert from 'node:assert/strict';
import { soundBindings,bindingAt,replaceBinding } from '../shared/sound-bindings';
test('named chop references resolve to one declaration without changing shared sounds or rhythm',()=>{
 const code='const opening = s("voice").gain(.4)\nconst lift = s("voice")\n$: stack(opening.struct("0 1"),lift.struct("1 0"))';
 const binding=bindingAt(code,code.indexOf('opening.struct'))!;
 assert.equal(binding.id,'const:opening');assert.equal(binding.sound,'voice');
 const change=replaceBinding(code,binding.id,'voice','studio_abc');
 const next=code.slice(0,change.from)+change.insert+code.slice(change.to);
 assert.equal(next,code.replace('s("voice").gain','s("studio_abc").gain'));
 assert.equal(soundBindings(next).find(b=>b.id==='const:lift')?.sound,'voice');
 assert.throws(()=>replaceBinding(code,binding.id,'other','new'),/destination changed/);
});
test('sound destinations exclude comments, dynamic sounds, mini rhythms and shadowed function uses',()=>{
 const code='// s("bad")\nconst opening=s("voice"); function f(opening){return opening.struct("1")}\nconst a="s(\\"bad\\")"; $: s("a b"); $: s(name);';
 const bindings=soundBindings(code);assert.equal(bindings.length,1);
 assert.equal(bindingAt(code,code.indexOf('opening.struct')),undefined);
 assert.equal(soundBindings('const incomplete = s(').length,0);
 assert.equal(soundBindings('s("voice")')[0].sound,'voice');
});
