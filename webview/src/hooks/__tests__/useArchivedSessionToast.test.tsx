import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import toast from 'react-hot-toast';
import type { SessionMetaDto } from '@/dto';

vi.mock('react-hot-toast', () => ({ default: vi.fn() }));
vi.mock('@/i18n', () => ({
  i18n: { t: (key: string, opts?: { title?: string }) => (opts?.title ? `${key}:${opts.title}` : key) },
}));

import { useArchivedSessionToast } from '../useArchivedSessionToast';

const row = (id: string, title: string, archivedAt = 0): SessionMetaDto =>
  ({ id, title, sessionMark: { id, archivedAt, desktopArchived: false } }) as unknown as SessionMetaDto;

describe('useArchivedSessionToast', () => {
  beforeEach(() => vi.mocked(toast).mockClear());

  it('is silent while the list loads, and speaks once when a session gets archived', () => {
    const { rerender } = renderHook(({ rows }) => useArchivedSessionToast(rows), {
      initialProps: { rows: [] as SessionMetaDto[] },
    });
    rerender({ rows: [row('a', 'Alpha'), row('b', 'Beta', 4)] });
    expect(toast).not.toHaveBeenCalled();

    rerender({ rows: [row('a', 'Alpha', 9), row('b', 'Beta', 4)] });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('common:sessionList.archivedToast:Alpha');

    rerender({ rows: [row('a', 'Alpha', 9), row('b', 'Beta', 4)] });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('speaks when a session is brought back', () => {
    const { rerender } = renderHook(({ rows }) => useArchivedSessionToast(rows), {
      initialProps: { rows: [row('a', 'Alpha', 9)] },
    });
    rerender({ rows: [row('a', 'Alpha', -1)] });
    expect(toast).toHaveBeenCalledWith('common:sessionList.unarchivedToast:Alpha');
  });

  it('says it without a title when the session has none', () => {
    const { rerender } = renderHook(({ rows }) => useArchivedSessionToast(rows), {
      initialProps: { rows: [row('a', '')] },
    });
    rerender({ rows: [row('a', '', 9)] });
    expect(toast).toHaveBeenCalledWith('common:sessionList.archivedToastUntitled');
  });
});
