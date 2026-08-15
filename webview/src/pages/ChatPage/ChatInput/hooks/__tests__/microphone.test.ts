import { describe, it, expect } from 'vitest';
import { toPcm16, rmsLevel } from '../microphone';

/** Read back the little-endian 16-bit samples we just wrote. */
function samplesOf(pcm: Uint8Array): number[] {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return Array.from({ length: pcm.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true));
}

describe('toPcm16', () => {
  it('downsamples by the input:target ratio', () => {
    // 48 kHz in, 16 kHz out → one output sample per three input samples.
    const input = new Float32Array(300);
    expect(toPcm16(input, 48000).byteLength / 2).toBe(100);
  });

  it('passes audio through unchanged when already at 16 kHz', () => {
    const input = new Float32Array([0, 0.5, -0.5]);
    expect(samplesOf(toPcm16(input, 16000))).toEqual([0, 16383, -16384]);
  });

  it('writes little-endian, which is what the service reads', () => {
    const pcm = toPcm16(new Float32Array([1]), 16000);
    // 0x7FFF little-endian is FF 7F, not 7F FF.
    expect([pcm[0], pcm[1]]).toEqual([0xff, 0x7f]);
  });

  it('scales the negative range by 0x8000 so -1 maps to the true minimum', () => {
    expect(samplesOf(toPcm16(new Float32Array([-1]), 16000))).toEqual([-32768]);
  });

  it('clamps out-of-range samples instead of letting them wrap', () => {
    // Without clamping, 2.0 would overflow and come back as a large negative —
    // a click at full volume.
    expect(samplesOf(toPcm16(new Float32Array([2, -2]), 16000))).toEqual([32767, -32768]);
  });

  it('averages across the window rather than picking one sample', () => {
    // Decimation would keep 1.0 and drop the rest; averaging gives the mean of
    // the window, which is what keeps high frequencies from aliasing down.
    const pcm = toPcm16(new Float32Array([1, 0, -1, 0.5, 0.5, 0.5]), 48000);
    const [first, second] = samplesOf(pcm);
    expect(first).toBe(0);
    expect(second).toBeCloseTo(Math.round(0.5 * 0x7fff), -1);
  });

  it('produces an empty buffer for empty input', () => {
    expect(toPcm16(new Float32Array(0), 48000).byteLength).toBe(0);
  });
});

describe('rmsLevel', () => {
  it('is zero for silence', () => {
    expect(rmsLevel(new Float32Array(64))).toBe(0);
  });

  it('is one for a full-scale constant signal', () => {
    expect(rmsLevel(new Float32Array(64).fill(1))).toBeCloseTo(1);
  });

  it('ignores sign, so a negative swing reads as loud as a positive one', () => {
    expect(rmsLevel(new Float32Array([-1, -1]))).toBeCloseTo(1);
  });

  it('sits between the extremes for a partial signal', () => {
    const level = rmsLevel(new Float32Array(64).fill(0.5));
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(1);
  });
});
