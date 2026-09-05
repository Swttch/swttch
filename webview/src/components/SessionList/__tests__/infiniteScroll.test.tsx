import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SessionList } from '../index';
import { SessionGroup, GroupedSessions } from '../utils';
import { SessionMetaDto } from '@/dto';

vi.mock('@/contexts/WorkingDirContext', () => ({
  useWorkingDirOrNull: () => ({ rootDir: '/repo' }),
}));

function session(id: string): SessionMetaDto {
  return {
    id,
    title: id,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    messageCount: null,
    isSidechain: false,
    sessionDir: '/repo',
  } as unknown as SessionMetaDto;
}

function grouped(ids: string[]): GroupedSessions {
  return {
    [SessionGroup.Today]: ids.map(session),
    [SessionGroup.Yesterday]: [],
    [SessionGroup.PastWeek]: [],
    [SessionGroup.PastMonth]: [],
    [SessionGroup.PastYear]: [],
  };
}

/**
 * jsdom reports every box as 0x0, so the metrics the loader reads have to be
 * stated explicitly. These stub the three it looks at.
 */
function stubMetrics(metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number }) {
  const original = {
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return metrics.clientHeight;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return metrics.scrollHeight;
    },
  });
  return () => {
    if (original.clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original.clientHeight);
    if (original.scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original.scrollHeight);
  };
}

describe('SessionList infinite scroll', () => {
  let restore: (() => void) | null = null;

  const baseProps = {
    currentSessionId: null,
    onSelectSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRenameSession: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restore?.();
    restore = null;
  });

  // The closed dropdown renders this list before it is opened. A box with no
  // height reports scrollHeight 0 too, which reads as "the rows do not fill the
  // box" — and the loader would then fetch page after page for a list nobody is
  // looking at. Measured doing exactly that: offset ran 31 → 125 → 156 with no
  // scrolling at all.
  it('requests nothing while the list has no height', () => {
    restore = stubMetrics({ clientHeight: 0, scrollHeight: 0 });
    const onLoadMore = vi.fn();

    render(<SessionList {...baseProps} groupedSessions={grouped(['a', 'b'])} hasMore onLoadMore={onLoadMore} />);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('requests the next page when the rows do not fill a visible list', () => {
    // Laid out, but the rows are shorter than the box: there is nothing to
    // scroll, so waiting for a scroll would strand the rest of the list.
    restore = stubMetrics({ clientHeight: 300, scrollHeight: 120 });
    const onLoadMore = vi.fn();

    render(<SessionList {...baseProps} groupedSessions={grouped(['a'])} hasMore onLoadMore={onLoadMore} />);

    expect(onLoadMore).toHaveBeenCalled();
  });

  it('requests nothing while the rows still extend well past the fold', () => {
    restore = stubMetrics({ clientHeight: 300, scrollHeight: 5000 });
    const onLoadMore = vi.fn();

    render(<SessionList {...baseProps} groupedSessions={grouped(['a', 'b'])} hasMore onLoadMore={onLoadMore} />);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('requests the next page once the scroll nears the end', () => {
    restore = stubMetrics({ clientHeight: 300, scrollHeight: 5000 });
    const onLoadMore = vi.fn();

    const { container } = render(
      <SessionList {...baseProps} groupedSessions={grouped(['a', 'b'])} hasMore onLoadMore={onLoadMore} />,
    );
    expect(onLoadMore).not.toHaveBeenCalled();

    const box = container.querySelector('.overflow-y-auto');
    expect(box).toBeTruthy();
    Object.defineProperty(box!, 'scrollTop', { configurable: true, value: 4700 });
    fireEvent.scroll(box!);

    expect(onLoadMore).toHaveBeenCalled();
  });

  it('requests nothing when there is nothing left to fetch', () => {
    restore = stubMetrics({ clientHeight: 300, scrollHeight: 120 });
    const onLoadMore = vi.fn();

    render(<SessionList {...baseProps} groupedSessions={grouped(['a'])} hasMore={false} onLoadMore={onLoadMore} />);

    expect(onLoadMore).not.toHaveBeenCalled();
  });
});
