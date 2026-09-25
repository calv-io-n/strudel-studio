import { SAMPLE_LIMIT, validateRegion, type EditableAudio } from './sample-edit';
import { encodeWav } from './wav';
export function beatSeconds(bpm: number) {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error('Choose a tempo from 20 to 300 BPM.');
  return 60 / bpm;
}
export function snapToBeat(seconds: number, bpm: number, firstBeat: number, division: number) {
  const beat = beatSeconds(bpm);
  if (!Number.isFinite(firstBeat) || firstBeat < 0 || ![0, 1, .5, .25].includes(division)) throw new Error('Invalid beat grid.');
  return division ? firstBeat + Math.round((seconds - firstBeat) / (beat * division)) * beat * division : seconds;
}
/** Stereo-linked SoundTouch WSOLA. Exact frame length, unchanged sample rate and pitch. */
export async function stretchRegion(audio: EditableAudio, start: number, end: number, frames: number, fadeEdges = true) {
  validateRegion(start,end,audio.left.length);
  const count=end-start, ratio=frames/count;
  if (!Number.isInteger(frames) || frames < 1 || frames * audio.channels * 4 + 56 > SAMPLE_LIMIT) throw new Error('Fitted audio exceeds the 64 MB sample limit.');
  if (count/audio.rate > 60 || frames/audio.rate > 120) throw new Error('Stretch selections up to 60 seconds, with output up to 120 seconds.');
  if (ratio < .5 - 1e-6 || ratio > 2 + 1e-6) throw new Error('Choose a target between half and twice the original duration.');
  const left=new Float32Array(frames),right=new Float32Array(frames);
  if (frames===count) { left.set(audio.left.subarray(start,end));right.set(audio.right.subarray(start,end)); }
  else {
    const { Stretch } = await import('@soundtouchjs/core');
    const stretch=new Stretch({sampleRate:audio.rate,createBuffers:true});stretch.tempo=count/frames;
    stretch.setStretchParameters({sequenceMs:60,seekWindowMs:20,overlapMs:12,quickSeek:false});
    const block=new Float32Array(8192), zeros=new Float32Array(Math.ceil(audio.rate*.5)*2);
    let read=0,written=0;
    const drain=()=>{const buffer=stretch.outputBuffer!;while(buffer.frameCount && written<frames){const n=Math.min(4096,buffer.frameCount,frames-written);buffer.extract(block,0,n);buffer.receive(n);for(let i=0;i<n;i++){left[written+i]=block[i*2];right[written+i]=block[i*2+1];}written+=n;}};
    while(read<count){const n=Math.min(4096,count-read);for(let i=0;i<n;i++){block[i*2]=audio.left[start+read+i];block[i*2+1]=audio.right[start+read+i];}stretch.inputBuffer!.putSamples(block,0,n);stretch.process();drain();read+=n;}
    // Flush the overlap/look-ahead buffers; only the requested number of frames is retained.
    for(let i=0;written<frames&&i<4;i++){stretch.inputBuffer!.putSamples(zeros);stretch.process();drain();}
    if(written!==frames)throw new Error('Time stretching did not produce the complete selection.');
  }
  const fade=fadeEdges?Math.min(Math.round(audio.rate*.005),Math.floor(frames/4)):0;
  for(let i=0;i<fade;i++){const gain=.5-.5*Math.cos(Math.PI*i/fade);left[i]*=gain;right[i]*=gain;left[frames-1-i]*=gain;right[frames-1-i]*=gain;}
  return encodeWav(left,right,audio.rate,{format:'float32',channels:audio.channels as 1|2}).buffer;
}
