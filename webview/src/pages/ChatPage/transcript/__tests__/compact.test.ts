import { describe, it, expect } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import { formatTokenCount, isCliNotice, isCompactBoundary, isCompactSummaryEntry } from '../compact';

const entry = (fields: Record<string, unknown>) => fields as unknown as LoadedMessageDto;

describe('formatTokenCount', () => {
  it('writes thousands with one decimal and a k', () => {
    expect(formatTokenCount(828311)).toBe('828.3k');
    expect(formatTokenCount(950)).toBe('950');
    expect(formatTokenCount(1250000)).toBe('1.3M');
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
