import { describe, it, expect, afterEach } from 'vitest';
import { readingLineSectionKey } from '../SendIndex/readingLine';
import { readingLineInset, SEND_JUMP_SCROLL_MARGIN } from '../SendIndex/scrollToSend';
import { TOP_BAR_HEIGHT } from '@/contexts/TopBarContext';
import { ZOOM_RECTS_ATTRIBUTE } from '@/utils/zoomRects';

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.style.zoom = '';
  document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
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

  it.each([
    [2, 'scaled'],
    [3, 'scaled'],
    [2, 'layout'],
  ] as const)('names the send a jump has just landed on at zoom %s with %s rectangles (#747)', (zoom, rects) => {
    document.documentElement.style.zoom = String(zoom);
    document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, rects);
    const unit = rects === 'scaled' ? zoom : 1;
    // A jump leaves the sentinel its scroll margin below the top edge, a layout length.
    transcript({ a: -300, b: SEND_JUMP_SCROLL_MARGIN * unit });

    expect(readingLineSectionKey(TOP_BAR_HEIGHT)).toBe('b');
  });

  // A banner above the chat (not signed in, notifications) pushes the whole chat down the window. Counted from the
  // top of the window, a jump then landed below the line and the rail named the send before.
  it('measures the line from the top of the chat, wherever the chat begins', () => {
    transcript({ a: -300, b: 55 + SEND_JUMP_SCROLL_MARGIN });
    const chat = document.createElement('div');
    chat.setAttribute('data-chat-scroll', '');
    chat.getBoundingClientRect = () => ({ top: 55 }) as DOMRect;
    chat.append(...Array.from(document.body.children));
    document.body.append(chat);

    expect(readingLineSectionKey(TOP_BAR_HEIGHT)).toBe('b');
  });
});
