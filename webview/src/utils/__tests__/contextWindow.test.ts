import { describe, it, expect } from 'vitest';
import {
  calculateAutoCompactRemainingPercent,
  calculateContextWindowPercent,
  contextWindowFromReport,
  formatTokenCount,
} from '../contextWindow';

describe('contextWindowFromReport', () => {
  const REPORT = `## Context Usage

**Model:** claude-sonnet-5-5
**Tokens:** 43.3k / 1m (4%)

### Estimated usage by category

| Category | Tokens | Percentage |
|----------|--------|------------|
| System prompt | 2.4k | 0.2% |
| Free space | 941.7k | 94.2% |
`;

  it('reads the window out of the Tokens line of a /context report', () => {
    expect(contextWindowFromReport(REPORT)).toBe(1_000_000);
    expect(contextWindowFromReport(REPORT.replace('/ 1m', '/ 200k').replace('1m', '200k'))).toBe(200_000);
  });

  it('answers null for text that is not a report', () => {
    expect(contextWindowFromReport('hello')).toBeNull();
    expect(contextWindowFromReport('')).toBeNull();
  });
});

describe('calculateContextWindowPercent', () => {
  it('divides by the whole window and cuts off after the requested decimals (#490)', () => {
    expect(calculateContextWindowPercent(883_277, 1_000_000, 1)).toBe(88.3);
    expect(calculateContextWindowPercent(883_277, 1_000_000, 0)).toBe(88);
  });

  it('never rounds up', () => {
    expect(calculateContextWindowPercent(66_299, 1_000_000, 1)).toBe(6.6);
    expect(calculateContextWindowPercent(999_999, 1_000_000, 1)).toBe(99.9);
  });

  it('does not lose a whole step to float division', () => {
    expect(calculateContextWindowPercent(290_000, 1_000_000, 0)).toBe(29);
    expect(calculateContextWindowPercent(70_000, 1_000_000, 1)).toBe(7);
  });

  it('caps at 100 and tolerates an unknown window', () => {
    expect(calculateContextWindowPercent(1_200_000, 1_000_000, 1)).toBe(100);
    expect(calculateContextWindowPercent(5_000, 0, 1)).toBe(0);
  });
});

describe('calculateAutoCompactRemainingPercent', () => {
  it('is 0 once the usable budget is spent, even while the window itself is not full', () => {
    // 1M window, 128k reserved for output, 13k overhead: 859k usable.
    expect(calculateAutoCompactRemainingPercent(883_277, 1_000_000, 128_000)).toBe(0);
    expect(calculateContextWindowPercent(883_277, 1_000_000, 1)).toBe(88.3);
  });

  it('cuts the remaining share off rather than rounding it up', () => {
    // 5k of 987k usable is 0.5% used, so 99.49% remains and reads as 99.
    expect(calculateAutoCompactRemainingPercent(5_000, 1_000_000, 0)).toBe(99);
    expect(calculateAutoCompactRemainingPercent(0, 1_000_000, 0)).toBe(100);
  });
});

describe('formatTokenCount', () => {
  it('keeps one decimal for thousands and drops a trailing .0', () => {
    expect(formatTokenCount(66_200)).toBe('66.2k');
    expect(formatTokenCount(81_000)).toBe('81k');
    expect(formatTokenCount(81_099)).toBe('81k');
  });

  it('keeps two decimals for millions', () => {
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(1_050_000)).toBe('1.05M');
  });

  it('cuts off instead of rolling over to 1000k', () => {
    expect(formatTokenCount(999_999)).toBe('999.9k');
  });

  it('prints small counts as they are', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(950)).toBe('950');
  });
});
