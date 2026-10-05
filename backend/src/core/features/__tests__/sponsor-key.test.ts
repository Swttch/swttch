import { describe, it, expect } from 'vitest';
import { canonicalSponsorKey } from '../sponsor-key';

describe('canonicalSponsorKey', () => {
  it('takes the key www names', () => {
    expect(canonicalSponsorKey('CCG-REAL', 'AEEB8648-LS')).toBe('CCG-REAL');
  });

  it('trims the answer before storing it', () => {
    expect(canonicalSponsorKey('  CCG-REAL \n', 'AEEB8648-LS')).toBe('CCG-REAL');
  });

  it.each([undefined, '', '   '])('keeps the current key for the answer %j', (answered) => {
    expect(canonicalSponsorKey(answered, 'AEEB8648-LS')).toBe('AEEB8648-LS');
  });

  it('is a no-op when the current key already is the canonical one', () => {
    expect(canonicalSponsorKey('CCG-REAL', 'CCG-REAL')).toBe('CCG-REAL');
  });
});
