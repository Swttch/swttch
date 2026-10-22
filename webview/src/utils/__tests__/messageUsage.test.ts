import { describe, expect, it } from 'vitest';
import { mergeMessageUsage, totalMessageTokens } from '../messageUsage';

describe('totalMessageTokens', () => {
  it('adds input, cache and output tokens', () => {
    expect(totalMessageTokens({
      input_tokens: 2,
      cache_creation_input_tokens: 150,
      cache_read_input_tokens: 59791,
      output_tokens: 227,
    })).toBe(60170);
  });

  it('reads a missing field as zero', () => {
    expect(totalMessageTokens({ input_tokens: 5 })).toBe(5);
    expect(totalMessageTokens({})).toBe(0);
  });
});

describe('mergeMessageUsage', () => {
  it('lets the real message_delta replace a gateway\'s zeroed message_start (#585)', () => {
    // Captured from the report: all-zero message_start, real numbers in message_delta.
    const start = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const delta = { input_tokens: 9525, output_tokens: 33, cache_read_input_tokens: 1024 };
    const merged = mergeMessageUsage(start, delta);
    expect(totalMessageTokens(start)).toBe(0);
    expect(totalMessageTokens(merged)).toBe(9525 + 33 + 1024);
  });

  it('keeps the input counts of a direct API message_start and takes the final output', () => {
    // Measured on CLI 2.1.308 against the API directly.
    const start = { input_tokens: 2, cache_creation_input_tokens: 150, cache_read_input_tokens: 59791, output_tokens: 2 };
    const delta = { output_tokens: 227 };
    expect(totalMessageTokens(mergeMessageUsage(start, delta))).toBe(2 + 150 + 59791 + 227);
  });

  it('never shrinks a field', () => {
    expect(mergeMessageUsage({ output_tokens: 80 }, { output_tokens: 10 }).output_tokens).toBe(80);
  });

  it('accepts a missing side', () => {
    expect(mergeMessageUsage(null, { input_tokens: 3 })).toEqual({ input_tokens: 3 });
    expect(mergeMessageUsage({ input_tokens: 3 }, undefined)).toEqual({ input_tokens: 3 });
    expect(mergeMessageUsage(null, null)).toEqual({});
  });
});
