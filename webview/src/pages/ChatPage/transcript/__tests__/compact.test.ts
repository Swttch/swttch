import { describe, it, expect } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import { compactSavedTokens, isCliNotice, isCompactBoundary, isCompactSummaryEntry } from '../compact';

const entry = (fields: Record<string, unknown>) => fields as unknown as LoadedMessageDto;

describe('compactSavedTokens', () => {
  const boundary = (compactMetadata: Record<string, unknown>) =>
    entry({ type: 'system', subtype: 'compact_boundary', compactMetadata });

  it('is what this compaction dropped, not the running total (the second compaction of a session)', () => {
    expect(compactSavedTokens(boundary({ preTokens: 355503, postTokens: 27142, cumulativeDroppedTokens: 510016 }))).toBe(328361);
  });

  it('falls back to the running total when the before and after counts are missing', () => {
    expect(compactSavedTokens(boundary({ cumulativeDroppedTokens: 181655 }))).toBe(181655);
  });

  it('is unknown without any metadata', () => {
    expect(compactSavedTokens(entry({ type: 'system', subtype: 'compact_boundary' }))).toBeUndefined();
  });
});

describe('what a compaction leaves in the record', () => {
  it('knows the boundary', () => {
    expect(isCompactBoundary(entry({ type: 'system', subtype: 'compact_boundary' }))).toBe(true);
    expect(isCompactBoundary(entry({ type: 'system', subtype: 'informational' }))).toBe(false);
  });

  it('knows the summary by its flag and by its opening words', () => {
    expect(isCompactSummaryEntry(entry({ type: 'user', isCompactSummary: true }))).toBe(true);
    const opening = 'This session is being continued from a previous conversation that ran out of context.';
    expect(isCompactSummaryEntry(entry({ type: 'user', message: { role: 'user', content: opening } }))).toBe(true);
    expect(isCompactSummaryEntry(entry({ type: 'user', message: { role: 'user', content: 'hello' } }))).toBe(false);
  });

  it('knows a notice by what it says', () => {
    expect(isCliNotice(entry({ type: 'system', subtype: 'informational', content: 'Compacted using a summary' }))).toBe(true);
    expect(isCliNotice(entry({ type: 'system', subtype: 'informational', content: '  ' }))).toBe(false);
  });
});
