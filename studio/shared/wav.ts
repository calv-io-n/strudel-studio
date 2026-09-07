export function encodeWav(left: Float32Array, right: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + left.length * 4), view = new DataView(buffer);
  const word = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, left.length * 4, true);
  let clipped = 0;
  for (let i = 0; i < left.length; i++) for (let channel = 0; channel < 2; channel++) {
    const sample = (channel ? right : left)[i];
    if (Math.abs(sample) > 1) clipped++;
    const value = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    view.setInt16(44 + i * 4 + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return { buffer, clipped };
}
