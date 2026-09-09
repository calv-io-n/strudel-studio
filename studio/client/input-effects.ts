import { compileAudioEffects, type AudioEffects } from '../shared/audio-input';
/** Fixed topology preserves delay/reverb state when a slider changes. */
export function createInputEffects(context: BaseAudioContext, code: string) {
  const input = context.createGain(), high = context.createBiquadFilter(), low = context.createBiquadFilter(), pan = context.createStereoPanner(), output = context.createGain();
  high.type = 'highpass'; low.type = 'lowpass';
  const delay = context.createDelay(2), feedback = context.createGain(), delayWet = context.createGain(), room = context.createConvolver(), roomWet = context.createGain();
  const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 3), context.sampleRate); let seed = 23;
  for (let c = 0; c < 2; c++) { const data = impulse.getChannelData(c); for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = (seed / 2147483648 - 1) * (1 - i / data.length) ** 3; } }
  room.buffer = impulse;
  input.connect(high).connect(low).connect(pan).connect(output);
  pan.connect(delay); delay.connect(feedback).connect(delay); delay.connect(delayWet).connect(output);
  pan.connect(room).connect(roomWet).connect(output);
  let initial = true;
  const apply = (values: AudioEffects) => {
    const set = (param: AudioParam, value: number) => { const now = context.currentTime; if (initial) param.setValueAtTime(value, now); else param.setTargetAtTime(value, now, .01); };
    set(input.gain, values.gain); set(high.frequency, Math.min(context.sampleRate / 2, values.hpf)); set(low.frequency, Math.min(context.sampleRate / 2, values.lpf)); set(pan.pan, values.pan * 2 - 1);
    set(delay.delayTime, values.delaytime); set(feedback.gain, values.delayfeedback); set(delayWet.gain, values.delay); set(roomWet.gain, values.room); initial = false;
  };
  apply(compileAudioEffects(code));
  return { input, output, apply: (code: string) => apply(compileAudioEffects(code)), disconnect: () => [input, high, low, pan, output, delay, feedback, delayWet, room, roomWet].forEach(node => node.disconnect()) };
}
