import { describe, it, expect, afterEach } from 'vitest';
import { readingLineSectionKey } from '../SendIndex/readingLine';
import { readingLineInset, SEND_JUMP_SCROLL_MARGIN } from '../SendIndex/scrollToSend';
import { TOP_BAR_HEIGHT } from '@/contexts/TopBarContext';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A transcript whose sends have their sentinels at the given distances from the top. */
function transcript(sentinelTops: Record<string, number>) {
  for (const [key, top] of Object.entries(sentinelTops)) {
    const section = document.createElement('div');
    section.setAttribute('data-send-section', key);
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-send-sentinel', '');
    sentinel.getBoundingClientRect = () => ({ top }) as DOMRect;
    section.append(sentinel);
    document.body.append(section);
  }
}

describe('readingLineInset', () => {
  it('sits just past where a jump lands a send, measured from the space the top bar takes', () => {
    expect(readingLineInset(TOP_BAR_HEIGHT)).toBe(TOP_BAR_HEIGHT + SEND_JUMP_SCROLL_MARGIN + 8);
  });

  it('moves up with the pinned edge when the top bar is hidden', () => {
    expect(readingLineInset(0)).toBe(SEND_JUMP_SCROLL_MARGIN + 8);
    expect(readingLineInset(TOP_BAR_HEIGHT) - readingLineInset(0)).toBe(TOP_BAR_HEIGHT);
  });
});

describe('readingLineSectionKey', () => {
  it('names the last send above the line', () => {
    transcript({ a: -300, b: 20, c: 400 });

    expect(readingLineSectionKey(TOP_BAR_HEIGHT)).toBe('b');
  });

  it('draws the line higher by the space the top bar takes when the bar is hidden', () => {
    // 90 is below the line with the bar hidden (72), so that send is not reached
    // yet, and above it with the bar drawn (112), so it is. The same scroll
    // position reads differently by exactly the space the bar takes.
    transcript({ a: -300, b: 90 });

    expect(readingLineSectionKey(TOP_BAR_HEIGHT)).toBe('b');
    expect(readingLineSectionKey(0)).toBe('a');
  });

  it('names nothing before the first send has reached the line', () => {
    transcript({ a: 500 });

    expect(readingLineSectionKey(TOP_BAR_HEIGHT)).toBeNull();
  });
});
