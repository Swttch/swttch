import { describe, it, expect } from 'vitest';
import { formatFileSize } from '../formatFileSize';

describe('formatFileSize', () => {
  it.each([
    [0, '0B'],
    [999, '999B'],
    [1000, '1KB'],
    [25_000, '25KB'],
    [25_600, '25.6KB'],
    [1_460, '1.46KB'],
    [12_737_862, '12.7MB'],
    [123_456_789, '123MB'],
    [1_460_000_000, '1.46GB'],
  ])('writes %i bytes as %s, the way the Finder does', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it('moves to the next unit when rounding reaches a thousand', () => {
    expect(formatFileSize(999_600)).toBe('1MB');
  });

  it('drops a trailing zero rather than writing 1.50MB', () => {
    expect(formatFileSize(1_500_000)).toBe('1.5MB');
  });
});
