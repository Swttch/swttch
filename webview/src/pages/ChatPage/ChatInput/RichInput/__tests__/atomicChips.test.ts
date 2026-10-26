import { describe, expect, it } from 'vitest';
import { elementToken } from '@/utils/composerElements';
import { atomicKeyResult, elementChipRanges, snapOutOfChip } from '../atomicChips';

const token = elementToken('h1', 'Title');
const text = `ab${token} cd`;
const ranges = elementChipRanges(text, [token, 'plain token']);
const { start, end } = ranges[0];

describe('atomicChips', () => {
  it('finds element chips only', () => {
    expect(ranges).toEqual([{ start: 2, end: 2 + token.length }]);
  });

  it('steps over a chip whole', () => {
    expect(atomicKeyResult('ArrowLeft', end, ranges)).toEqual({ kind: 'caret', offset: start });
    expect(atomicKeyResult('ArrowRight', start, ranges)).toEqual({ kind: 'caret', offset: end });
    expect(atomicKeyResult('ArrowLeft', start, ranges)).toBeNull();
    expect(atomicKeyResult('ArrowRight', end, ranges)).toBeNull();
  });

  it('removes a chip whole with one deletion', () => {
    expect(atomicKeyResult('Backspace', end, ranges)).toEqual({ kind: 'remove', range: ranges[0] });
    expect(atomicKeyResult('Delete', start, ranges)).toEqual({ kind: 'remove', range: ranges[0] });
    expect(atomicKeyResult('Backspace', start, ranges)).toBeNull();
  });

  it('moves a caret that landed inside to the nearer edge', () => {
    expect(snapOutOfChip(start + 1, ranges)).toBe(start);
    expect(snapOutOfChip(end - 1, ranges)).toBe(end);
    expect(snapOutOfChip(start, ranges)).toBeNull();
  });
});
